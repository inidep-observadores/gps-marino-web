/**
 * Íconos y colores de marca de un waypoint.
 *
 * El ORDEN de estos arreglos es el del enum `MarkIcon`/`MarkColor` de la app Flutter (Marine Onboard GPS):
 * sus copias de seguridad (`MogData.json`) guardan el ÍNDICE. Aquí se guarda la CLAVE de texto, que no se
 * rompe si se agregan íconos. No reordenar: agregar siempre al final.
 */
export const MARK_ICONS = [
  'locationDot',
  'mapPin',
  'xmark',
  'plus',
  'asterisk',
  'check',
  'star',
  'fishFins',
  'shrimp',
  'lifeRing',
  'anchor',
  'binoculars',
  'microscope',
  'flask',
  'dna',
  'personDrowning',
  'house',
  'ship',
  'cloudShowersWater',
  'biohazard',
  'ban',
  'mapLocation',
  'flag',
  'tag',
  'lightbulb',
  'eye',
  'arrowsToEye',
  'bullseye',
  'faceSmile',
  'faceMeh',
  'faceFrown',
  'faceAngry',
  'faceTired',
  'thumbsUp',
  'thumbsDown',
] as const

export type MarkIcon = (typeof MARK_ICONS)[number]

/** `system` = sin color propio: se dibuja con el color de tinta del tema. */
export const MARK_COLORS = ['system', 'red', 'green', 'blue', 'orange'] as const

export type MarkColor = (typeof MARK_COLORS)[number]

/** Ícono y color al crear un waypoint nuevo (igual que en Flutter). */
export const DEFAULT_MARK_ICON: MarkIcon = 'asterisk'
export const DEFAULT_MARK_COLOR: MarkColor = 'system'
/** Valores que usa Flutter al leer una copia de seguridad que no trae el campo. */
export const LEGACY_MISSING_ICON: MarkIcon = 'locationDot'
export const LEGACY_MISSING_COLOR: MarkColor = 'red'

export const isMarkIcon = (v: unknown): v is MarkIcon =>
  typeof v === 'string' && (MARK_ICONS as readonly string[]).includes(v)
export const isMarkColor = (v: unknown): v is MarkColor =>
  typeof v === 'string' && (MARK_COLORS as readonly string[]).includes(v)

/** Índice del enum de Flutter → clave. Índices ausentes o desconocidos devuelven `fallback`. */
export function markIconFromLegacy(index: number | null | undefined, fallback: MarkIcon = LEGACY_MISSING_ICON): MarkIcon {
  return index == null ? fallback : (MARK_ICONS[index] ?? fallback)
}

export function markColorFromLegacy(
  index: number | null | undefined,
  fallback: MarkColor = LEGACY_MISSING_COLOR,
): MarkColor {
  return index == null ? fallback : (MARK_COLORS[index] ?? fallback)
}

/** Clave → índice del enum de Flutter (para exportar copias que la app móvil pueda leer). */
export const markIconToLegacy = (icon: MarkIcon): number => MARK_ICONS.indexOf(icon)
export const markColorToLegacy = (color: MarkColor): number => MARK_COLORS.indexOf(color)
