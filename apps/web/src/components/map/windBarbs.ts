import type { Map as MapLibre } from 'maplibre-gl'
import { MS_TO_KN, sampleField, windBand, windBarbParts, windBarbSide, windFromUV, type WindBand, type WindField } from '@gpsm/shared'

/**
 * Flechas de viento ("barbas" meteorológicas) dibujadas en el mismo canvas que las partículas. El asta apunta hacia
 * DONDE SE ORIGINA el viento; en su extremo, cada banderín (triángulo) vale 50 nudos, cada pluma larga 10 y la corta 5.
 * Sin viento (< 2,5 kn) se dibuja un círculo. El color sale de la intensidad, igual que las partículas.
 *
 * Es estático: se dibuja de nuevo al terminar de mover el mapa o al cambiar la hora (no gasta batería con una animación).
 * El tamaño y la transformación del canvas los fija `WindParticles.resize()`; esta clase solo lee `clientWidth/Height`.
 */
export type BarbColors = Record<WindBand, string> & { halo: string }

/** Separación entre flechas en pantalla (px) y medidas de la flecha. */
const SPACING = 58
const STAFF = 26
const BARB = 12
const GAP = 4
const PENNANT_W = 5
const BARB_ANGLE = (62 * Math.PI) / 180

export class WindBarbs {
  private ctx: CanvasRenderingContext2D
  private field: WindField | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private map: MapLibre,
    private colors: BarbColors,
  ) {
    this.ctx = canvas.getContext('2d')!
  }

  setColors(colors: BarbColors) {
    this.colors = colors
    this.draw()
  }

  /** `null` borra las flechas. */
  setField(field: WindField | null) {
    this.field = field
    this.draw()
  }

  /** Vuelve a dibujar (el mapa se movió o cambió el tamaño). */
  draw() {
    this.clear()
    const f = this.field
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (!f || !w || !h) return
    for (let y = SPACING / 2; y < h; y += SPACING) {
      for (let x = SPACING / 2; x < w; x += SPACING) {
        const ll = this.map.unproject([x, y])
        const v = sampleField(f, ll.lng, ll.lat)
        if (!v) continue
        const { speed, directionFrom } = windFromUV(v.u, v.v)
        this.barb(x, y, speed, directionFrom, windBarbSide(ll.lat) === 'left' ? -1 : 1)
      }
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight)
  }

  private barb(x: number, y: number, speedMs: number, directionFrom: number, side: 1 | -1) {
    const ctx = this.ctx
    const kn = speedMs * MS_TO_KN
    const color = this.colors[windBand(speedMs)]
    const parts = windBarbParts(kn)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    if (parts.calm) {
      this.stroke(() => ctx.arc(x, y, 3.5, 0, Math.PI * 2), color)
      return
    }

    const a = (directionFrom * Math.PI) / 180
    // Eje del asta (sale del punto hacia donde se origina el viento) y su perpendicular: en el sentido de las agujas del
    // reloj en el hemisferio norte (`side` = 1) y al revés en el sur (`side` = -1), como indica la OMM.
    const sx = Math.sin(a)
    const sy = -Math.cos(a)
    const px = Math.cos(a) * side
    const py = Math.sin(a) * side
    // Dirección de las plumas: inclinadas hacia afuera del asta.
    const bx = px * Math.sin(BARB_ANGLE) + sx * Math.cos(BARB_ANGLE)
    const by = py * Math.sin(BARB_ANGLE) + sy * Math.cos(BARB_ANGLE)
    const along = (d: number): [number, number] => [x + sx * d, y + sy * d]

    // Asta + círculo pequeño en la posición.
    this.stroke(() => {
      ctx.moveTo(x, y)
      ctx.lineTo(...along(STAFF))
    }, color)

    // Las plumas se cuelgan desde el extremo del asta hacia la posición: banderines, largas y corta.
    let d = STAFF
    for (let i = 0; i < parts.pennants; i++) {
      const [x0, y0] = along(d)
      const [x1, y1] = along(d - PENNANT_W)
      this.fill(() => {
        ctx.moveTo(x0, y0)
        ctx.lineTo(x0 + bx * BARB, y0 + by * BARB)
        ctx.lineTo(x1, y1)
        ctx.closePath()
      }, color)
      d -= PENNANT_W + 1
    }
    for (let i = 0; i < parts.full; i++) {
      const [x0, y0] = along(d)
      this.stroke(() => {
        ctx.moveTo(x0, y0)
        ctx.lineTo(x0 + bx * BARB, y0 + by * BARB)
      }, color)
      d -= GAP
    }
    if (parts.half) {
      // Con una sola pluma corta se la corre un lugar hacia adentro, para no confundirla con una larga.
      if (parts.pennants + parts.full === 0) d -= GAP
      const [x0, y0] = along(d)
      this.stroke(() => {
        ctx.moveTo(x0, y0)
        ctx.lineTo(x0 + bx * BARB * 0.5, y0 + by * BARB * 0.5)
      }, color)
    }
  }

  /** Trazo con un contorno claro debajo, para que se lea sobre el satélite y sobre los colores de las capas. */
  private stroke(path: () => void, color: string) {
    const ctx = this.ctx
    ctx.beginPath()
    path()
    ctx.strokeStyle = this.colors.halo
    ctx.lineWidth = 4.2
    ctx.stroke()
    ctx.beginPath()
    path()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()
  }

  private fill(path: () => void, color: string) {
    const ctx = this.ctx
    ctx.beginPath()
    path()
    ctx.strokeStyle = this.colors.halo
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = color
    ctx.fill()
  }
}
