import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { buildPointWaveUrl, buildPointWindUrl, parsePointForecast, type LatLon, type PointForecast } from '@gpsm/shared'

/** Días de pronóstico del punto (viento y olas). */
export const POINT_DAYS = 4

export type PointForecastError = 'offline' | 'http' | null

/** Fecha de la respuesta (si salió del caché sin conexión es la de la última vez que se bajó). */
const dateOf = (res: Response) => Date.parse(res.headers.get('date') ?? '') || Date.now()

/**
 * Pronóstico de un punto cualquiera del mapa: viento, ráfagas y olas, para los gráficos. Dos pedidos en paralelo
 * (Open-Meteo Forecast y Marine). Si el de olas falla o el punto no tiene cobertura, se muestra solo el viento.
 * Sin conexión, el service worker devuelve la última respuesta guardada de ese mismo punto.
 */
export const usePointForecastStore = defineStore('pointForecast', () => {
  const point = ref<LatLon | null>(null)
  const data = shallowRef<PointForecast | null>(null)
  const loading = ref(false)
  const error = ref<PointForecastError>(null)
  let controller: AbortController | null = null

  async function load(p: LatLon) {
    point.value = p
    controller?.abort()
    controller = new AbortController()
    const { signal } = controller
    loading.value = true
    error.value = null
    data.value = null
    try {
      const [windRes, waveRes] = await Promise.all([
        fetch(buildPointWindUrl(p.lat, p.lon, POINT_DAYS), { signal }),
        fetch(buildPointWaveUrl(p.lat, p.lon, POINT_DAYS), { signal }).catch((e) => {
          if ((e as Error).name === 'AbortError') throw e
          return null
        }),
      ])
      if (!windRes.ok) throw Object.assign(new Error(`HTTP ${windRes.status}`), { kind: 'http' })
      const waves = waveRes?.ok ? await waveRes.json() : null
      data.value = parsePointForecast(await windRes.json(), waves, p.lat, p.lon, dateOf(windRes))
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      error.value = (e as { kind?: string }).kind === 'http' ? 'http' : 'offline'
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  const retry = () => (point.value ? load(point.value) : Promise.resolve())

  return { point, data, loading, error, load, retry }
})
