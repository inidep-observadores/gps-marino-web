import type { StyleSpecification } from 'maplibre-gl'
import { listTiles, type Bounds } from '@gpsm/shared'
import { ARGENMAP_CACHE, argenmapTileUrl } from './mapStyles'

/**
 * Teselas vectoriales de OpenFreeMap guardadas para usar sin conexión.
 *
 * Problema: la URL de cada tesela lleva la versión del planeta (`/planet/20261115_080022_pt/{z}/{x}/{y}.pbf`) y
 * esa versión cambia con cada actualización de OpenFreeMap. Con el caché del service worker (clave = URL), al
 * cambiar la versión todo lo guardado deja de encontrarse justo cuando se está en altamar sin red.
 *
 * Solución: el estilo se reescribe para que la fuente use el protocolo propio `ofm://{z}/{x}/{y}` y este módulo
 * guarda cada tesela con una clave SIN versión. Caché primero: si la tesela está guardada se usa; si no, se baja
 * con la versión vigente y se guarda. Las teselas de mapas cambian poco: no se revalidan.
 */

export const OFM_PROTOCOL = 'ofm'
const CACHE = 'gpsm-ofm-tiles-v1'
const TILEJSON = 'https://tiles.openfreemap.org/planet'
const STYLE_URL = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' }
/** Tope de teselas guardadas (en el mar pesan poco: ~5–20 KB). Al superarlo se borran las más antiguas. */
export const MAX_TILES = 20000

/** Clave estable (sin versión) de una tesela. */
export const tileKey = (z: number, x: number, y: number) => `https://gpsm.local/ofm/${z}/${x}/${y}.pbf`

/** `ofm://z/x/y` → coordenadas. */
export function parseOfmUrl(url: string): { z: number; x: number; y: number } | null {
  const m = /^ofm:\/\/(\d+)\/(\d+)\/(\d+)$/.exec(url)
  return m ? { z: +m[1]!, x: +m[2]!, y: +m[3]! } : null
}

/** Reemplaza la fuente `openmaptiles` (TileJSON versionado) por el protocolo propio. Puro: se prueba sin red. */
export function rewriteOfmStyle(style: StyleSpecification): StyleSpecification {
  const sources = { ...style.sources }
  for (const [id, src] of Object.entries(sources)) {
    if (src.type === 'vector' && 'url' in src && typeof src.url === 'string' && src.url.startsWith(TILEJSON)) {
      sources[id] = {
        type: 'vector',
        tiles: [`${OFM_PROTOCOL}://{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom: 14,
        attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }
    }
  }
  return { ...style, sources }
}

/** Estilo estándar (claro u oscuro) ya reescrito. Lanza si no hay red ni copia del estilo (service worker). */
export async function loadStandardStyle(dark: boolean): Promise<StyleSpecification> {
  const res = await fetch(dark ? STYLE_URL.dark : STYLE_URL.light)
  if (!res.ok) throw new Error(`style ${res.status}`)
  return rewriteOfmStyle((await res.json()) as StyleSpecification)
}

let template: Promise<string | null> | null = null
/** Plantilla de URL vigente (de la TileJSON, que el service worker también guarda). */
function tileTemplate(): Promise<string | null> {
  template ??= fetch(TILEJSON)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { tiles?: string[] } | null) => j?.tiles?.[0] ?? null)
    .catch(() => {
      template = null // reintentar cuando vuelva la red
      return null
    })
  return template
}

let stored = 0

/** Baja una tesela con la versión vigente y la guarda (clave sin versión). `null` = fuera de cobertura (vacía). */
async function fetchAndStore(c: { z: number; x: number; y: number }, signal?: AbortSignal): Promise<ArrayBuffer> {
  const tpl = await tileTemplate()
  if (!tpl) throw new Error('offline')
  const url = tpl.replace('{z}', String(c.z)).replace('{x}', String(c.x)).replace('{y}', String(c.y))
  const res = await fetch(url, { signal })
  if (!res.ok) {
    // Fuera de la cobertura de teselas: tesela vacía (no es un error para el mapa).
    if (res.status === 404 || res.status === 204) return new ArrayBuffer(0)
    throw new Error(`tile ${res.status}`)
  }
  const data = await res.arrayBuffer()
  const cache = await caches.open(CACHE)
  void cache.put(tileKey(c.z, c.x, c.y), new Response(data, { headers: { 'content-type': 'application/x-protobuf' } }))
  if (++stored % 500 === 0) void trimTileCache()
  return data
}

/** Manejador del protocolo `ofm://` para `maplibregl.addProtocol`. */
export async function ofmTileHandler(params: { url: string }, abort: AbortController): Promise<{ data: ArrayBuffer }> {
  const c = parseOfmUrl(params.url)
  if (!c) throw new Error(`bad tile url ${params.url}`)
  const cache = await caches.open(CACHE)
  const hit = await cache.match(tileKey(c.z, c.x, c.y))
  if (hit) return { data: await hit.arrayBuffer() }
  return { data: await fetchAndStore(c, abort.signal) }
}

/** Zoom máximo de las teselas vectoriales (más arriba MapLibre amplía la de z14). */
export const MAX_TILE_ZOOM = 14
/** Primer nivel que se baja: la vista general, para que haya algo al alejar el mapa. */
export const DOWNLOAD_MIN_ZOOM = 3
/** Tope de teselas por descarga (el teléfono y la cuota del navegador son finitos). */
export const MAX_DOWNLOAD_TILES = 8000
/** Estimación de peso por tesela (KB): en el mar casi todo es agua y pesan poco; la costa y las ciudades, mucho más. */
export const AVG_TILE_KB = 25

/**
 * Qué se descarga por zona: las teselas vectoriales de OpenFreeMap o las raster de Argenmap (más pesadas: PNG de 10–50 KB).
 * Argenmap guarda en el mismo caché que usa el service worker (`map-argenmap-tiles`), así lo descargado y lo visto es lo mismo.
 */
export type TileSource = 'vector' | 'argenmap'
export const SOURCE_LIMITS: Record<TileSource, { avgKb: number; maxTiles: number }> = {
  vector: { avgKb: AVG_TILE_KB, maxTiles: MAX_DOWNLOAD_TILES },
  argenmap: { avgKb: 30, maxTiles: 4000 },
}

export interface DownloadProgress {
  done: number
  total: number
  failed: number
  /** Ya estaban guardadas (no se volvieron a bajar). */
  skipped: number
}

/**
 * Descarga las teselas de una zona para usarlas sin conexión. Cancelable con `signal`; baja de a pocas en paralelo
 * y se detiene sola si la red se cae (varios fallos seguidos). Las que ya están guardadas se saltean.
 */
export async function downloadArea(
  bounds: Bounds,
  maxZoom: number,
  total: number,
  onProgress: (p: DownloadProgress) => void,
  signal: AbortSignal,
  source: { kind: TileSource; dark?: boolean } = { kind: 'vector' },
): Promise<DownloadProgress & { aborted: boolean; offline: boolean }> {
  const cache = await caches.open(source.kind === 'argenmap' ? ARGENMAP_CACHE : CACHE)
  const p: DownloadProgress = { done: 0, total, failed: 0, skipped: 0 }
  const it = listTiles(bounds, DOWNLOAD_MIN_ZOOM, maxZoom)
  let consecutiveFails = 0
  let offline = false

  async function worker() {
    for (;;) {
      if (signal.aborted || offline) return
      const next = it.next()
      if (next.done) return
      const c = next.value
      try {
        if (source.kind === 'argenmap') {
          const url = argenmapTileUrl(c.z, c.x, c.y, !!source.dark)
          if (await cache.match(url)) p.skipped++
          else {
            const res = await fetch(url, { signal })
            if (!res.ok) throw new Error(`tile ${res.status}`)
            await cache.put(url, res)
          }
        } else if (await cache.match(tileKey(c.z, c.x, c.y))) p.skipped++
        else await fetchAndStore(c, signal)
        consecutiveFails = 0
      } catch {
        if (signal.aborted) return
        p.failed++
        if (++consecutiveFails >= 8) offline = true
      }
      p.done++
      if (p.done % 5 === 0 || p.done === total) onProgress({ ...p })
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  onProgress({ ...p })
  return { ...p, aborted: signal.aborted, offline }
}

/** Borra todas las teselas guardadas del origen indicado. */
export async function clearTileCache(kind: TileSource = 'vector'): Promise<void> {
  try {
    await caches.delete(kind === 'argenmap' ? ARGENMAP_CACHE : CACHE)
  } catch {
    /* sin Cache Storage */
  }
}

/** Mantiene el caché por debajo de `MAX_TILES` borrando las más antiguas (orden de inserción). */
export async function trimTileCache(max = MAX_TILES): Promise<number> {
  try {
    const cache = await caches.open(CACHE)
    const keys = await cache.keys()
    const extra = keys.length - max
    if (extra <= 0) return 0
    await Promise.all(keys.slice(0, extra).map((k) => cache.delete(k)))
    return extra
  } catch {
    return 0
  }
}

/** Cantidad de teselas guardadas del origen indicado (para mostrar en Ajustes). */
export async function storedTileCount(kind: TileSource = 'vector'): Promise<number> {
  try {
    return (await (await caches.open(kind === 'argenmap' ? ARGENMAP_CACHE : CACHE)).keys()).length
  } catch {
    return 0
  }
}
