import type { BaseGroup } from '@gpsm/shared'

/**
 * Capas base empaquetadas con la app (`public/layers/`, copiadas de `assets/geojson/` de la app Flutter).
 * Se precachean: están siempre disponibles sin conexión y funcionan como mapa de respaldo (costas y límites).
 * Cada archivo tiene un token de color del tema (`--ds-layer-*`), igual en los tres temas pero con su tono propio.
 */
export interface BaseLayerFile {
  path: string
  /** Token CSS del color por defecto. */
  token: string
}

export interface BaseLayerGroupDef {
  key: BaseGroup
  files: BaseLayerFile[]
  /** Línea punteada (zonas de veda, como en el estudio de capas de la app web original). */
  dashed?: boolean
}

const f = (path: string, token: string): BaseLayerFile => ({ path: `/layers/${path}`, token })

/** En orden de dibujo (de abajo hacia arriba), como el `zIndex` de Flutter. */
export const BASE_LAYER_GROUPS: BaseLayerGroupDef[] = [
  {
    key: 'mapaBase',
    files: [f('mapa_base/argentina.geojson', '--ds-layer-coast'), f('mapa_base/uruguay.geojson', '--ds-layer-coast'), f('mapa_base/chile.geojson', '--ds-layer-coast')],
  },
  {
    key: 'areasGenerales',
    files: [
      f('areas_generales/mar_territorial.geojson', '--ds-layer-territorial'),
      f('areas_generales/zona_economica_exclusiva.geojson', '--ds-layer-eez'),
      f('areas_generales/ZCP.geojson', '--ds-layer-zcp'),
    ],
  },
  { key: 'zonasVeda', dashed: true, files: [f('zonas_veda/veda_2014.geojson', '--ds-layer-closure'), f('zonas_veda/veda_merluza_negra.geojson', '--ds-layer-closure')] },
  { key: 'areasVieira', files: [f('areas_vieira/areas_vieira.geojson', '--ds-layer-scallop')] },
  {
    key: 'areasCentolla',
    files: ['C1', 'C2', 'C3', 'C4', 'C5', 'S1', 'S2', 'S3', 'S4'].map((a) => f(`areas_centolla/area_centolla_${a}.geojson`, '--ds-layer-crab')),
  },
  { key: 'areasLangostino', files: [f('areas_langostino/areas_langostino.geojson', '--ds-layer-shrimp')] },
]

/** Colores que se asignan, rotando, a las capas importadas sin estilo propio. */
export const IMPORTED_TOKENS = ['--ds-mark-orange', '--ds-mark-blue', '--ds-mark-green', '--ds-mark-red', '--ds-layer-shrimp', '--ds-layer-zcp']

/** Todos los tokens que pueden usar las capas (para armar la expresión de color del mapa). */
export const LAYER_TOKENS = [...new Set([...BASE_LAYER_GROUPS.flatMap((g) => g.files.map((x) => x.token)), ...IMPORTED_TOKENS])]
