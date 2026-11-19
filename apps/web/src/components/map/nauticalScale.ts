import type { IControl, Map as MapLibre } from 'maplibre-gl'
import { distanceM, METERS_PER_NM } from '@gpsm/shared'

/** Largos "redondos" de la barra de escala, en millas náuticas (de 0,01 Mn a 5000 Mn). */
export const SCALE_STEPS_NM = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000] as const

/** El mayor largo redondo que no supera `maxNm` (si el mapa está tan cerca que ni 0,01 Mn entra, el menor). */
export function niceScaleNm(maxNm: number): number {
  let best: number = SCALE_STEPS_NM[0]
  for (const s of SCALE_STEPS_NM) if (s <= maxNm) best = s
  return best
}

/**
 * Barra de escala en millas náuticas. MapLibre trae una, pero su rótulo ("nm") está fijo en inglés y en minúsculas:
 * esta deja el rótulo en manos de la app (`Mn` en español, `Nm` en inglés) y usa el mismo estilo (`maplibregl-ctrl-scale`).
 */
export class NauticalScaleControl implements IControl {
  private map: MapLibre | null = null
  private el: HTMLDivElement | null = null

  constructor(
    private format: (nm: number) => string,
    private maxWidthPx = 110,
  ) {}

  /** Cambia cómo se escribe el rótulo (al cambiar el idioma) y lo redibuja. */
  setFormat(format: (nm: number) => string) {
    this.format = format
    this.update()
  }

  onAdd(map: MapLibre): HTMLElement {
    this.map = map
    this.el = document.createElement('div')
    this.el.className = 'maplibregl-ctrl maplibregl-ctrl-scale'
    map.on('move', this.update)
    this.update()
    return this.el
  }

  onRemove() {
    this.map?.off('move', this.update)
    this.el?.remove()
    this.map = null
    this.el = null
  }

  private update = () => {
    const map = this.map
    const el = this.el
    if (!map || !el) return
    const y = map.getContainer().clientHeight / 2
    const a = map.unproject([0, y])
    const b = map.unproject([this.maxWidthPx, y])
    const maxNm = distanceM({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng }) / METERS_PER_NM
    if (!(maxNm > 0)) return
    const nm = niceScaleNm(maxNm)
    el.style.width = `${Math.max(24, Math.round((this.maxWidthPx * nm) / maxNm))}px`
    el.textContent = this.format(nm)
  }
}
