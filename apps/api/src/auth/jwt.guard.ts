import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { type AuthedRequest } from './current-user'
import { IS_PUBLIC } from './public.decorator'
import { TokenService } from './token.service'

/** Guard global: toda ruta exige `Authorization: Bearer <access token>` salvo las marcadas con `@Public()`. */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true
    const req = ctx.switchToHttp().getRequest<AuthedRequest>()
    const header = req.headers.authorization ?? ''
    const [scheme, token] = header.split(' ')
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Falta el token de acceso')
    req.userId = this.tokens.verifyAccess(token)
    return true
  }
}
