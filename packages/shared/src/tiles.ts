/**
 * Matemática de teselas XYZ (Web Mercator) para descargar una zona del mapa y usarla sin conexión.
 */

export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

export interface TileCoord {
  z: number
  x: number
  y: number
}

const MAX_LAT = 85.05112878

/** Coordenadas de la tesela que contiene el punto, en el zoom `z`. */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))
  const x = Math.floor(((lon + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan((la * Math.PI) / 180) + 1 / Math.cos((la * Math.PI) / 180)) / Math.PI) / 2) * n)
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) }
}

/** Rango de teselas (inclusive) que cubre el rectángulo en el zoom `z`. */
export function tileRange(b: Bounds, z: number): { x0: number; x1: number; y0: number; y1: number } {
  const a = lonLatToTile(b.west, b.north, z)
  const c = lonLatToTile(b.east, b.south, z)
  return { x0: a.x, x1: c.x, y0: a.y, y1: c.y }
}

/** Cantidad de teselas de un rango de zooms, sin enumerarlas (para estimar antes de descargar). */
export function countTiles(b: Bounds, minZoom: number, maxZoom: number): number {
  let total = 0
  for (let z = minZoom; z <= maxZoom; z++) {
    const r = tileRange(b, z)
    total += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1)
  }
  return total
}

/** Teselas del rectángulo, de los zooms bajos a los altos (primero la vista general, luego el detalle). */
export function* listTiles(b: Bounds, minZoom: number, maxZoom: number): Generator<TileCoord> {
  for (let z = minZoom; z <= maxZoom; z++) {
    const r = tileRange(b, z)
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) yield { z, x, y }
  }
}

/** Agranda el rectángulo un `fraction` por lado (margen para no quedar justo en el borde al navegar). */
export function expandBounds(b: Bounds, fraction: number): Bounds {
  const dx = (b.east - b.west) * fraction
  const dy = (b.north - b.south) * fraction
  return {
    west: Math.max(-180, b.west - dx),
    east: Math.min(180, b.east + dx),
    south: Math.max(-MAX_LAT, b.south - dy),
    north: Math.min(MAX_LAT, b.north + dy),
  }
}
