import { z } from 'zod'

export const CONFIG = Symbol('CONFIG')

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  WEB_ORIGINS: z.string().default('http://localhost:5180'),
  PORT: z.coerce.number().int().default(3000),
  NODE_ENV: z.string().default('development'),
  /** Vida del access token (segundos). */
  ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  /** Vida del refresh token (días): larga, porque a bordo puede pasar mucho tiempo sin conexión. */
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(60),
  /** `none` si la web y la API están en sitios distintos (exige HTTPS). */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  /** Tope de contenido de capas importadas por usuario (bytes). */
  LAYER_QUOTA_BYTES: z.coerce.number().int().positive().default(50_000_000),
})

export interface AppConfig {
  databaseUrl: string
  jwtSecret: string
  googleClientId: string
  webOrigins: string[]
  port: number
  production: boolean
  accessTtlSeconds: number
  refreshTtlDays: number
  cookieSameSite: 'lax' | 'strict' | 'none'
  layerQuotaBytes: number
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const e = schema.parse(env)
  return {
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    googleClientId: e.GOOGLE_CLIENT_ID,
    webOrigins: e.WEB_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    port: e.PORT,
    production: e.NODE_ENV === 'production',
    accessTtlSeconds: e.ACCESS_TTL_SECONDS,
    refreshTtlDays: e.REFRESH_TTL_DAYS,
    cookieSameSite: e.COOKIE_SAMESITE,
    layerQuotaBytes: e.LAYER_QUOTA_BYTES,
  }
}
