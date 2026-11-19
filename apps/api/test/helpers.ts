import { UnauthorizedException } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { GOOGLE_VERIFIER, type GoogleVerifier } from '../src/auth/google-verifier'
import { configureApp } from '../src/bootstrap'
import { loadConfig, type AppConfig } from '../src/config'
import { PrismaService } from '../src/prisma.service'
import { TEST_DB_URL } from './global-setup'

/** Verificador falso: el "ID token" es `fake-google|<sub>|<correo>`. */
const fakeGoogle: GoogleVerifier = {
  async verify(idToken) {
    const [tag, sub, email] = idToken.split('|')
    if (tag !== 'fake-google' || !sub || !email) throw new UnauthorizedException('Token de Google inválido')
    return { sub, email, name: `Usuario ${sub}` }
  },
}
export const googleToken = (sub: string, email = `${sub}@example.com`) => `fake-google|${sub}|${email}`

export const WEB_ORIGIN = 'http://localhost:5180'

export interface TestApp {
  app: NestExpressApplication
  prisma: PrismaService
  config: AppConfig
  http: () => ReturnType<typeof request>
  close: () => Promise<void>
}

export async function startApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  const config = loadConfig({
    DATABASE_URL: TEST_DB_URL,
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    WEB_ORIGINS: WEB_ORIGIN,
    ...overrides,
  })
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
    .overrideProvider(GOOGLE_VERIFIER)
    .useValue(fakeGoogle)
    .compile()
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false })
  configureApp(app, config)
  await app.init()
  const prisma = app.get(PrismaService)
  return { app, prisma, config, http: () => request(app.getHttpServer()), close: () => app.close() }
}

export async function resetDb(prisma: PrismaService) {
  await prisma.$executeRaw`TRUNCATE "User" CASCADE`
}

/** Inicia sesión y devuelve el access token, la cookie de refresh y el id del usuario. */
export async function login(t: TestApp, sub: string) {
  const res = await t.http().post('/auth/google').send({ idToken: googleToken(sub) }).expect(200)
  const cookies = res.headers['set-cookie'] as unknown as string[]
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, cookie: cookies[0]!.split(';')[0]!, cookies, body: res.body }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
export const bearer = auth

let counter = 0
/** UUID v7-like válido para los tests (el esquema solo exige formato UUID). */
export const uuid = () => `0190a4b8-7c1d-7000-8000-${String(++counter).padStart(12, '0')}`

export const waypoint = (over: Record<string, unknown> = {}) => ({
  id: uuid(), createdAt: 1_000, updatedAt: 1_000, deletedAt: null, description: 'Lance 1', recordedAt: 1_000,
  lat: -38.05, lon: -57.5, speedKn: 5, bearing: 90, icon: 'fishFins', color: 'red', visible: true, ...over,
})
