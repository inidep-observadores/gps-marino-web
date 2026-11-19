/// <reference path="./types/polylabel.d.ts" />
import polylabel from 'polylabel'
import type { LayerFormat } from './domain'
import type { Position } from './mapGeometry'

/**
 * Capas vectoriales (GeoJSON y GPX), portado de `geojson_style_parser.dart` y `gpx_style_parser.dart`.
 *
 * Cada archivo se normaliza a una lista plana de elementos dibujables (líneas, polígonos, puntos; las geometrías
 * "Multi" se separan) con su estilo ya resuelto en propiedades `_*`, listo para MapLibre:
 * - simplestyle-spec: `stroke`, `stroke-width`, `stroke-opacity`, `fill`, `fill-opacity`, `marker-color`;
 * - GPX: color de la extensión Garmin `gpxx:DisplayColor`;
 * - si el archivo no trae estilo, el color por defecto de la capa.
 * Las etiquetas de áreas (capas base) y las descripciones de puntos (capas importadas) van en listas aparte.
 */

export type DrawKind = 'line' | 'polygon' | 'point'

export interface DrawProps {
  /** Id estable del elemento: `<capa>|<n>` o `<capa>|<n>|<parte>`. Es lo que se guarda en "elementos ocultos". */
  _id: string
  _kind: DrawKind
  _stroke: string
  _strokeWidth: number
  _strokeOpacity: number
  _fill: string
  _fillOpacity: number
  /** Color del punto. */
  _color: string
  /** Título (name / title / label) o vacío. */
  _title: string
  /** Descripción (description / desc) o vacío. */
  _desc: string
}

export type DrawGeometry =
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'Point'; coordinates: Position }

export interface DrawFeature {
  type: 'Feature'
  geometry: DrawGeometry
  properties: DrawProps
}

export interface LabelFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: Position }
  /** `_for`: id del elemento al que pertenece la etiqueta. */
  properties: { text: string; _for: string }
}

export interface ParsedLayer {
  features: DrawFeature[]
  /** Etiquetas de áreas (centolla, vieira, langostino), centradas con polylabel. */
  labels: LabelFeature[]
  /** Descripciones de los puntos (solo capas importadas; se muestran si el usuario lo activa). */
  descriptions: LabelFeature[]
  /** Propiedades originales de cada elemento (para la ficha). */
  props: Record<string, Record<string, unknown>>
}

/** Grupos de capas base empaquetadas (las claves de Flutter, que también son las de visibilidad guardada). */
export const BASE_GROUPS = ['mapaBase', 'areasGenerales', 'zonasVeda', 'areasVieira', 'areasCentolla', 'areasLangostino'] as const
export type BaseGroup = (typeof BASE_GROUPS)[number]

/** Visibilidad inicial de cada grupo base: costas, límites y vedas encendidos; las áreas de pesquerías (vieira, centolla y langostino), apagadas. */
export const DEFAULT_BASE_VISIBLE: Readonly<Record<BaseGroup, boolean>> = {
  mapaBase: true,
  areasGenerales: true,
  zonasVeda: true,
  areasVieira: false,
  areasCentolla: false,
  areasLangostino: false,
}

export interface LayerParseOptions {
  /** Prefijo de los ids (la capa). */
  key: string
  /** Color por defecto (`#rrggbb` o `rgb(...)`). */
  defaultColor: string
  /** Grupo base al que pertenece el archivo (`undefined` = capa importada por el usuario). */
  group?: BaseGroup
  /** Nombre del archivo (las etiquetas de centolla salen de él). */
  fileName?: string
}

// ---------------------------------------------------------------------------------------------------------------
// Formato y utilidades

/** Formato por extensión (`.geojson`/`.json` → geojson, `.gpx` → gpx). */
export function detectLayerFormat(fileName: string): LayerFormat | null {
  const n = fileName.toLowerCase()
  if (n.endsWith('.gpx')) return 'gpx'
  if (n.endsWith('.geojson') || n.endsWith('.json')) return 'geojson'
  return null
}

/** Nombre visible de una capa: el del archivo sin extensión ni carpetas. */
export const layerNameFromFile = (fileName: string) => fileName.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '') || fileName

/**
 * Algunos exportadores GPX (p. ej. "Centolla OBS V2") escriben fechas inválidas ("2026-08-10T11:10:00.000Z-3").
 * La capa solo usa la geometría: se quitan los `<time>` (como en Flutter) para no rechazar archivos válidos.
 */
export const sanitizeGpx = (xml: string) => xml.replace(/<time>[\s\S]*?<\/time>/g, '')

/** Colores de la extensión Garmin `gpxx:DisplayColor`. */
export const GARMIN_COLORS: Record<string, string> = {
  Black: '#000000',
  DarkRed: '#8b0000',
  DarkGreen: '#006400',
  DarkYellow: '#8b8b00',
  DarkBlue: '#00008b',
  DarkMagenta: '#8b008b',
  DarkCyan: '#008b8b',
  LightGray: '#d3d3d3',
  DarkGray: '#a9a9a9',
  Red: '#ff0000',
  Green: '#00ff00',
  Yellow: '#ffff00',
  Blue: '#0000ff',
  Magenta: '#ff00ff',
  Cyan: '#00ffff',
  White: '#ffffff',
}

/** `#rgb`, `#rrggbb`, `#aarrggbb`/`#rrggbbaa` (con o sin `#`) → `#rrggbb`; `null` si no es un color. */
export function parseHexColor(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(s)) return `#${[...s].map((c) => c + c).join('')}`.toLowerCase()
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s}`.toLowerCase()
  if (/^[0-9a-f]{8}$/i.test(s)) return `#${s.slice(0, 6)}`.toLowerCase()
  return null
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const text = (v: unknown) => (v == null ? '' : String(v).trim())

const validPos = (p: unknown): p is Position =>
  Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[1] as number) <= 90
const cleanLine = (coords: unknown): Position[] => (Array.isArray(coords) ? coords.filter(validPos).map((p) => [p[0], p[1]] as Position) : [])

// ---------------------------------------------------------------------------------------------------------------
// Etiquetas y polos de inaccesibilidad

/** Etiqueta de un área según el grupo (reglas de `_extractLabel` de Flutter y `docs/geojson_logic_study.md`). */
export function areaLabel(group: BaseGroup | undefined, props: Record<string, unknown>, fileName?: string): string | null {
  if (group === 'areasLangostino') return /\d+/.exec(text(props.Id_area))?.[0] ?? null
  if (group === 'areasVieira') {
    const name = text(props.name)
    return name ? (name.split('_').pop() ?? null) : null
  }
  if (group === 'areasCentolla' && fileName) return /area_centolla_([A-Za-z0-9]+)\.geojson/i.exec(fileName)?.[1] ?? null
  return null
}

/** Área (signo ignorado) de un anillo, en grados² (solo para comparar tamaños). */
function ringArea(ring: Position[]): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j]![0] + ring[i]![0]) * (ring[j]![1] - ring[i]![1])
  return Math.abs(a / 2)
}

/** Punto interior más alejado del borde (precisión 0,01° ≈ 1 km, como en Flutter, para no colgarse con áreas enormes). */
export function labelPoint(rings: Position[][]): Position {
  const p = polylabel(rings as number[][][], 0.01)
  return [p[0], p[1]]
}

// ---------------------------------------------------------------------------------------------------------------
// GeoJSON

interface StyleCtx {
  opts: LayerParseOptions
  props: Record<string, unknown>
}

function baseProps(id: string, kind: DrawKind, { opts, props }: StyleCtx): DrawProps {
  const strokeOpacity = num(props['stroke-opacity']) ?? 1
  const stroke = parseHexColor(props.stroke) ?? opts.defaultColor
  const strokeWidth = clamp(Math.round(num(props['stroke-width']) ?? 2), 1, 20)
  // Relleno: áreas generales sin relleno; demás grupos base al 15 %; importadas lo que diga el archivo o 25 %.
  let fillOpacity = num(props['fill-opacity']) ?? 0.25
  if (opts.group === 'areasGenerales') fillOpacity = 0
  else if (opts.group && opts.group !== 'mapaBase') fillOpacity = 0.15
  return {
    _id: id,
    _kind: kind,
    _stroke: stroke,
    _strokeWidth: strokeWidth,
    _strokeOpacity: clamp(strokeOpacity, 0, 1),
    _fill: parseHexColor(props.fill) ?? stroke,
    _fillOpacity: clamp(fillOpacity, 0, 1),
    _color: parseHexColor(props['marker-color']) ?? opts.defaultColor,
    _title: text(props.name ?? props.title ?? props.label ?? props.Name),
    _desc: text(props.description ?? props.desc),
  }
}

type AnyGeom = { type: string; coordinates?: unknown; geometries?: AnyGeom[] }

/** Lanza `LayerFormatError` si el texto no es GeoJSON o no tiene nada que dibujar. */
export class LayerFormatError extends Error {}

export function parseGeoJsonLayer(textData: string, opts: LayerParseOptions): ParsedLayer {
  let data: unknown
  try {
    data = JSON.parse(textData.replace(/^﻿/, ''))
  } catch {
    throw new LayerFormatError('invalid-json')
  }
  const root = data as { type?: string; features?: unknown[]; geometry?: AnyGeom; properties?: Record<string, unknown> }
  let items: { geometry: AnyGeom | null; properties: Record<string, unknown> }[]
  if (root?.type === 'FeatureCollection' && Array.isArray(root.features))
    items = root.features.map((f) => {
      const ff = f as { geometry?: AnyGeom; properties?: Record<string, unknown> }
      return { geometry: ff?.geometry ?? null, properties: ff?.properties ?? {} }
    })
  else if (root?.type === 'Feature') items = [{ geometry: root.geometry ?? null, properties: root.properties ?? {} }]
  else if (root && typeof root.type === 'string') items = [{ geometry: root as AnyGeom, properties: {} }]
  else throw new LayerFormatError('not-geojson')

  const out: ParsedLayer = { features: [], labels: [], descriptions: [], props: {} }
  items.forEach((item, n) => {
    const id = `${opts.key}|${n}`
    const ctx: StyleCtx = { opts, props: item.properties ?? {} }
    const geoms: AnyGeom[] = item.geometry?.type === 'GeometryCollection' ? (item.geometry.geometries ?? []) : item.geometry ? [item.geometry] : []
    const multi = geoms.length > 1
    let part = 0
    const nextId = () => (multi || part > 0 ? `${id}|${part++}` : (part++, id))
    let biggest: Position[][] | null = null

    const addLine = (coords: unknown, forcedId?: string) => {
      const line = cleanLine(coords)
      if (line.length < 2) return
      const fid = forcedId ?? nextId()
      out.features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: baseProps(fid, 'line', ctx) })
      out.props[fid] = ctx.props
    }
    const addPolygon = (coords: unknown, forcedId?: string) => {
      if (!Array.isArray(coords)) return
      const rings = coords.map(cleanLine).filter((r) => r.length >= 3)
      if (!rings.length) return
      const fid = forcedId ?? nextId()
      out.features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: rings }, properties: baseProps(fid, 'polygon', ctx) })
      out.props[fid] = ctx.props
      if (!biggest || ringArea(rings[0]!) > ringArea(biggest[0]!)) biggest = rings
    }
    const addPoint = (coords: unknown) => {
      if (!validPos(coords)) return
      const fid = nextId()
      const p = baseProps(fid, 'point', ctx)
      out.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [coords[0], coords[1]] }, properties: p })
      out.props[fid] = ctx.props
      if (!opts.group && p._desc) out.descriptions.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [coords[0], coords[1]] }, properties: { text: p._desc, _for: fid } })
    }

    // Multi*: cada parte es un elemento propio (`<id>|<parte>`), como en Flutter.
    const multiParts = (arr: unknown, add: (c: unknown, id?: string) => void) => {
      if (!Array.isArray(arr)) return
      arr.forEach((c) => add(c, `${id}|${part++}`))
    }

    for (const g of geoms) {
      switch (g?.type) {
        case 'LineString':
          addLine(g.coordinates)
          break
        case 'MultiLineString':
          multiParts(g.coordinates, addLine)
          break
        case 'Polygon':
          addPolygon(g.coordinates)
          break
        case 'MultiPolygon':
          multiParts(g.coordinates, addPolygon)
          break
        case 'Point':
          addPoint(g.coordinates)
          break
        case 'MultiPoint':
          if (Array.isArray(g.coordinates)) g.coordinates.forEach(addPoint)
          break
      }
    }

    const label = biggest ? areaLabel(opts.group, ctx.props, opts.fileName) : null
    if (label && biggest) out.labels.push({ type: 'Feature', geometry: { type: 'Point', coordinates: labelPoint(biggest) }, properties: { text: label, _for: id } })
  })

  if (!out.features.length) throw new LayerFormatError('empty')
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// GPX

/** Parser de XML a inyectar: `DOMParser` en el navegador, `@xmldom/xmldom` en los tests. */
export type XmlParser = (xml: string) => Document

function children(el: Element, name: string): Element[] {
  const out: Element[] = []
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && localName(n as Element) === name) out.push(n as Element)
  return out
}
const localName = (el: Element) => (el.localName ?? el.nodeName).replace(/^.*:/, '')
const childText = (el: Element, name: string) => text(children(el, name)[0]?.textContent)

function point(el: Element): Position | null {
  const lat = Number(el.getAttribute('lat'))
  const lon = Number(el.getAttribute('lon'))
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lon, lat] : null
}

/** Color Garmin dentro de las extensiones del elemento (ruta o track), si lo hay. */
function garminColor(el: Element): string | null {
  const ext = children(el, 'extensions')[0]
  if (!ext) return null
  const all = ext.getElementsByTagName('*')
  for (let i = 0; i < all.length; i++) {
    const e = all[i]!
    if (localName(e) === 'DisplayColor') return GARMIN_COLORS[text(e.textContent)] ?? null
  }
  return null
}

export function parseGpxLayer(xml: string, parseXml: XmlParser, opts: LayerParseOptions): ParsedLayer {
  let doc: Document
  try {
    doc = parseXml(sanitizeGpx(xml.replace(/^﻿/, '')))
  } catch {
    throw new LayerFormatError('invalid-xml')
  }
  const root = doc.documentElement
  if (!root || localName(root) !== 'gpx') throw new LayerFormatError('not-gpx')

  const out: ParsedLayer = { features: [], labels: [], descriptions: [], props: {} }
  let n = 0
  const meta = (el: Element) => {
    const p: Record<string, unknown> = {}
    for (const k of ['name', 'desc', 'type', 'cmt']) {
      const v = childText(el, k)
      if (v) p[k] = v
    }
    return p
  }
  const style = (props: Record<string, unknown>, color: string): StyleCtx => ({ opts: { ...opts, defaultColor: color }, props })
  const addLine = (pts: Position[], props: Record<string, unknown>, color: string) => {
    if (pts.length < 2) return
    const id = `${opts.key}|${n++}`
    out.features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: baseProps(id, 'line', style(props, color)) })
    out.props[id] = props
  }
  const addPoint = (el: Element, color: string, kind: string) => {
    const p = point(el)
    if (!p) return
    const id = `${opts.key}|${kind}|${n++}`
    const props = meta(el)
    const dp = baseProps(id, 'point', style(props, color))
    out.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: dp })
    out.props[id] = props
    if (!opts.group && dp._desc) out.descriptions.push({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: { text: dp._desc, _for: id } })
  }

  for (const rte of children(root, 'rte')) {
    const color = garminColor(rte) ?? opts.defaultColor
    const pts = children(rte, 'rtept')
    addLine(pts.map(point).filter((p): p is Position => !!p), meta(rte), color)
    pts.forEach((pt) => addPoint(pt, color, 'rtept'))
  }
  for (const trk of children(root, 'trk')) {
    const color = garminColor(trk) ?? opts.defaultColor
    for (const seg of children(trk, 'trkseg')) addLine(children(seg, 'trkpt').map(point).filter((p): p is Position => !!p), meta(trk), color)
  }
  for (const wpt of children(root, 'wpt')) addPoint(wpt, opts.defaultColor, 'wpt')

  if (!out.features.length) throw new LayerFormatError('empty')
  return out
}

/** Marca elementos ocultos (`_hidden`) sin copiar las geometrías: el mapa los dibuja atenuados (como Flutter). */
export function withHidden(features: readonly DrawFeature[], hidden: ReadonlySet<string>) {
  return features.map((f) => ({ ...f, properties: { ...f.properties, _hidden: hidden.has(f.properties._id) } }))
}

/**
 * Ids a ocultar junto con un elemento: si es una línea, también los puntos en sus extremos (en los GPX de lances
 * la línea del lance y sus puntos de inicio y fin van juntos), como `_buildHideSwitch` de Flutter.
 */
export function relatedFeatureIds(layer: ParsedLayer, id: string): string[] {
  const f = layer.features.find((x) => x.properties._id === id)
  if (!f || f.geometry.type !== 'LineString') return [id]
  const ends = [f.geometry.coordinates[0]!, f.geometry.coordinates[f.geometry.coordinates.length - 1]!]
  const same = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1]
  const extra = layer.features
    .filter((x) => x.geometry.type === 'Point' && ends.some((e) => same(e, x.geometry.coordinates as Position)))
    .map((x) => x.properties._id)
  return [id, ...extra]
}

/** Punto representativo de un elemento (para navegar hacia él): el punto, el punto medio de la línea o el polo del área. */
export function featureAnchor(f: DrawFeature): Position {
  const g = f.geometry
  if (g.type === 'Point') return g.coordinates
  if (g.type === 'LineString') return g.coordinates[Math.floor(g.coordinates.length / 2)]!
  return labelPoint(g.coordinates)
}
