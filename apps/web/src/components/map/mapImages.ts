import { isMarkColor, isMarkIcon, type MarkColor } from '@gpsm/shared'
import { MARK_ICON_DEFS } from '@/components/marks/markIcons'
import type { Palette } from './mapStyles'

/**
 * Imágenes que dibuja el mapa, generadas en un canvas (sin archivos ni red):
 * - `mark-<ícono>-<color>`: el ícono de Font Awesome del waypoint sobre un disco con borde, legible sobre
 *   cualquier fondo (agua, satélite, noche). Se crean a pedido (`styleimagemissing`).
 * - `vessel` / `vessel-still`: el buque (flecha que gira con el rumbo / círculo si no hay rumbo).
 */

const MARK_PX = 30

function ctx2d(size: number, ratio: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.round(size * ratio)
  const ctx = canvas.getContext('2d')!
  ctx.scale(ratio, ratio)
  return ctx
}

function markColor(color: MarkColor, c: Palette): string {
  return { system: c.ink, red: c.markRed, green: c.markGreen, blue: c.markBlue, orange: c.markOrange }[color]
}

/** Devuelve la imagen para un id `mark-<ícono>-<color>`, o `null` si el id no es de una marca. */
export function markImage(id: string, c: Palette, ratio: number): ImageData | null {
  const m = /^mark-([a-zA-Z]+)-([a-z]+)$/.exec(id)
  if (!m || !isMarkIcon(m[1]) || !isMarkColor(m[2])) return null
  const def = MARK_ICON_DEFS[m[1]].icon
  const [w, h, , , path] = def
  const ctx = ctx2d(MARK_PX, ratio)
  const r = MARK_PX / 2
  ctx.beginPath()
  ctx.arc(r, r, r - 1.5, 0, Math.PI * 2)
  ctx.fillStyle = c.surface
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = markColor(m[2], c)
  ctx.stroke()
  // Glifo centrado y escalado al 55 % del disco.
  const glyph = MARK_PX * 0.55
  const scale = glyph / Math.max(w, h)
  ctx.save()
  ctx.translate(r - (w * scale) / 2, r - (h * scale) / 2)
  ctx.scale(scale, scale)
  ctx.fillStyle = markColor(m[2], c)
  for (const d of Array.isArray(path) ? path : [path]) ctx.fill(new Path2D(d))
  ctx.restore()
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
}

const VESSEL_PX = 40

/** Buque: flecha (proa hacia arriba = norte; MapLibre la gira con el rumbo). */
export function vesselImage(c: Palette, ratio: number): ImageData {
  const ctx = ctx2d(VESSEL_PX, ratio)
  const s = VESSEL_PX
  ctx.beginPath()
  ctx.moveTo(s / 2, 3)
  ctx.lineTo(s - 9, s - 6)
  ctx.lineTo(s / 2, s - 13)
  ctx.lineTo(9, s - 6)
  ctx.closePath()
  ctx.fillStyle = c.accent
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.lineJoin = 'round'
  ctx.strokeStyle = c.canvas
  ctx.stroke()
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
}

/** Buque sin rumbo conocido (detenido): círculo con punto. */
export function vesselStillImage(c: Palette, ratio: number): ImageData {
  const ctx = ctx2d(VESSEL_PX, ratio)
  const r = VESSEL_PX / 2
  ctx.beginPath()
  ctx.arc(r, r, 11, 0, Math.PI * 2)
  ctx.fillStyle = c.accent
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = c.canvas
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(r, r, 3.5, 0, Math.PI * 2)
  ctx.fillStyle = c.canvas
  ctx.fill()
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
}
