import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import {
  HOUR_MS,
  buildWindGridUrl,
  fieldAt,
  gridSpecFor,
  needsNewGrid,
  parseWindGrid,
  sampleField,
  windFromUV,
  type Bounds,
  type GridSpec,
  type WindField,
  type WindGrid,
} from '@gpsm/shared'
import { clampHour, currentHourMs, daysInRange, selectableRange, sameLocalTimeOnDay, type DayChip, type HourRange } from '@/logic/windTime'
import { useDatabaseStore } from './database'
import { useMapStore } from './map'

const ENABLED_KEY = 'layers.wind'
/** Días de pronóstico que se piden (la grilla trae todas las horas: cambiar de hora no usa la red). */
export const WIND_DAYS = 4
/** Espera tras dejar de mover el mapa antes de pedir una grilla nueva. */
const DEBOUNCE_MS = 450
/** Velocidad de la reproducción: una hora de pronóstico por tick. */
const PLAY_MS = 700

export type WindError = 'offline' | 'http' | 'incomplete' | null

/**
 * Capa de viento: pronóstico horario de Open-Meteo en una grilla de ~48 puntos sobre lo visible. Se enciende desde el
 * panel de capas y, con la capa visible, se elige la fecha y la hora a mostrar. Sin conexión se usa la última grilla
 * (en memoria) o la respuesta guardada por el service worker, y se avisa de qué hora es el pronóstico.
 */
export const useWindStore = defineStore('wind', () => {
  const database = useDatabaseStore()
  const mapStore = useMapStore()

  const enabled = ref(false)
  const grid = shallowRef<WindGrid | null>(null)
  const loading = ref(false)
  const error = ref<WindError>(null)
  /** Hora mostrada (ms UTC, en punto). */
  const hourMs = ref(currentHourMs(Date.now()))
  const playing = ref(false)
  /** Reloj propio: la hora actual cambia mientras la app está abierta. */
  const now = ref(Date.now())

  let controller: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let playTimer: ReturnType<typeof setInterval> | undefined
  let lastView: Bounds | null = null
  setInterval(() => (now.value = Date.now()), 60_000)

  async function load() {
    enabled.value = await (await database.ready()).settings.get(ENABLED_KEY, false)
  }
  async function setEnabled(v: boolean) {
    enabled.value = v
    if (!v) stopPlaying()
    await (await database.ready()).settings.set(ENABLED_KEY, v)
    if (v && lastView) scheduleRequest(lastView, true)
  }

  const range = computed<HourRange | null>(() => (grid.value ? selectableRange(grid.value, now.value) : null))
  const days = computed<DayChip[]>(() => (range.value ? daysInRange(range.value) : []))
  const field = computed<WindField | null>(() => (grid.value && enabled.value ? fieldAt(grid.value, hourMs.value) : null))
  const isNow = computed(() => hourMs.value === currentHourMs(now.value))
  const index = computed(() => (range.value ? Math.round((hourMs.value - range.value.min) / HOUR_MS) : 0))
  const count = computed(() => (range.value ? Math.round((range.value.max - range.value.min) / HOUR_MS) + 1 : 0))

  /** Viento en el centro del mapa (donde está el cursor) a la hora mostrada. */
  const atCenter = computed(() => {
    const f = field.value
    if (!f) return null
    const w = sampleField(f, mapStore.center.lon, mapStore.center.lat)
    return w ? windFromUV(w.u, w.v) : null
  })
  /** El pronóstico mostrado se bajó hace más de 3 h: sin conexión puede ser de otro día. */
  const stale = computed(() => !!grid.value && now.value - grid.value.fetchedAt > 3 * HOUR_MS)

  function setHour(ms: number) {
    if (!range.value) return
    hourMs.value = clampHour(ms, range.value)
  }
  const goNow = () => range.value && setHour(currentHourMs(Date.now()))
  const step = (delta: number) => setHour(hourMs.value + delta * HOUR_MS)
  const setIndex = (i: number) => range.value && setHour(range.value.min + i * HOUR_MS)
  function setDay(d: DayChip) {
    if (range.value) hourMs.value = sameLocalTimeOnDay(hourMs.value, d, range.value)
  }

  function startPlaying() {
    if (!range.value || playing.value) return
    playing.value = true
    playTimer = setInterval(() => {
      const r = range.value
      if (!r) return stopPlaying()
      // Al llegar al final vuelve al comienzo del pronóstico (reproducción en bucle).
      hourMs.value = hourMs.value + HOUR_MS > r.max ? r.min : hourMs.value + HOUR_MS
    }, PLAY_MS)
  }
  function stopPlaying() {
    playing.value = false
    if (playTimer) clearInterval(playTimer)
    playTimer = undefined
  }
  const togglePlay = () => (playing.value ? stopPlaying() : startPlaying())

  async function request(view: Bounds) {
    const spec: GridSpec = gridSpecFor(view)
    controller?.abort()
    controller = new AbortController()
    const { signal } = controller
    loading.value = true
    try {
      const res = await fetch(buildWindGridUrl(spec, WIND_DAYS), { signal })
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { kind: 'http' })
      // La fecha de la respuesta dice cuándo se obtuvo: si salió del caché sin conexión, es la de la última vez.
      const fetchedAt = Date.parse(res.headers.get('date') ?? '') || Date.now()
      grid.value = parseWindGrid(await res.json(), spec, fetchedAt)
      error.value = null
      if (!range.value) return
      hourMs.value = clampHour(hourMs.value, range.value)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      // Se conserva la grilla anterior (si la hay): sigue siendo útil aunque no se pueda actualizar.
      const msg = (e as Error).message
      error.value = (e as { kind?: string }).kind === 'http' ? 'http' : msg === 'wind-grid-incomplete' ? 'incomplete' : 'offline'
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  function scheduleRequest(view: Bounds, immediate = false) {
    clearTimeout(timer)
    timer = setTimeout(() => void request(view), immediate || !grid.value ? 0 : DEBOUNCE_MS)
  }

  /** El mapa avisa cada vez que cambia la zona visible. Solo trabaja con la capa encendida. */
  function setView(view: Bounds) {
    lastView = view
    if (!enabled.value) return
    // Sin grilla nueva si lo visible sigue dentro de la actual (también sin conexión: no hay nada que pedir).
    if (grid.value && !needsNewGrid(grid.value.spec, view)) return
    scheduleRequest(view)
  }

  /** Reintenta (botón "Reintentar" cuando falló). */
  const retry = () => (lastView ? request(lastView) : Promise.resolve())

  // Al apagar la capa se corta todo lo que esté en curso.
  watch(enabled, (on) => {
    if (!on) {
      controller?.abort()
      loading.value = false
    }
  })

  return {
    enabled,
    grid,
    loading,
    error,
    hourMs,
    playing,
    range,
    days,
    field,
    isNow,
    index,
    count,
    atCenter,
    stale,
    load,
    setEnabled,
    setHour,
    goNow,
    step,
    setIndex,
    setDay,
    togglePlay,
    stopPlaying,
    setView,
    retry,
  }
})
