import { beforeEach, describe, expect, it } from 'vitest'
import type { WaypointInput } from '@gpsm/shared'
import type { AppDatabase } from '@/db/client'
import { waypoints } from '@/db/schema'
import { createLayerRepository } from '@/repositories/layers'
import { createRouteRepository, createSettingsRepository } from '@/repositories/settings'
import { createWaypointRepository } from '@/repositories/waypoints'
import { createTestDb, fakeClock } from './helpers/testDb'

const input = (over: Partial<WaypointInput> = {}): WaypointInput => ({
  description: 'Lance 12',
  recordedAt: Date.UTC(2026, 10, 18, 10),
  lat: -38.0055,
  lon: -57.5426,
  speedKn: 3.2,
  bearing: 145,
  icon: 'fishFins',
  color: 'blue',
  visible: true,
  ...over,
})

let db: AppDatabase
let clock: ReturnType<typeof fakeClock>

beforeEach(async () => {
  ;({ db } = await createTestDb())
  clock = fakeClock()
})

describe('WaypointRepository', () => {
  it('crea, lee y lista de la más reciente a la más antigua', async () => {
    const repo = createWaypointRepository(db, clock)
    const a = await repo.create(input({ description: 'A', recordedAt: 1000 }))
    const b = await repo.create(input({ description: 'B', recordedAt: 2000 }))
    expect(a.id).not.toBe(b.id)
    expect(await repo.get(a.id)).toEqual(a)
    expect((await repo.list()).map((w) => w.description)).toEqual(['B', 'A'])
    expect(await repo.count()).toBe(2)
  })

  it('conserva tipos: booleanos, reales e íconos', async () => {
    const repo = createWaypointRepository(db, clock)
    const w = await repo.create(input({ visible: false }))
    const read = await repo.get(w.id)
    expect(read?.visible).toBe(false)
    expect(read?.lat).toBeCloseTo(-38.0055, 6)
    expect(read?.icon).toBe('fishFins')
    expect(read?.deletedAt).toBeNull()
  })

  it('actualiza y marca como pendiente de sincronizar', async () => {
    const repo = createWaypointRepository(db, clock)
    const w = await repo.create(input())
    await db.update(waypoints).set({ dirty: false })
    clock.advance(5000)
    const updated = await repo.update(w.id, { description: 'Boya' })
    expect(updated?.description).toBe('Boya')
    expect(updated?.updatedAt).toBe(w.updatedAt + 5000)
    const [row] = await db.select().from(waypoints)
    expect(row?.dirty).toBe(true)
  })

  it('muestra u oculta varias en el mapa', async () => {
    const repo = createWaypointRepository(db, clock)
    const ids = [(await repo.create(input())).id, (await repo.create(input())).id]
    await repo.setVisible(ids, false)
    expect((await repo.list()).every((w) => !w.visible)).toBe(true)
  })

  it('el borrado es lógico: deja de listarse pero queda la marca para sincronizar', async () => {
    const repo = createWaypointRepository(db, clock)
    const w = await repo.create(input())
    await repo.remove([w.id])
    expect(await repo.list()).toEqual([])
    expect(await repo.get(w.id)).toBeNull()
    const rows = await db.select().from(waypoints)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.deletedAt).toBe(clock())
    expect(await repo.update(w.id, { description: 'x' })).toBeNull()
  })
})

describe('LayerRepository', () => {
  const layer = { name: 'Lances', format: 'gpx' as const, visible: true, importedAt: 1, hiddenFeatures: [], showDescriptions: false, content: '<gpx/>' }

  it('guarda el contenido, la lista de elementos ocultos y busca por nombre', async () => {
    const repo = createLayerRepository(db, clock)
    const l = await repo.create(layer)
    await repo.update(l.id, { hiddenFeatures: ['f1', 'f2'] })
    expect((await repo.get(l.id))?.hiddenFeatures).toEqual(['f1', 'f2'])
    expect((await repo.findByName('Lances'))?.id).toBe(l.id)
  })

  it('al borrar vacía el contenido', async () => {
    const repo = createLayerRepository(db, clock)
    const l = await repo.create(layer)
    await repo.remove(l.id)
    expect(await repo.list()).toEqual([])
    expect(await repo.findByName('Lances')).toBeNull()
  })
})

describe('SettingsRepository y RouteRepository', () => {
  it('guarda valores JSON y devuelve el valor por defecto si falta', async () => {
    const repo = createSettingsRepository(db, clock)
    expect(await repo.get('map.rings', { count: 3 })).toEqual({ count: 3 })
    await repo.set('map.rings', { count: 5, distanceNm: 0.5 })
    await repo.set('map.rings', { count: 4, distanceNm: 1 })
    expect(await repo.get('map.rings', null)).toEqual({ count: 4, distanceNm: 1 })
    expect(await repo.all()).toEqual({ 'map.rings': { count: 4, distanceNm: 1 } })
  })

  it('reemplaza la ruta activa conservando el orden', async () => {
    const repo = createRouteRepository(db)
    const p = (name: string) => ({ name, lat: -38, lon: -57, waypointId: null })
    await repo.replace([p('A'), p('B'), p('C')])
    await repo.replace([p('C'), p('A')])
    expect((await repo.get()).map((x) => x.name)).toEqual(['C', 'A'])
    await repo.replace([])
    expect(await repo.get()).toEqual([])
  })
})

describe('WaypointRepository.importMany (restaurar copias)', () => {
  it('combina: agrega conservando los ids que vienen en la copia', async () => {
    const repo = createWaypointRepository(db, clock)
    await repo.create(input({ description: 'Existente' }))
    const id = '0195f000-0000-7000-8000-000000000001'
    expect(await repo.importMany([{ input: input({ description: 'De la copia' }), id }, { input: input({ description: 'Sin id' }) }])).toBe(2)
    const list = await repo.list()
    expect(list.map((w) => w.description).sort()).toEqual(['De la copia', 'Existente', 'Sin id'])
    expect((await repo.get(id))?.description).toBe('De la copia')
  })

  it('reemplaza: da de baja lo anterior en la misma transacción', async () => {
    const repo = createWaypointRepository(db, clock)
    await repo.create(input({ description: 'Viejo' }))
    await repo.importMany([{ input: input({ description: 'Nuevo' }) }], { replace: true })
    expect((await repo.list()).map((w) => w.description)).toEqual(['Nuevo'])
    expect(await db.select().from(waypoints)).toHaveLength(2)
  })

  it('reactiva una ubicación borrada si la copia trae su id', async () => {
    const repo = createWaypointRepository(db, clock)
    const w = await repo.create(input({ description: 'Borrada' }))
    await repo.remove([w.id])
    await repo.importMany([{ input: input({ description: 'Restaurada' }), id: w.id }])
    expect((await repo.get(w.id))?.description).toBe('Restaurada')
  })

  it('soporta copias grandes (varios lotes)', async () => {
    const repo = createWaypointRepository(db, clock)
    const many = Array.from({ length: 450 }, (_, i) => ({ input: input({ recordedAt: i }) }))
    expect(await repo.importMany(many)).toBe(450)
    expect(await repo.count()).toBe(450)
  })
})

describe('TrackRepository', () => {
  const P = (i: number) => ({ t: 1000 * i, lat: -38 - i * 0.001, lon: -57.5, speedKn: 5, courseDeg: 180 })

  it('graba por tandas, acumula distancia y puntos en orden', async () => {
    const { createTrackRepository } = await import('@/repositories/tracks')
    const repo = createTrackRepository(db, clock)
    const t = await repo.create('Derrota 1', 0)
    await repo.append(t.id, [P(0), P(1), P(2)])
    await repo.append(t.id, [P(3), P(4)])
    const [row] = await repo.list()
    expect(row!.pointCount).toBe(5)
    // 4 tramos de 0,001° de latitud ≈ 0,06 Nm cada uno
    expect(row!.distanceNm).toBeCloseTo(4 * 0.06, 2)
    const pts = await repo.points(t.id)
    expect(pts.map((p) => p.t)).toEqual([0, 1000, 2000, 3000, 4000])
    expect(await repo.unfinished()).toHaveLength(1)
    await repo.finish(t.id, 4000)
    expect(await repo.unfinished()).toEqual([])
  })

  it('visibilidad, nombre y borrado (baja lógica; los puntos se eliminan)', async () => {
    const { createTrackRepository } = await import('@/repositories/tracks')
    const repo = createTrackRepository(db, clock)
    const t = await repo.create('A', 0)
    await repo.append(t.id, [P(0), P(1)])
    await repo.setVisible(t.id, false)
    await repo.rename(t.id, 'Lance 7')
    expect((await repo.list())[0]).toMatchObject({ name: 'Lance 7', visible: false })
    await repo.remove(t.id)
    expect(await repo.list()).toEqual([])
    expect(await repo.points(t.id)).toEqual([])
  })
})
