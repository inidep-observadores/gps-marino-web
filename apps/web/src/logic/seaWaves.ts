/**
 * Dibujo esquemático del mar para cada fuerza de la escala de Beaufort. Puro y determinista (mismo resultado siempre):
 * las olas se arman con senos superpuestos cuya altura y "picado" crecen con la fuerza; los corderitos (espuma) aparecen
 * desde la fuerza 3 sobre las crestas, las rayas del viento en el cielo se multiplican y desde la 9 hay rociones.
 */
export const SCENE_W = 320
export const SCENE_H = 150
/** Línea del horizonte: arriba, el cielo; abajo, el mar. */
const HORIZON = 50

export interface SeaScene {
  /** Tres capas de mar, de atrás hacia adelante (cada una es un camino SVG cerrado hasta el borde de abajo). */
  layers: [string, string, string]
  /** Espuma sobre las crestas de la capa de adelante: x, y y ancho de cada corderito. */
  caps: { x: number; y: number; w: number }[]
  /** Rayas del viento en el cielo. */
  streaks: { x: number; y: number; len: number }[]
  /** Rociones sobre las olas altas. */
  spray: { x: number; y: number; r: number }[]
  /** Altura de la ola de adelante (px de la escena), para pruebas y para ajustar elementos. */
  amplitude: number
}

/** Amplitud (px) de la ola de adelante: de un espejo (casi plano) a olas que ocupan buena parte de la escena. */
export function waveAmplitude(force: number): number {
  const f = Math.min(12, Math.max(0, force))
  return f === 0 ? 0.6 : 3 + f * 1.9
}

/** Camino de una ola: senos superpuestos (el picado aumenta con la fuerza), cerrado hacia abajo. */
function layerPath(force: number, baseY: number, amp: number, wavelength: number, phase: number): string {
  const k = (2 * Math.PI) / wavelength
  const chop = Math.min(1, force / 12)
  const pts: string[] = []
  for (let x = 0; x <= SCENE_W; x += 4) {
    const y = baseY - amp * (Math.sin(k * x + phase) + (0.16 + 0.22 * chop) * Math.sin(2.1 * k * x + 1.7 * phase) + 0.07 * chop * Math.sin(3.7 * k * x))
    pts.push(`${x},${y.toFixed(1)}`)
  }
  return `M0,${SCENE_H} L${pts.join(' L')} L${SCENE_W},${SCENE_H} Z`
}

/** Valor de la ola de adelante en x (el mismo que `layerPath`), para ubicar las crestas. */
function crestHeight(force: number, amp: number, wavelength: number, phase: number, x: number): number {
  const k = (2 * Math.PI) / wavelength
  const chop = Math.min(1, force / 12)
  return amp * (Math.sin(k * x + phase) + (0.16 + 0.22 * chop) * Math.sin(2.1 * k * x + 1.7 * phase) + 0.07 * chop * Math.sin(3.7 * k * x))
}

export function seaScene(force: number): SeaScene {
  const f = Math.min(12, Math.max(0, Math.round(force)))
  const amp = waveAmplitude(f)
  const wavelength = Math.max(62, 135 - f * 5.5)
  const frontBase = HORIZON + 38
  const front = layerPath(f, frontBase, amp, wavelength, 0.6)
  const mid = layerPath(f, HORIZON + 22, amp * 0.7, wavelength * 1.25, 2.1)
  const back = layerPath(f, HORIZON + 8, amp * 0.45, wavelength * 1.6, 4.0)

  // Crestas de la ola de adelante: máximos locales de la altura.
  const caps: SeaScene['caps'] = []
  const spray: SeaScene['spray'] = []
  if (f >= 3) {
    let idx = 0
    for (let x = 8; x < SCENE_W - 8; x += 2) {
      const h = (px: number) => crestHeight(f, amp, wavelength, 0.6, px)
      if (h(x) > h(x - 2) && h(x) >= h(x + 2) && h(x) > amp * 0.35) {
        idx++
        // En las fuerzas bajas solo algunas crestas rompen; con más viento, casi todas.
        if (f < 5 && idx % 2 === 0) continue
        caps.push({ x, y: frontBase - h(x) - 0.5, w: 5 + f * 1.1 })
        if (f >= 9) for (let j = 0; j < 3; j++) spray.push({ x: x + (j - 1) * 5, y: frontBase - h(x) - 4 - j * 3.5 - (idx % 3), r: 1 + (j % 2) * 0.6 })
      }
    }
  }

  // Rayas del viento: más y más largas con la fuerza (ninguna en calma).
  const streaks: SeaScene['streaks'] = []
  const count = f === 0 ? 0 : Math.min(9, 1 + Math.ceil(f * 0.7))
  for (let i = 0; i < count; i++) {
    streaks.push({ x: 20 + ((i * 97) % 220), y: 10 + ((i * 13) % 4) * 11 + (i % 3) * 3, len: 24 + f * 3 + ((i * 17) % 20) })
  }

  return { layers: [back, mid, front], caps, streaks, spray, amplitude: amp }
}
