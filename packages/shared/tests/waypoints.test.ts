import { describe, expect, it } from 'vitest'
import {
  BackupFormatError,
  CSV_HEADER,
  groupByDay,
  newRecordsForMerge,
  parseMogJson,
  sortWaypoints,
  toCsv,
  toGpx,
  toKml,
  toMogJson,
  uuidv7,
  type Waypoint,
} from '../src'

let seq = 0
const wp = (over: Partial<Waypoint> = {}): Waypoint => {
  const t = Date.UTC(2026, 10, 18, 12) + seq++ * 1000
  return {
    id: uuidv7(t),
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    description: 'Lance',
    recordedAt: t,
    lat: -38.0055,
    lon: -57.5426,
    speedKn: 3.25,
    bearing: 145,
    icon: 'fishFins',
    color: 'blue',
    visible: true,
    ...over,
  }
}

describe('orden y búsqueda de la lista', () => {
  const a = wp({ description: 'Ñandú', recordedAt: 3000, icon: 'anchor' })
  const b = wp({ description: 'boya', recordedAt: 1000, icon: 'ship' })
  const c = wp({ description: 'Boya', recordedAt: 2000, icon: 'anchor' })
  const labels: Record<string, string> = { anchor: 'Ancla', ship: 'Barco' }

  it('por fecha descendente (por defecto) y ascendente', () => {
    expect(sortWaypoints([a, b, c], { order: 'date', descending: true }).map((w) => w.recordedAt)).toEqual([3000, 2000, 1000])
    expect(sortWaypoints([a, b, c], { order: 'date', descending: false }).map((w) => w.recordedAt)).toEqual([1000, 2000, 3000])
  })

  it('por nombre sin distinguir mayúsculas; empate por fecha', () => {
    expect(sortWaypoints([a, b, c], { order: 'name', descending: false, locale: 'es' }).map((w) => w.recordedAt)).toEqual([1000, 2000, 3000])
    expect(sortWaypoints([a, b, c], { order: 'name', descending: true, locale: 'es' }).map((w) => w.recordedAt)).toEqual([3000, 2000, 1000])
  })

  it('por nombre del ícono', () => {
    const r = sortWaypoints([b, a, c], { order: 'icon', descending: false, iconLabel: (i) => labels[i]! })
    expect(r.map((w) => w.icon)).toEqual(['anchor', 'anchor', 'ship'])
  })

  it('filtra sin acentos', () => {
    expect(sortWaypoints([a, b, c], { order: 'date', descending: true, query: 'nandu' })).toEqual([a])
  })

  it('agrupa por día local consecutivo', () => {
    const d1 = new Date(2026, 10, 18, 23, 0).getTime()
    const d2 = new Date(2026, 10, 19, 1, 0).getTime()
    const g = groupByDay([wp({ recordedAt: d2 }), wp({ recordedAt: d1 }), wp({ recordedAt: d1 - 1000 })])
    expect(g.map((x) => [x.day, x.items.length])).toEqual([
      ['2026-11-19', 1],
      ['2026-11-18', 2],
    ])
  })
})

describe('copia de seguridad MogData (compatible con Flutter)', () => {
  /** Registro tal como lo escribe `Waypoint.toJson()` de la app Flutter. */
  const flutterRecord = {
    id: 12,
    descripcion: 'Termógrafo',
    fecha: '1763467200123456',
    latitud: -42.5,
    longitud: -61.25,
    velocidad: 4.5,
    rumbo: 270,
    markIcon: 15,
    markColor: 2,
    ver_en_mapa: true,
  }

  it('lee una copia de Flutter (fecha en µs como texto, íconos por índice)', () => {
    const { records, skipped } = parseMogJson(JSON.stringify([flutterRecord]))
    expect(skipped).toEqual([])
    expect(records[0]).toEqual({
      uuid: null,
      input: {
        description: 'Termógrafo',
        recordedAt: 1763467200123,
        lat: -42.5,
        lon: -61.25,
        speedKn: 4.5,
        bearing: 270,
        icon: 'personDrowning',
        color: 'green',
        visible: true,
      },
    })
  })

  it('acepta copias viejas (`icon`/`color`, sin `ver_en_mapa`) con los valores por defecto de Flutter', () => {
    const { records } = parseMogJson(JSON.stringify([{ ...flutterRecord, markIcon: undefined, markColor: undefined, icon: 10, color: 1, ver_en_mapa: undefined }]))
    expect(records[0]!.input).toMatchObject({ icon: 'anchor', color: 'red', visible: false })
    const { records: r2 } = parseMogJson(JSON.stringify([{ ...flutterRecord, markIcon: undefined, markColor: undefined }]))
    expect(r2[0]!.input).toMatchObject({ icon: 'locationDot', color: 'red' })
  })

  it('descarta registros inválidos sin perder el resto', () => {
    const { records, skipped } = parseMogJson(JSON.stringify([flutterRecord, { foo: 1 }, { ...flutterRecord, latitud: 95 }, { ...flutterRecord, fecha: 'x' }]))
    expect(records).toHaveLength(1)
    expect(skipped.map((s) => s.reason)).toEqual(['invalid-record', 'out-of-range', 'invalid-date'])
  })

  it('rechaza archivos que no son una lista JSON', () => {
    expect(() => parseMogJson('no es json')).toThrow(BackupFormatError)
    expect(() => parseMogJson('{"a":1}')).toThrow(BackupFormatError)
  })

  it('ida y vuelta: exportar y volver a leer conserva todo', () => {
    const list = [wp({ description: 'A "comillas" & <xml>' }), wp({ icon: 'thumbsDown', color: 'orange', visible: false, bearing: 359 })]
    const json = toMogJson(list)
    const raw = JSON.parse(json)
    expect(raw[0]).toMatchObject({ id: 0, markIcon: 7, markColor: 3, fecha: String(list[0]!.recordedAt * 1000) })
    const { records } = parseMogJson(json)
    records.forEach((r, i) => {
      const w = list[i]!
      expect(r.uuid).toBe(w.id)
      expect(r.input).toEqual({
        description: w.description,
        recordedAt: w.recordedAt,
        lat: w.lat,
        lon: w.lon,
        speedKn: w.speedKn,
        bearing: w.bearing,
        icon: w.icon,
        color: w.color,
        visible: w.visible,
      })
    })
  })

  it('al combinar, no duplica por uuid ni por instante y posición', () => {
    const t0 = Date.UTC(2026, 10, 1, 8)
    const existing = [wp({ recordedAt: t0, lat: -38, lon: -57 })]
    const { records } = parseMogJson(
      JSON.stringify([
        { ...flutterRecord, fecha: String(t0 * 1000 + 250), latitud: -38, longitud: -57 },
        { ...flutterRecord, uuid: existing[0]!.id },
        flutterRecord,
        flutterRecord,
      ]),
    )
    expect(newRecordsForMerge(existing, records)).toHaveLength(1)
  })
})

describe('exportadores', () => {
  const list = [wp({ description: 'Boya <1> & Co' }), wp({ description: '' })]

  it('GPX 1.1 con waypoints, hora y nombre escapado', () => {
    const gpx = toGpx(list, { fallbackName: () => 'Sin nombre' })
    expect(gpx).toContain('<gpx version="1.1"')
    expect(gpx.match(/<wpt /g)).toHaveLength(2)
    expect(gpx).toContain('<name>Boya &lt;1&gt; &amp; Co</name>')
    expect(gpx).toContain('<name>Sin nombre</name>')
    expect(gpx).toContain('lat="-38.0055000" lon="-57.5426000"')
    expect(gpx).toContain('<time>2026-11-18T12:')
  })

  it('KML con coordenadas lon,lat', () => {
    const kml = toKml(list)
    expect(kml.match(/<Placemark>/g)).toHaveLength(2)
    expect(kml).toContain('<coordinates>-57.5426000,-38.0055000,0</coordinates>')
  })

  it('CSV con BOM, encabezado y comillas cuando hace falta', () => {
    const csv = toCsv([wp({ description: 'Lance, "norte"' })])
    expect(csv.startsWith('﻿')).toBe(true)
    const [header, row] = csv.slice(1).trim().split('\r\n')
    expect(header).toBe(CSV_HEADER.join(','))
    expect(row).toContain('"Lance, ""norte"""')
    expect(row).toContain("\"38° 00,330' S\"")
    expect(row).toContain(',3.25,145,fishFins,blue,1')
  })
})
