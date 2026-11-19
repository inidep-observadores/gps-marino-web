import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { OAuth2Client } from 'google-auth-library'
import { CONFIG, type AppConfig } from '../config'

export interface GoogleIdentity {
  sub: string
  email: string
  name?: string
  picture?: string
}

export const GOOGLE_VERIFIER = Symbol('GOOGLE_VERIFIER')
export interface GoogleVerifier {
  verify(idToken: string): Promise<GoogleIdentity>
}

/** Verifica el ID token de Google Identity Services (firma, vencimiento y audiencia = nuestro client id). */
@Injectable()
export class GoogleTokenVerifier implements GoogleVerifier {
  private client = new OAuth2Client()
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (!this.config.googleClientId) throw new ServiceUnavailableException('El inicio de sesión con Google no está configurado')
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.config.googleClientId })
      const p = ticket.getPayload()
      if (!p?.sub || !p.email || !p.email_verified) throw new Error('Cuenta de Google sin correo verificado')
      return { sub: p.sub, email: p.email, name: p.name, picture: p.picture }
    } catch {
      throw new UnauthorizedException('Token de Google inválido')
    }
  }
}
