import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  DEFAULT_ARRIVAL_SETTINGS,
  etaMs,
  routeLegs,
  stepRoute,
  type ArrivalSettings,
  type RoutePoint,
} from '@gpsm/shared'
import { i18n } from '@/i18n'
import { showSystemNotification } from '@/services/notify'
import { useDatabaseStore } from './database'
import { useGpsStore } from './gps'
import { useToastStore } from './toast'

export const ARRIVAL_SETTINGS_KEY = 'route.arrival'

/**
 * Ruta activa y navegación hacia ella: tramos, distancias, ETA, avance automático y avisos de arribo.
 * La ruta se guarda en SQLite (`route_points`) para que una recarga no la pierda.
 */
export const useNavigationStore = defineStore('navigation', () => {
  const gps = useGpsStore()
  const database = useDatabaseStore()
  const toast = useToastStore()

  const route = ref<RoutePoint[]>([])
  const arrival = ref<ArrivalSettings>({ ...DEFAULT_ARRIVAL_SETTINGS })
  const loaded = ref(false)
  let lastNotifiedKey: string | null = null

  async function load() {
    const repos = await database.ready()
    route.value = await repos.route.get()
    arrival.value = { ...DEFAULT_ARRIVAL_SETTINGS, ...(await repos.settings.get(ARRIVAL_SETTINGS_KEY, {})) }
    loaded.value = true
  }

  async function persist() {
    await (await database.ready()).route.replace(route.value)
  }

  function setRoute(points: RoutePoint[]) {
    route.value = points
    lastNotifiedKey = null
    void persist()
  }

  /** Fija un único destino (reemplaza la ruta). */
  const setTarget = (p: RoutePoint) => setRoute([p])
  /** Agrega un punto al final de la ruta. */
  const append = (p: RoutePoint) => setRoute([...route.value, p])
  const removeAt = (i: number) => setRoute(route.value.filter((_, j) => j !== i))
  const clear = () => setRoute([])

  async function updateArrival(patch: Partial<ArrivalSettings>) {
    arrival.value = { ...arrival.value, ...patch }
    await (await database.ready()).settings.set(ARRIVAL_SETTINGS_KEY, arrival.value)
  }

  const fix = computed(() => {
    const c = gps.current
    return c ? { lat: c.lat, lon: c.lon, speedKn: gps.speedKn, courseDeg: gps.courseDeg } : null
  })

  const legs = computed(() => (fix.value ? routeLegs(fix.value, route.value) : []))
  const next = computed(() => route.value[0] ?? null)
  const final = computed(() => route.value[route.value.length - 1] ?? null)
  const nextLeg = computed(() => legs.value[0] ?? null)
  const totalNm = computed(() => (legs.value.length ? legs.value.reduce((a, l) => a + l.distanceNm, 0) : null))
  /** ETA al destino final (distancia total / velocidad promedio). */
  const eta = computed(() => (totalNm.value != null && gps.current ? etaMs(totalNm.value, gps.speedKn, gps.current.t) : null))

  // Cada fix nuevo: avisos de arribo y avance automático al siguiente punto.
  watch(
    () => gps.current,
    (c) => {
      if (!c || !fix.value || !route.value.length) return
      const step = stepRoute(route.value, fix.value, arrival.value, lastNotifiedKey)
      lastNotifiedKey = step.lastNotifiedKey
      if (step.notify) {
        const t = i18n.global.t
        const title = t('nav.arrivalTitle')
        const body = t('nav.arrivalBody', { name: step.notify.name })
        void showSystemNotification(title, body)
        toast.push(body, { title, tone: 'warning', timeoutMs: 10_000 })
      }
      if (step.advanced) {
        route.value = step.route
        void persist()
      }
    },
  )

  return {
    route,
    arrival,
    loaded,
    legs,
    next,
    final,
    nextLeg,
    totalNm,
    eta,
    load,
    setTarget,
    append,
    removeAt,
    clear,
    updateArrival,
  }
})
