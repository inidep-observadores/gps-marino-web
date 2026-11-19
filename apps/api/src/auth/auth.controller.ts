import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { ZodPipe } from '../common/zod.pipe'
import { CONFIG, type AppConfig } from '../config'
import { AuthService, type LoginResult, type PublicUser } from './auth.service'
import { CurrentUserId } from './current-user'
import { Public } from './public.decorator'

const googleLoginSchema = z.object({ idToken: z.string().min(20).max(4000) })
export const REFRESH_COOKIE = 'gpsm_rt'

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('auth/google')
  @HttpCode(200)
  @ApiOperation({ summary: 'Inicia sesión con un ID token de Google; deja el refresh token en una cookie httpOnly' })
  @ApiBody({ schema: z.toJSONSchema(googleLoginSchema) as object })
  async google(@Body(new ZodPipe(googleLoginSchema)) body: z.infer<typeof googleLoginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.loginWithGoogle(body.idToken, req.get('user-agent')))
  }

  @Public()
  @Post('auth/refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renueva el access token con la cookie de refresh (y la rota)' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertSameOrigin(req)
    return this.respond(res, await this.auth.refresh(this.cookieOf(req), req.get('user-agent')))
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cierra la sesión y borra la cookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertSameOrigin(req)
    await this.auth.logout(this.cookieOf(req))
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions())
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Datos de la cuenta' })
  me(@CurrentUserId() userId: string): Promise<PublicUser> {
    return this.auth.me(userId)
  }

  @Delete('me')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Borra la cuenta y todos sus datos del servidor' })
  async deleteMe(@CurrentUserId() userId: string, @Res({ passthrough: true }) res: Response) {
    await this.auth.deleteAccount(userId)
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions())
  }

  private respond(res: Response, r: LoginResult) {
    res.cookie(REFRESH_COOKIE, r.refreshToken, { ...this.cookieOptions(), maxAge: this.config.refreshTtlDays * 86_400_000 })
    return { user: r.user, accessToken: r.accessToken, expiresIn: r.expiresIn }
  }

  private cookieOptions() {
    return { httpOnly: true, secure: this.config.production || this.config.cookieSameSite === 'none', sameSite: this.config.cookieSameSite, path: '/auth' } as const
  }

  private cookieOf(req: Request): string | undefined {
    const c = (req as Request & { cookies?: Record<string, string> }).cookies
    return c?.[REFRESH_COOKIE]
  }

  /** Defensa extra contra CSRF: si el navegador informa el origen, tiene que ser el de la web. */
  private assertSameOrigin(req: Request) {
    const origin = req.get('origin')
    if (origin && !this.config.webOrigins.includes(origin)) throw new ForbiddenException('Origen no permitido')
  }
}
