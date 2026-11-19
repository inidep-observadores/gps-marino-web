import type { Map as MapLibre } from 'maplibre-gl'
import { sampleField, windBand, type WindBand, type WindField } from '@gpsm/shared'

/**
 * Partículas de viento dibujadas en un canvas encima del mapa (como en Windy), portado de Drone Forecast.
 * Sin Vue ni MapLibre en tiempo de ejecución (solo tipos): recibe el mapa ya creado.
 *
 * El campo de viento (lon/lat) se pasa a pantalla en una grilla gruesa cada vez que el mapa se mueve; cada partícula
 * lo lee en píxeles y avanza un poco por fotograma. El color sale de la intensidad en nudos (`windBand`).
 */
export type ParticleColors = Record<WindBand, string>

const CELL = 20
/** Píxeles por fotograma por cada m/s de viento, y tope para que el viento fuerte no se vea como un borrón. */
const PX_PER_MS = 0.1
const MAX_PX = 3
const MIN_LIFE = 40
const MAX_LIFE = 110
const FRAME_MS = 33
const BANDS: readonly WindBand[] = ['calm', 'fresh', 'strong', 'gale']

interface Particle {
  x: number
  y: number
  age: number
  life: number
}

export class WindParticles {
  private ctx: CanvasRenderingContext2D
  private width = 0
  private height = 0
  private cols = 0
  private rows = 0
  /** Velocidad en píxeles por fotograma y banda (0–3) de cada celda; NaN = fuera de los datos. */
  private vx = new Float32Array(0)
  private vy = new Float32Array(0)
  private band = new Uint8Array(0)
  private particles: Particle[] = []
  private raf = 0
  private last = 0
  private field: WindField | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private map: MapLibre,
    private colors: ParticleColors,
    private reducedMotion: boolean,
  ) {
    this.ctx = canvas.getContext('2d')!
  }

  setColors(colors: ParticleColors) {
    this.colors = colors
  }

  setField(field: WindField | null) {
    this.field = field
    this.rebuild()
  }

  /**
   * Cambia el campo (otra hora) SIN reiniciar las partículas ni borrar las estelas: las que están en el aire siguen su
   * camino y toman el viento nuevo. Así reproducir las horas se ve continuo.
   */
  updateField(field: WindField | null) {
    this.field = field
    if (!field || this.reducedMotion || !this.raf || this.particles.length === 0) {
      this.rebuild()
      return
    }
    this.buildScreenField(field)
  }

  pause() {
    this.stop()
  }

  resume() {
    if (!this.raf) this.rebuild()
  }

  /** Ajusta el canvas al tamaño del mapa (con la densidad de píxeles de la pantalla). */
  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas
    const dpr = window.devicePixelRatio || 1
    this.width = w
    this.height = h
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.rebuild()
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height)
  }

  /** Vuelve a calcular el campo en pantalla y a sembrar partículas (tras mover el mapa o cambiar la hora). */
  rebuild() {
    this.stop()
    this.clear()
    if (!this.field || !this.width || !this.height) return
    this.buildScreenField(this.field)
    this.seed()
    if (this.reducedMotion) this.drawStatic()
    else this.start()
  }

  private buildScreenField(field: WindField) {
    this.cols = Math.ceil(this.width / CELL) + 1
    this.rows = Math.ceil(this.height / CELL) + 1
    const n = this.cols * this.rows
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    this.band = new Uint8Array(n)
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const i = cy * this.cols + cx
        const ll = this.map.unproject([cx * CELL, cy * CELL])
        const w = sampleField(field, ll.lng, ll.lat)
        if (!w) {
          this.vx[i] = NaN
          this.vy[i] = NaN
          continue
        }
        const speed = Math.hypot(w.u, w.v)
        const scale = speed * PX_PER_MS > MAX_PX ? MAX_PX / speed : PX_PER_MS
        this.vx[i] = w.u * scale
        this.vy[i] = -w.v * scale // en pantalla "norte" es hacia arriba
        this.band[i] = BANDS.indexOf(windBand(speed))
      }
    }
  }

  private seed() {
    const count = Math.min(1800, Math.max(300, Math.round((this.width * this.height) / 1400)))
    this.particles = Array.from({ length: count }, () => this.respawn({ x: 0, y: 0, age: 0, life: 0 }))
    for (const p of this.particles) p.age = Math.floor(Math.random() * p.life) // no nacen todas a la vez
  }

  private respawn(p: Particle): Particle {
    p.x = Math.random() * this.width
    p.y = Math.random() * this.height
    p.age = 0
    p.life = MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE)
    return p
  }

  /** Viento (px/fotograma) y banda en un punto de pantalla, con interpolación bilineal. null si no hay datos. */
  private lookup(x: number, y: number): { vx: number; vy: number; band: number } | null {
    const fx = x / CELL
    const fy = y / CELL
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    if (x0 < 0 || y0 < 0 || x0 >= this.cols - 1 || y0 >= this.rows - 1) return null
    const tx = fx - x0
    const ty = fy - y0
    const i = y0 * this.cols + x0
    const j = i + this.cols
    const mix = (a: Float32Array) => a[i]! * (1 - tx) * (1 - ty) + a[i + 1]! * tx * (1 - ty) + a[j]! * (1 - tx) * ty + a[j + 1]! * tx * ty
    const vx = mix(this.vx)
    const vy = mix(this.vy)
    if (Number.isNaN(vx) || Number.isNaN(vy)) return null
    return { vx, vy, band: this.band[(ty < 0.5 ? i : j) + (tx < 0.5 ? 0 : 1)]! }
  }

  start() {
    if (this.raf || this.reducedMotion) return
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick)
      if (now - this.last < FRAME_MS) return
      this.last = now
      this.frame()
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  destroy() {
    this.stop()
    this.clear()
  }

  private frame() {
    const { ctx } = this
    // Desvanece lo dibujado antes: así cada partícula deja una estela.
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.globalCompositeOperation = 'source-over'
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'

    const segments: number[][] = BANDS.map(() => [])
    for (const p of this.particles) {
      const w = p.age++ < p.life ? this.lookup(p.x, p.y) : null
      if (!w) {
        this.respawn(p)
        continue
      }
      const nx = p.x + w.vx
      const ny = p.y + w.vy
      segments[w.band]!.push(p.x, p.y, nx, ny)
      p.x = nx
      p.y = ny
    }
    this.strokeSegments(segments)
  }

  /** Sin movimiento (preferencia del sistema): se dibuja una vez la trayectoria corta de cada partícula. */
  private drawStatic() {
    this.ctx.lineWidth = 1.5
    this.ctx.lineCap = 'round'
    const segments: number[][] = BANDS.map(() => [])
    for (const p of this.particles) {
      let { x, y } = p
      for (let step = 0; step < 14; step++) {
        const w = this.lookup(x, y)
        if (!w) break
        segments[w.band]!.push(x, y, x + w.vx * 2, y + w.vy * 2)
        x += w.vx * 2
        y += w.vy * 2
      }
    }
    this.strokeSegments(segments)
  }

  private strokeSegments(segments: number[][]) {
    BANDS.forEach((name, b) => {
      const s = segments[b]!
      if (!s.length) return
      this.ctx.strokeStyle = this.colors[name]
      this.ctx.beginPath()
      for (let k = 0; k < s.length; k += 4) {
        this.ctx.moveTo(s[k]!, s[k + 1]!)
        this.ctx.lineTo(s[k + 2]!, s[k + 3]!)
      }
      this.ctx.stroke()
    })
  }
}
