import type { StyleSpecification } from 'maplibre-gl'

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

/** Manejador del protocolo `ofm://` para `maplibregl.addProtocol`. */
export async function ofmTileHandler(params: { url: string }, abort: AbortController): Promise<{ data: ArrayBuffer }> {
  const c = parseOfmUrl(params.url)
  if (!c) throw new Error(`bad tile url ${params.url}`)
  const key = tileKey(c.z, c.x, c.y)
  const cache = await caches.open(CACHE)
  const hit = await cache.match(key)
  if (hit) return { data: await hit.arrayBuffer() }

  const tpl = await tileTemplate()
  if (!tpl) throw new Error('offline')
  const url = tpl.replace('{z}', String(c.z)).replace('{x}', String(c.x)).replace('{y}', String(c.y))
  const res = await fetch(url, { signal: abort.signal })
  if (!res.ok) {
    // Fuera de la cobertura de teselas: tesela vacía (no es un error para el mapa).
    if (res.status === 404 || res.status === 204) return { data: new ArrayBuffer(0) }
    throw new Error(`tile ${res.status}`)
  }
  const data = await res.arrayBuffer()
  void cache.put(key, new Response(data, { headers: { 'content-type': 'application/x-protobuf' } }))
  if (++stored % 500 === 0) void trimTileCache()
  return { data }
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

/** Cantidad de teselas vectoriales guardadas (para mostrar en Ajustes). */
export async function storedTileCount(): Promise<number> {
  try {
    return (await (await caches.open(CACHE)).keys()).length
  } catch {
    return 0
  }
}
