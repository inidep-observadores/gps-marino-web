import { describe, expect, it } from 'vitest'
import {
  MARK_COLORS,
  MARK_ICONS,
  UUID_RE,
  markColorFromLegacy,
  markColorToLegacy,
  markIconFromLegacy,
  markIconToLegacy,
  matchesSearch,
  normalizeForSearch,
  uuidv7,
  uuidv7Time,
  waypointSchema,
} from '../src'

describe('marcas compatibles con la app Flutter', () => {
  it('mantiene los 35 íconos y 5 colores del enum original', () => {
    expect(MARK_ICONS).toHaveLength(35)
    expect(MARK_COLORS).toHaveLength(5)
    expect(new Set(MARK_ICONS).size).toBe(MARK_ICONS.length)
  })

  it('traduce índices conocidos del enum de Flutter', () => {
    // Posiciones verificadas contra lib/src/modules/waypoints/model/waypoint.dart
    expect(markIconFromLegacy(0)).toBe('locationDot')
    expect(markIconFromLegacy(7)).toBe('fishFins')
    expect(markIconFromLegacy(15)).toBe('personDrowning')
    expect(markIconFromLegacy(34)).toBe('thumbsDown')
    expect(markColorFromLegacy(0)).toBe('system')
    expect(markColorFromLegacy(4)).toBe('orange')
  })

  it('usa los mismos valores por defecto que Flutter cuando falta el campo', () => {
    expect(markIconFromLegacy(undefined)).toBe('locationDot')
    expect(markColorFromLegacy(null)).toBe('red')
    expect(markIconFromLegacy(99)).toBe('locationDot')
  })

  it('ida y vuelta índice ↔ clave', () => {
    MARK_ICONS.forEach((_, i) => expect(markIconToLegacy(markIconFromLegacy(i))).toBe(i))
    MARK_COLORS.forEach((_, i) => expect(markColorToLegacy(markColorFromLegacy(i))).toBe(i))
  })
})

describe('uuidv7', () => {
  it('genera UUID v7 válidos', () => {
    const id = uuidv7()
    expect(id).toMatch(UUID_RE)
    expect(id[14]).toBe('7')
    expect(['8', '9', 'a', 'b']).toContain(id[19])
  })

  it('codifica el instante y ordena por fecha de creación', () => {
    const t = Date.UTC(2026, 10, 18, 12, 0, 0)
    expect(uuidv7Time(uuidv7(t))).toBe(t)
    expect(uuidv7(t) < uuidv7(t + 1)).toBe(true)
  })

  it('el esquema de waypoint lo acepta y valida rangos', () => {
    const now = Date.now()
    const base = {
      id: uuidv7(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      description: '',
      recordedAt: now,
      lat: -38,
      lon: -57.5,
      speedKn: 0,
      bearing: 0,
      icon: 'anchor',
      color: 'system',
      visible: true,
    }
    expect(waypointSchema.safeParse(base).success).toBe(true)
    expect(waypointSchema.safeParse({ ...base, lat: 91 }).success).toBe(false)
    expect(waypointSchema.safeParse({ ...base, icon: 'kraken' }).success).toBe(false)
  })
})

describe('búsqueda sin acentos', () => {
  it('normaliza mayúsculas y diacríticos', () => {
    expect(normalizeForSearch('  Termógrafo ÑANDÚ ')).toBe('termografo nandu')
  })
  it('encuentra con o sin acentos', () => {
    expect(matchesSearch('Termógrafo', 'termo')).toBe(true)
    expect(matchesSearch('Lance 12 – Camarón', 'camaron')).toBe(true)
    expect(matchesSearch('Ancla', 'boya')).toBe(false)
    expect(matchesSearch('Cualquiera', '  ')).toBe(true)
  })
})
