import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { DEFAULT_RECORD_RULES, shouldRecord, trackToGeoJson, trackToGpx, trackStats, type TrackPoint } from '@gpsm/shared'
import { i18n } from '@/i18n'
import { formatNumber } from '@/i18n/numbers'
import type { Track } from '@/repositories/tracks'
import { fileStamp, makeFile, shareOrDownload, MIME } from '@/services/files'
import { readTrackFile, trackNameFromFile } from '@/services/trackFiles'
import { useDatabaseStore } from './database'
import { useGpsStore } from './gps'
import { useToastStore } from './toast'

/** Puntos que se juntan en memoria antes de guardarlos en la base (menos escrituras = menos batería y desgaste). */
const FLUSH_COUNT = 10
const FLUSH_MS = 30_000

/**
 * Registro de derrota: graba la línea que recorre el buque mientras el GPS está activo. Los puntos se guardan en SQLite
 * por tandas; si la app se cierra grabando, lo ya guardado queda y la derrota se cierra al abrir otra vez.
 */
export const useTracksStore = defineStore('tracks', () => {
  const database = useDatabaseStore()
  const gps = useGpsStore()
  const toast = useToastStore()

  const list = ref<Track[]>([])
  const recording = ref<Track | null>(null)
  /** Puntos de la derrota en curso (todos, para dibujarla) y los que faltan guardar. */
  const activePoints = shallowRef<TrackPoint[]>([])
  let pending: TrackPoint[] = []
  let lastFlush = 0
  /** Puntos de las derrotas guardadas que se muestran en el mapa. */
  const saved = shallowRef(new Map<string, TrackPoint[]>())

  /** Derrota que se está reproduciendo en el mapa (el reproductor la dibuja aparte, por eso no sale en `drawn`). */
  const playingId = ref<string | null>(null)

  const repo = async () => (await database.ready()).tracks

  async function load() {
    const r = await repo()
    // Una derrota que quedó abierta (la app se cerró grabando) se cierra con su último punto.
    for (const t of await r.unfinished()) {
      const pts = await r.points(t.id)
      await r.finish(t.id, pts[pts.length - 1]?.t ?? t.startedAt)
    }
    list.value = await r.list()
    await loadVisible()
  }

  async function loadVisible() {
    const r = await repo()
    const next = new Map<string, TrackPoint[]>()
    for (const t of list.value) if (t.visible && t.id !== recording.value?.id) next.set(t.id, saved.value.get(t.id) ?? (await r.points(t.id)))
    saved.value = next
  }

  const defaultName = () => {
    const d = new Date()
    return i18n.global.t('tracks.defaultName', { date: d.toLocaleDateString(i18n.global.locale.value), time: d.toLocaleTimeString(i18n.global.locale.value, { hour: '2-digit', minute: '2-digit', hour12: false }) })
  }

  async function start() {
    if (recording.value) return
    if (!gps.active) gps.start()
    const t = await (await repo()).create(defaultName(), Date.now())
    recording.value = t
    activePoints.value = []
    pending = []
    lastFlush = Date.now()
    list.value = [t, ...list.value]
    toast.push(i18n.global.t('tracks.started'), { tone: 'success' })
  }

  async function flush() {
    const t = recording.value
    if (!t || !pending.length) return
    const batch = pending
    pending = []
    lastFlush = Date.now()
    await (await repo()).append(t.id, batch)
  }

  async function stop() {
    const t = recording.value
    if (!t) return
    await flush()
    const r = await repo()
    await r.finish(t.id, Date.now())
    recording.value = null
    const stats = trackStats(activePoints.value)
    // La derrota recién grabada pasa a la lista de guardadas (visible).
    activePoints.value = []
    list.value = await r.list()
    await loadVisible()
    toast.push(i18n.global.t('tracks.saved', { nm: formatNumber(stats.distanceNm, 2) }), { tone: 'success' })
  }

  // Cada posición nueva: se graba si cambió lo suficiente.
  watch(
    () => gps.current,
    (c) => {
      if (!recording.value || !c || gps.status !== 'fixed') return
      const p: TrackPoint = { t: c.t, lat: c.lat, lon: c.lon, speedKn: gps.speedKn, courseDeg: gps.courseDeg }
      const last = activePoints.value[activePoints.value.length - 1] ?? null
      if (!shouldRecord(last, p, c.accuracyM, DEFAULT_RECORD_RULES)) return
      activePoints.value = [...activePoints.value, p]
      pending.push(p)
      if (pending.length >= FLUSH_COUNT || Date.now() - lastFlush > FLUSH_MS) void flush()
    },
  )
  // Si se apaga el GPS, la derrota termina (no tiene sentido seguir grabando sin posiciones).
  watch(
    () => gps.active,
    (on) => {
      if (!on && recording.value) void stop()
    },
  )
  // Al ocultar la app se guarda lo pendiente (la pestaña puede morir en segundo plano).
  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush()
    })

  async function setVisible(id: string, visible: boolean) {
    await (await repo()).setVisible(id, visible)
    list.value = list.value.map((t) => (t.id === id ? { ...t, visible } : t))
    await loadVisible()
  }

  async function rename(id: string, name: string) {
    const n = name.trim()
    if (!n) return
    await (await repo()).rename(id, n)
    list.value = list.value.map((t) => (t.id === id ? { ...t, name: n } : t))
  }

  async function remove(id: string) {
    await (await repo()).remove(id)
    list.value = list.value.filter((t) => t.id !== id)
    await loadVisible()
  }

  /** Puntos de una derrota guardada (para reproducirla). */
  async function pointsOf(id: string): Promise<TrackPoint[]> {
    return (await repo()).points(id)
  }

  /**
   * Importa las derrotas de un archivo (GeoJSON, GPX o ZIP). Quedan guardadas y ocultas; el mapa las muestra al activarlas
   * o al reproducirlas. Devuelve las creadas y si traían horas propias.
   */
  async function importFile(file: File): Promise<{ tracks: Track[]; timed: boolean }> {
    const found = await readTrackFile(file)
    const r = await repo()
    const created: Track[] = []
    for (const f of found) {
      const name = f.name ?? trackNameFromFile(f.fileName)
      const first = f.points[0]!
      const t = await r.create(name, first.t)
      await r.append(t.id, f.points)
      await r.finish(t.id, f.points[f.points.length - 1]!.t)
      await r.setVisible(t.id, false)
      created.push(t)
    }
    list.value = await r.list()
    return { tracks: list.value.filter((t) => created.some((c) => c.id === t.id)), timed: found.every((f) => f.timed) }
  }

  async function exportGpx(track: Track): Promise<'shared' | 'cancelled' | 'downloaded'> {
    const pts = await (await repo()).points(track.id)
    const file = makeFile(trackToGpx(track.name, pts), `Derrota-${fileStamp(new Date(track.startedAt))}.gpx`, MIME.gpx)
    return shareOrDownload(file, track.name)
  }

  /** GeoJSON con hora, velocidad y rumbo de cada punto (se puede volver a importar sin perder nada). */
  async function exportGeoJson(track: Track): Promise<'shared' | 'cancelled' | 'downloaded'> {
    const pts = await (await repo()).points(track.id)
    const file = makeFile(trackToGeoJson(track.name, pts), `Derrota-${fileStamp(new Date(track.startedAt))}.geojson`, MIME.json)
    return shareOrDownload(file, track.name)
  }

  /** Líneas para el mapa: las guardadas visibles y la que se está grabando. */
  const drawn = computed(() => {
    const features = [...[...saved.value.entries()].filter(([id]) => id !== playingId.value), ...(recording.value ? [[recording.value.id, activePoints.value] as const] : [])]
      .filter(([, pts]) => pts.length >= 2)
      .map(([id, pts]) => ({
        type: 'Feature' as const,
        properties: { id, active: id === recording.value?.id },
        geometry: { type: 'LineString' as const, coordinates: pts.map((p) => [p.lon, p.lat] as [number, number]) },
      }))
    return { type: 'FeatureCollection' as const, features }
  })

  const activeStats = computed(() => trackStats(activePoints.value))

  return { list, recording, playingId, activePoints, activeStats, drawn, load, start, stop, setVisible, rename, remove, exportGpx, importFile, pointsOf, exportGeoJson }
})
