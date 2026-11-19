import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { bearer, login, resetDb, startApp, uuid, waypoint, type TestApp } from './helpers'

let t: TestApp
let a: Awaited<ReturnType<typeof login>>
beforeAll(async () => {
  t = await startApp({ LAYER_QUOTA_BYTES: '2000' })
})
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.prisma)
  a = await login(t, 'user-a')
})

const push = (token: string, body: unknown) => t.http().post('/sync/push').set(bearer(token)).send(body as object)
const pull = (token: string, query = '') => t.http().get(`/sync/pull${query}`).set(bearer(token))

const layer = (over: Record<string, unknown> = {}) => ({
  id: uuid(), createdAt: 1, updatedAt: 1, deletedAt: null, name: 'Veda', format: 'geojson', visible: true, importedAt: 1,
  hiddenFeatures: [], showDescriptions: false, content: '{"type":"FeatureCollection","features":[]}', ...over,
})
const track = (over: Record<string, unknown> = {}) => ({
  id: uuid(), createdAt: 1, updatedAt: 1, deletedAt: null, name: 'Derrota', startedAt: 1, endedAt: null, distanceNm: 0, pointCount: 0, visible: true, ...over,
})
const pt = (seq: number) => ({ seq, t: 1000 + seq, lat: -38 + seq / 1000, lon: -57.5, speedKn: 6, courseDeg: 90 })

describe('push y pull', () => {
  it('sube registros, asigna serverVersion y el pull los devuelve', async () => {
    const w1 = waypoint()
    const w2 = waypoint({ description: 'Lance 2' })
    const r = await push(a.token, { waypoints: [w1, w2] }).expect(200)
    expect(r.body.waypoints[w1.id]).toEqual({ applied: true, serverVersion: 1 })
    expect(r.body.waypoints[w2.id]).toEqual({ applied: true, serverVersion: 2 })
    expect(r.body.cursor).toBe(2)

    const p = await pull(a.token).expect(200)
    expect(p.body.cursor).toBe(2)
    expect(p.body.hasMore).toBe(false)
    expect(p.body.waypoints.map((w: { id: string }) => w.id)).toEqual([w1.id, w2.id])
    expect(p.body.waypoints[0].userId).toBeUndefined()
    expect((await pull(a.token, '?since=2').expect(200)).body.waypoints).toEqual([])
  })

  it('un push vacío no cambia el cursor', async () => {
    const r = await push(a.token, {}).expect(200)
    expect(r.body.cursor).toBe(0)
  })

  it('última escritura gana: lo más viejo no pisa lo más nuevo', async () => {
    const w = waypoint({ updatedAt: 5_000, description: 'nuevo' })
    await push(a.token, { waypoints: [w] }).expect(200)
    const old = await push(a.token, { waypoints: [{ ...w, updatedAt: 4_000, description: 'viejo' }] }).expect(200)
    expect(old.body.waypoints[w.id].applied).toBe(false)
    expect((await pull(a.token)).body.waypoints[0].description).toBe('nuevo')
    const newer = await push(a.token, { waypoints: [{ ...w, updatedAt: 6_000, description: 'más nuevo' }] }).expect(200)
    expect(newer.body.waypoints[w.id]).toEqual({ applied: true, serverVersion: 2 })
    expect((await pull(a.token, '?since=1')).body.waypoints[0].description).toBe('más nuevo')
  })

  it('reenviar el mismo registro es idempotente', async () => {
    const w = waypoint()
    await push(a.token, { waypoints: [w] }).expect(200)
    const again = await push(a.token, { waypoints: [w] }).expect(200)
    expect(again.body.waypoints[w.id].applied).toBe(true)
    expect(await t.prisma.waypoint.count()).toBe(1)
  })

  it('los borrados viajan como deletedAt', async () => {
    const w = waypoint()
    await push(a.token, { waypoints: [w] })
    await push(a.token, { waypoints: [{ ...w, updatedAt: 2_000, deletedAt: 2_000 }] })
    const p = (await pull(a.token, '?since=1')).body
    expect(p.waypoints).toHaveLength(1)
    expect(p.waypoints[0].deletedAt).toBe(2_000)
  })

  it('un reloj adelantado se recorta al del servidor', async () => {
    const w = waypoint({ updatedAt: Date.now() + 365 * 86_400_000 })
    await push(a.token, { waypoints: [w] })
    const stored = (await pull(a.token)).body.waypoints[0]
    expect(stored.updatedAt).toBeLessThan(Date.now() + 6 * 60_000)
    // Otro dispositivo, con hora correcta, puede editar después.
    const fix = await push(a.token, { waypoints: [{ ...w, updatedAt: Date.now() + 10 * 60_000, description: 'ok' }] })
    expect(fix.body.waypoints[w.id].applied).toBe(true)
  })

  it('el pull se pagina con hasMore y un cursor que no salta registros', async () => {
    const ws = Array.from({ length: 5 }, (_, i) => waypoint({ description: `w${i}` }))
    await push(a.token, { waypoints: ws.slice(0, 3), settings: [{ key: 'map.settings', value: { zoom: 5 }, updatedAt: 1 }] })
    await push(a.token, { waypoints: ws.slice(3) })
    const seen: string[] = []
    let since = 0
    for (let i = 0; i < 10; i++) {
      const p = (await pull(a.token, `?since=${since}&limit=2`)).body
      seen.push(...p.waypoints.map((w: { description: string }) => w.description), ...p.settings.map((s: { key: string }) => s.key))
      since = p.cursor
      if (!p.hasMore) break
    }
    expect(seen.sort()).toEqual(['map.settings', 'w0', 'w1', 'w2', 'w3', 'w4'])
  })

  it('dos dispositivos de la misma cuenta convergen', async () => {
    const phone = login(t, 'user-a')
    const tablet = await phone
    const w = waypoint({ description: 'del teléfono', updatedAt: 1_000 })
    await push(a.token, { waypoints: [w] })
    const seen = (await pull(tablet.token)).body
    expect(seen.waypoints[0].description).toBe('del teléfono')
    await push(tablet.token, { waypoints: [{ ...seen.waypoints[0], description: 'de la tableta', updatedAt: 2_000 }] })
    const back = (await pull(a.token, `?since=${(await pull(a.token)).body.cursor - 1}`)).body
    expect(back.waypoints[0].description).toBe('de la tableta')
  })
})

describe('aislamiento entre usuarios', () => {
  it('un usuario no ve ni pisa los datos de otro, aunque repita el mismo id', async () => {
    const b = await login(t, 'user-b')
    const w = waypoint({ description: 'de A' })
    await push(a.token, { waypoints: [w] })
    expect((await pull(b.token)).body.waypoints).toEqual([])
    const r = await push(b.token, { waypoints: [{ ...w, description: 'de B', updatedAt: 9_000 }] }).expect(200)
    expect(r.body.waypoints[w.id].applied).toBe(true)
    expect((await pull(a.token)).body.waypoints[0].description).toBe('de A')
    expect((await pull(b.token)).body.waypoints[0].description).toBe('de B')
  })

  it('los puntos de una derrota ajena no se leen', async () => {
    const b = await login(t, 'user-b')
    const tr = track()
    await push(a.token, { tracks: [tr], trackPoints: [{ trackId: tr.id, points: [pt(0)] }] })
    await t.http().get(`/sync/tracks/${tr.id}/points`).set(bearer(b.token)).expect(404)
  })
})

describe('derrotas, capas, ajustes y ruta', () => {
  it('guarda la cabecera de la derrota y sus puntos por tandas', async () => {
    const tr = track({ pointCount: 5 })
    await push(a.token, { tracks: [tr], trackPoints: [{ trackId: tr.id, points: [pt(0), pt(1), pt(2)] }] }).expect(200)
    // Repetir puntos y agregar nuevos: los repetidos se ignoran.
    await push(a.token, { trackPoints: [{ trackId: tr.id, points: [pt(2), pt(3), pt(4)] }] }).expect(200)
    const first = (await t.http().get(`/sync/tracks/${tr.id}/points?limit=2`).set(bearer(a.token)).expect(200)).body
    expect(first.points.map((p: { seq: number }) => p.seq)).toEqual([0, 1])
    expect(first.next).toBe(2)
    const rest = (await t.http().get(`/sync/tracks/${tr.id}/points?from=${first.next}`).set(bearer(a.token)).expect(200)).body
    expect(rest.points.map((p: { seq: number }) => p.seq)).toEqual([2, 3, 4])
    expect(rest.next).toBeNull()
    expect((await pull(a.token)).body.tracks[0].pointCount).toBe(5)
  })

  it('borrar la derrota elimina sus puntos y los puntos sueltos se ignoran', async () => {
    const tr = track()
    await push(a.token, { tracks: [tr], trackPoints: [{ trackId: tr.id, points: [pt(0)] }] })
    await push(a.token, { tracks: [{ ...tr, updatedAt: 2, deletedAt: 2 }], trackPoints: [{ trackId: tr.id, points: [pt(1)] }] })
    expect(await t.prisma.trackPoint.count()).toBe(0)
    await t.http().get(`/sync/tracks/${tr.id}/points`).set(bearer(a.token)).expect(404)
    // Puntos de una derrota que no existe: no se guardan.
    await push(a.token, { trackPoints: [{ trackId: uuid(), points: [pt(0)] }] }).expect(200)
    expect(await t.prisma.trackPoint.count()).toBe(0)
  })

  it('sincroniza capas, ajustes (incluido null) y la ruta activa', async () => {
    const l = layer()
    const route = { updatedAt: 10, points: [{ name: 'Boya', lat: -38, lon: -57, waypointId: null }] }
    await push(a.token, { layers: [l], settings: [{ key: 'a', value: null, updatedAt: 1 }, { key: 'b', value: { x: [1, 2] }, updatedAt: 1 }], route }).expect(200)
    const p = (await pull(a.token)).body
    expect(p.layers[0].content).toBe(l.content)
    expect(p.layers[0].sizeBytes).toBeUndefined()
    expect(Object.fromEntries(p.settings.map((s: { key: string; value: unknown }) => [s.key, s.value]))).toEqual({ a: null, b: { x: [1, 2] } })
    expect(p.route.points[0].name).toBe('Boya')
    // Quitar la ruta = lista vacía.
    await push(a.token, { route: { updatedAt: 20, points: [] } })
    expect((await pull(a.token, `?since=${p.cursor}`)).body.route.points).toEqual([])
  })

  it('una capa borrada libera su contenido', async () => {
    const l = layer()
    await push(a.token, { layers: [l] })
    await push(a.token, { layers: [{ ...l, updatedAt: 2, deletedAt: 2 }] })
    expect((await t.prisma.importedLayer.findFirstOrThrow()).content).toBe('')
  })

  it('rechaza con 413 las capas que superan el espacio del usuario', async () => {
    await push(a.token, { layers: [layer({ content: 'x'.repeat(1500) })] }).expect(200)
    await push(a.token, { layers: [layer({ content: 'y'.repeat(1500) })] }).expect(413)
  })
})

describe('validación', () => {
  it('rechaza datos fuera de rango con el detalle del problema', async () => {
    const r = await push(a.token, { waypoints: [waypoint({ lat: 123 })] }).expect(400)
    expect(r.body.issues[0].path).toBe('waypoints.0.lat')
    await push(a.token, { waypoints: [waypoint({ icon: 'inventado' })] }).expect(400)
    await pull(a.token, '?since=-1').expect(400)
    await pull(a.token, '?limit=100000').expect(400)
    await t.http().get('/sync/tracks/no-es-uuid/points').set(bearer(a.token)).expect(400)
  })
})
