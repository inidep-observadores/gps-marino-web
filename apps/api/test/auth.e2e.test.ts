import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { bearer, googleToken, login, resetDb, startApp, uuid, waypoint, WEB_ORIGIN, type TestApp } from './helpers'

let t: TestApp
beforeAll(async () => {
  t = await startApp()
})
afterAll(() => t.close())
beforeEach(() => resetDb(t.prisma))

describe('salud', () => {
  it('responde sin token y confirma la base', async () => {
    const r = await t.http().get('/health').expect(200)
    expect(r.body).toEqual({ status: 'ok', db: true })
  })
})

describe('inicio de sesión con Google', () => {
  it('crea la cuenta, deja el refresh en una cookie httpOnly y no lo devuelve en el cuerpo', async () => {
    const s = await login(t, 'g-1')
    expect(s.body.user.email).toBe('g-1@example.com')
    expect(s.body.refreshToken).toBeUndefined()
    expect(s.cookies[0]).toMatch(/HttpOnly/i)
    expect(s.cookies[0]).toMatch(/Path=\/auth/)
    const me = await t.http().get('/me').set(bearer(s.token)).expect(200)
    expect(me.body.id).toBe(s.userId)
  })

  it('un segundo inicio con la misma cuenta no duplica el usuario', async () => {
    const a = await login(t, 'g-2')
    const b = await login(t, 'g-2')
    expect(b.userId).toBe(a.userId)
    expect(await t.prisma.user.count()).toBe(1)
  })

  it('rechaza un ID token de Google inválido', async () => {
    await t.http().post('/auth/google').send({ idToken: 'no-es-un-token-de-google-valido' }).expect(401)
  })

  it('valida el cuerpo', async () => {
    await t.http().post('/auth/google').send({}).expect(400)
  })
})

describe('acceso protegido', () => {
  it('sin token o con un token inválido responde 401', async () => {
    await t.http().get('/me').expect(401)
    await t.http().get('/me').set(bearer('basura')).expect(401)
    await t.http().get('/sync/pull').expect(401)
  })

  it('un access token vencido se rechaza', async () => {
    const short = await startApp({ ACCESS_TTL_SECONDS: '1' })
    try {
      const s = await login(short, 'g-3')
      await new Promise((r) => setTimeout(r, 2100))
      await short.http().get('/me').set(bearer(s.token)).expect(401)
    } finally {
      await short.close()
    }
  })
})

describe('refresh rotativo', () => {
  it('renueva el access token y rota la cookie', async () => {
    const s = await login(t, 'r-1')
    const r = await t.http().post('/auth/refresh').set('Cookie', s.cookie).expect(200)
    expect(r.body.accessToken).toBeTruthy()
    const next = (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!
    expect(next).not.toBe(s.cookie)
    await t.http().get('/me').set(bearer(r.body.accessToken)).expect(200)
  })

  it('reutilizar un token ya rotado cierra toda la familia', async () => {
    const s = await login(t, 'r-2')
    const r1 = await t.http().post('/auth/refresh').set('Cookie', s.cookie).expect(200)
    const newer = (r1.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!
    // Se simula que pasó el margen entre pestañas: el token viejo se reusa mucho después.
    await t.prisma.session.updateMany({ where: { revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } })
    await t.http().post('/auth/refresh').set('Cookie', s.cookie).expect(401)
    // El token más nuevo también quedó revocado.
    await t.http().post('/auth/refresh').set('Cookie', newer).expect(401)
  })

  it('dos renovaciones simultáneas con el mismo token no cierran la sesión', async () => {
    const s = await login(t, 'r-3')
    const [a, b] = await Promise.all([t.http().post('/auth/refresh').set('Cookie', s.cookie), t.http().post('/auth/refresh').set('Cookie', s.cookie)])
    expect([a.status, b.status].sort()).toEqual([200, 401])
    const ok = a.status === 200 ? a : b
    const cookie = (ok.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!
    await t.http().post('/auth/refresh').set('Cookie', cookie).expect(200)
  })

  it('sin cookie, con cookie falsa o desde otro origen no renueva', async () => {
    await t.http().post('/auth/refresh').expect(401)
    await t.http().post('/auth/refresh').set('Cookie', 'gpsm_rt=abc.def').expect(401)
    const s = await login(t, 'r-4')
    await t.http().post('/auth/refresh').set('Cookie', s.cookie).set('Origin', 'https://malo.example').expect(403)
    await t.http().post('/auth/refresh').set('Cookie', s.cookie).set('Origin', WEB_ORIGIN).expect(200)
  })

  it('cerrar sesión invalida el refresh', async () => {
    const s = await login(t, 'r-5')
    await t.http().post('/auth/logout').set('Cookie', s.cookie).expect(204)
    await t.http().post('/auth/refresh').set('Cookie', s.cookie).expect(401)
  })

  it('un refresh vencido se rechaza', async () => {
    const s = await login(t, 'r-6')
    await t.prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    await t.http().post('/auth/refresh').set('Cookie', s.cookie).expect(401)
  })
})

describe('cuenta', () => {
  it('borrar la cuenta elimina también sus datos', async () => {
    const s = await login(t, 'd-1')
    await t.http().post('/sync/push').set(bearer(s.token)).send({ waypoints: [waypoint({ id: uuid() })] }).expect(200)
    expect(await t.prisma.waypoint.count()).toBe(1)
    await t.http().delete('/me').set(bearer(s.token)).expect(204)
    expect(await t.prisma.user.count()).toBe(0)
    expect(await t.prisma.waypoint.count()).toBe(0)
    await t.http().post('/auth/refresh').set('Cookie', s.cookie).expect(401)
    expect(googleToken('x')).toContain('fake-google')
  })
})
