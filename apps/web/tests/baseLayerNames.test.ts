import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { areaLabel } from '@gpsm/shared'
import { BASE_LAYER_GROUPS } from '../src/layers/baseLayers'

/**
 * Las capas base empaquetadas vienen de varias fuentes y no siempre traían nombre: sin `name`, la ficha del mapa muestra
 * "Elemento seleccionado". `scripts/normalize-layers.mjs` se los agrega; este test evita que vuelva a pasar al sumar o reemplazar archivos.
 */
const root = join(__dirname, '..', 'public')
const files = BASE_LAYER_GROUPS.flatMap((g) => g.files.map((f) => ({ group: g.key, path: f.path })))

describe('capas base: identificación de cada elemento', () => {
  for (const { path } of files) {
    it(`${path}: todos los elementos tienen nombre y ninguna descripción inútil`, () => {
      const data = JSON.parse(readFileSync(join(root, path), 'utf8')) as { features: { properties: Record<string, unknown> | null }[] }
      expect(data.features.length).toBeGreaterThan(0)
      for (const [i, f] of data.features.entries()) {
        const p = f.properties ?? {}
        expect(String(p.name ?? '').trim(), `${path} #${i}`).not.toBe('')
        expect(String(p.name)).not.toMatch(/^Object ID/i)
        expect(String(p.description ?? '')).not.toMatch(/This is track no|Polilínea conectando/)
      }
    })
  }

  it('las etiquetas de las áreas de vieira siguen saliendo (letra de la unidad)', () => {
    const data = JSON.parse(readFileSync(join(root, 'layers/areas_vieira/areas_vieira.geojson'), 'utf8')) as { features: { properties: Record<string, unknown> }[] }
    const labels = data.features.map((f) => areaLabel('areasVieira', f.properties))
    expect(labels).toContain('A1')
    expect(labels.every((l) => !!l && l.length <= 2)).toBe(true)
  })
})
