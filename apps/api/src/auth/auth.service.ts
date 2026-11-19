import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { CONFIG, type AppConfig } from '../config'
import { PrismaService } from '../prisma.service'
import { GOOGLE_VERIFIER, type GoogleVerifier } from './google-verifier'
import { TokenService } from './token.service'

export interface PublicUser {
  id: string
  email: string
  name: string | null
  picture: string | null
}

export interface LoginResult {
  user: PublicUser
  accessToken: string
  expiresIn: number
  /** Valor para la cookie httpOnly (`<sesión>.<secreto>`); no va en el cuerpo de la respuesta. */
  refreshToken: string
}

/** Si dos pestañas renuevan a la vez, la segunda llega con un token recién rotado: no es un robo, se rechaza sin revocar. */
const ROTATION_GRACE_MS = 10_000

const sha256 = (s: string) => createHash('sha256').update(s).digest()

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(GOOGLE_VERIFIER) private readonly google: GoogleVerifier,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async loginWithGoogle(idToken: string, userAgent?: string): Promise<LoginResult> {
    const g = await this.google.verify(idToken)
    const user = await this.prisma.user.upsert({
      where: { googleSub: g.sub },
      create: { googleSub: g.sub, email: g.email, name: g.name ?? null, picture: g.picture ?? null },
      update: { email: g.email, name: g.name ?? null, picture: g.picture ?? null, lastLoginAt: new Date() },
    })
    const refreshToken = await this.createSession(user.id, crypto.randomUUID(), userAgent)
    return this.result(user, refreshToken)
  }

  /** Renueva la sesión: el refresh token usado queda revocado y se entrega uno nuevo (rotación). */
  async refresh(raw: string | undefined, userAgent?: string): Promise<LoginResult> {
    const [sessionId, secret] = (raw ?? '').split('.')
    if (!sessionId || !secret) throw new UnauthorizedException('Sesión inválida')
    const session = await this.prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } })
    const expected = session ? Buffer.from(session.tokenHash, 'hex') : null
    const given = sha256(secret)
    if (!session || !expected || expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new UnauthorizedException('Sesión inválida')
    }
    if (session.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('La sesión venció')
    if (session.revokedAt) {
      // Un token ya rotado que se vuelve a usar fuera del margen = posible robo: se cierra toda la familia.
      if (Date.now() - session.revokedAt.getTime() > ROTATION_GRACE_MS) {
        await this.prisma.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } })
      }
      throw new UnauthorizedException('Sesión inválida')
    }
    // `updateMany` con revokedAt null hace de cerrojo: si dos pedidos llegan juntos, solo uno rota.
    const rotated = await this.prisma.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } })
    if (rotated.count !== 1) throw new UnauthorizedException('Sesión inválida')
    const refreshToken = await this.createSession(session.userId, session.familyId, userAgent)
    return this.result(session.user, refreshToken)
  }

  /** Cierra la sesión (toda su familia). Si el token no sirve no hay nada que cerrar. */
  async logout(raw: string | undefined): Promise<void> {
    const sessionId = (raw ?? '').split('.')[0]
    if (!sessionId) return
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } })
    if (session) await this.prisma.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } })
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException('La cuenta ya no existe')
    return this.publicUser(user)
  }

  /** Borra la cuenta y todos sus datos (cascada). */
  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.user.deleteMany({ where: { id: userId } })
  }

  private async createSession(userId: string, familyId: string, userAgent?: string): Promise<string> {
    const secret = randomBytes(32).toString('base64url')
    const s = await this.prisma.session.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(secret).toString('hex'),
        userAgent: userAgent?.slice(0, 300) ?? null,
        expiresAt: new Date(Date.now() + this.config.refreshTtlDays * 86_400_000),
      },
    })
    return `${s.id}.${secret}`
  }

  private publicUser(u: { id: string; email: string; name: string | null; picture: string | null }): PublicUser {
    return { id: u.id, email: u.email, name: u.name, picture: u.picture }
  }

  private result(user: Parameters<AuthService['publicUser']>[0], refreshToken: string): LoginResult {
    return { user: this.publicUser(user), accessToken: this.tokens.signAccess(user.id), expiresIn: this.config.accessTtlSeconds, refreshToken }
  }
}
