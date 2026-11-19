import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import jwt from 'jsonwebtoken'
import { CONFIG, type AppConfig } from '../config'

@Injectable()
export class TokenService {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  signAccess(userId: string): string {
    return jwt.sign({}, this.config.jwtSecret, { algorithm: 'HS256', subject: userId, expiresIn: this.config.accessTtlSeconds })
  }

  /** Devuelve el id de usuario del access token o lanza 401. */
  verifyAccess(token: string): string {
    try {
      const p = jwt.verify(token, this.config.jwtSecret, { algorithms: ['HS256'] })
      if (typeof p === 'object' && typeof p.sub === 'string') return p.sub
    } catch {
      /* cae al 401 */
    }
    throw new UnauthorizedException('Token inválido o vencido')
  }
}
