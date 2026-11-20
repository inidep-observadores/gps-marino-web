import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { cumulativeNm, defaultPlaybackSpeed, PLAYBACK_SPEEDS, positionAt, splitAt, type TrackPoint } from '@gpsm/shared'
import type { Track } from '@/repositories/tracks'
import { useTracksStore } from './tracks'

/** Con muchos puntos, dibujar en cada fotograma es caro: el mapa se actualiza a este ritmo como máximo. */
const FRAME_MS = 66

/**
 * Reproductor de derrotas: "ejecuta" una derrota guardada sobre el mapa. Una sola derrota activa a la vez. El tiempo de la
 * derrota avanza `speed` veces más rápido que el real; el slider permite saltar a cualquier instante. Mientras reproduce, el
 * mapa dibuja el buque, lo recorrido en línea continua y lo que falta punteado.
 */
export const useTrackPlayerStore = defineStore('trackPlayer', () => {
  const tracks = useTracksStore()

  const track = ref<Track | null>(null)
  const points = shallowRef<TrackPoint[]>([])
  const cum = shallowRef<number[]>([0])
  /** Instante actual de la derrota (ms UTC). */
  const t = ref(0)
  const playing = ref(false)
  const speed = ref<number>(PLAYBACK_SPEEDS[3])
  /** El mapa acompaña al buque mientras reproduce. */
  const follow = ref(true)
  const loading = ref(false)

  const t0 = computed(() => points.value[0]?.t ?? 0)
  const t1 = computed(() => points.value[points.value.length - 1]?.t ?? 0)
  const duration = computed(() => Math.max(0, t1.value - t0.value))
  /** Avance de 0 a 1 (para el slider). */
  const progress = computed(() => (duration.value > 0 ? (t.value - t0.value) / duration.value : 0))
  const position = computed(() => positionAt(points.value, cum.value, t.value))
  const split = computed(() => (position.value ? splitAt(points.value, position.value) : null))
  const totalNm = computed(() => cum.value[cum.value.length - 1] ?? 0)
  const atEnd = computed(() => duration.value > 0 && t.value >= t1.value)

  let raf = 0
  let last = 0
  let lastDraw = 0
  let pending = 0

  function loop(now: number) {
    pending += (now - last) * speed.value
    last = now
    if (now - lastDraw >= FRAME_MS) {
      lastDraw = now
      t.value = Math.min(t1.value, t.value + pending)
      pending = 0
      if (t.value >= t1.value) {
        pause()
        return
      }
    }
    raf = requestAnimationFrame(loop)
  }

  function play() {
    if (!track.value || playing.value) return
    if (atEnd.value) t.value = t0.value // al terminar, volver a tocar reinicia
    playing.value = true
    last = performance.now()
    lastDraw = 0
    pending = 0
    raf = requestAnimationFrame(loop)
  }
  function pause() {
    playing.value = false
    cancelAnimationFrame(raf)
  }
  const toggle = () => (playing.value ? pause() : play())

  /** Mueve el buque a una fracción (0–1) de la derrota. Si estaba reproduciendo, sigue desde ahí. */
  function seek(fraction: number) {
    t.value = t0.value + Math.min(1, Math.max(0, fraction)) * duration.value
    pending = 0
  }

  /** Salta a un instante dado (ms) de la derrota. */
  function seekTime(ms: number) {
    t.value = Math.min(t1.value, Math.max(t0.value, ms))
    pending = 0
  }

  function setSpeed(s: number) {
    speed.value = s
  }
  /** Una velocidad más rápida (+1) o más lenta (−1). */
  function stepSpeed(dir: 1 | -1) {
    const i = PLAYBACK_SPEEDS.indexOf(speed.value as (typeof PLAYBACK_SPEEDS)[number])
    const next = Math.min(PLAYBACK_SPEEDS.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))
    speed.value = PLAYBACK_SPEEDS[next]!
  }

  /** Activa una derrota (cierra la anterior): queda en su inicio, lista para reproducir. */
  async function open(id: string): Promise<boolean> {
    const found = tracks.list.find((x) => x.id === id)
    if (!found) return false
    pause()
    loading.value = true
    try {
      const pts = await tracks.pointsOf(id)
      if (pts.length < 2) return false
      track.value = found
      points.value = pts
      cum.value = cumulativeNm(pts)
      t.value = pts[0]!.t
      speed.value = defaultPlaybackSpeed(pts[pts.length - 1]!.t - pts[0]!.t)
      follow.value = true
      tracks.playingId = id
      return true
    } finally {
      loading.value = false
    }
  }

  function close() {
    pause()
    track.value = null
    points.value = []
    cum.value = [0]
    tracks.playingId = null
  }

  /** Si la derrota activa se borra o renombra, el reproductor lo refleja. */
  function sync() {
    if (!track.value) return
    const now = tracks.list.find((x) => x.id === track.value!.id)
    if (!now) close()
    else if (now.name !== track.value.name) track.value = now
  }

  watch(() => tracks.list, sync)

  return { track, points, t, playing, speed, follow, loading, t0, t1, duration, progress, position, split, totalNm, atEnd, play, pause, toggle, seek, seekTime, setSpeed, stepSpeed, open, close, sync }
})
