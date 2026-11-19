#!/usr/bin/env node
/**
 * Normaliza las capas base empaquetadas (`public/layers/**.geojson`) para que cada elemento tenga un `name` (título de la
 * ficha del mapa) y, cuando corresponde, una `description`. Los archivos vienen de la app Flutter y de distintas fuentes
 * (QGIS, OpenCPN, Google Earth): unos sin nombre, otros con "Object ID 15" o "This is track no: 3".
 *
 * Se conservan todas las demás propiedades. Es idempotente: se puede volver a ejecutar.
 *   node scripts/normalize-layers.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'layers')

const str = (v) => (v == null ? '' : String(v).trim())

/** Reglas por archivo: devuelve `{ name, description? }` para cada elemento (o `null` para dejarlo igual). */
const RULES = {
  'mapa_base/argentina.geojson': () => ({ name: 'Costa de Argentina', description: 'Línea de costa y límites del mapa base.' }),
  'mapa_base/uruguay.geojson': () => ({ name: 'Costa de Uruguay', description: 'Línea de costa y límites del mapa base.' }),
  'mapa_base/chile.geojson': () => ({ name: 'Costa de Chile', description: 'Línea de costa y límites del mapa base.' }),
  'areas_generales/mar_territorial.geojson': () => ({
    name: 'Límite 12 millas (Mar Territorial Argentino)',
    description: 'Límite exterior del Mar Territorial Argentino. Fuente: Servicio de Hidrografía Naval.',
  }),
  'areas_generales/zona_economica_exclusiva.geojson': () => ({
    name: 'Zona Económica Exclusiva',
    description: 'Límite de las 200 millas (Zona Económica Exclusiva Argentina). Fuente: Servicio de Hidrografía Naval.',
  }),
  'areas_generales/ZCP.geojson': () => ({
    name: 'Zona Común de Pesca Argentino-Uruguaya',
    description: 'Límites de la Zona Común de Pesca entre Argentina y Uruguay.',
  }),
  'zonas_veda/veda_2014.geojson': () => ({ name: 'Zona de veda 2014', description: 'Límite de la zona de veda establecida en 2014.' }),
  'zonas_veda/veda_merluza_negra.geojson': () => ({ name: 'Zona de veda de merluza negra', description: 'Límite de la zona de veda de merluza negra.' }),
  'areas_langostino/areas_langostino.geojson': (p) => {
    const n = /\d+/.exec(str(p.Id_area))?.[0]
    return { name: n ? `Subárea ${n} de langostino` : 'Subárea de langostino', description: str(p.Notas) || 'Subárea de manejo de langostino.' }
  },
  'areas_vieira/areas_vieira.geojson': (p) => {
    // El nombre original es el identificador de la resolución (UM_Vieira_RES_5_14_A1): se conserva en la descripción.
    const id = str(p.name).startsWith('UM_Vieira_') ? str(p.name) : str(p.ID_original)
    const unit = id.split('_').pop()
    return { name: `Unidad de manejo de vieira ${unit}`, description: `Identificador original: ${id}`, label: unit, ID_original: id }
  },
}
for (const a of ['C1', 'C2', 'C3', 'C4', 'C5', 'S1', 'S2', 'S3', 'S4']) {
  RULES[`areas_centolla/area_centolla_${a}.geojson`] = () => ({ name: `Área de centolla ${a}`, description: 'Área de manejo de centolla.' })
}

for (const [file, rule] of Object.entries(RULES)) {
  const path = join(root, file)
  const data = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''))
  for (const feature of data.features) {
    const props = feature.properties ?? {}
    // Vieira: la regla usa el nombre original; si ya se normalizó, está guardado en ID_original.
    const extra = rule(props)
    feature.properties = { ...props, ...extra }
    // Las descripciones inútiles de origen ("This is track no: 3", "Polilínea conectando...") no se conservan.
    delete feature.properties.desc
    delete feature.properties.Name
  }
  const { features, ...head } = data
  const lines = features.map((f) => JSON.stringify(f))
  const header = JSON.stringify(head).slice(0, -1)
  writeFileSync(path, `${header},"features":[\n${lines.join(',\n')}\n]}\n`)
  console.log(`${file}: ${features.length} elementos`)
}
