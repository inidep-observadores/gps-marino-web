import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { GOOGLE_VERIFIER, GoogleTokenVerifier } from './google-verifier'
import { JwtGuard } from './jwt.guard'
import { TokenService } from './token.service'

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    GoogleTokenVerifier,
    { provide: GOOGLE_VERIFIER, useExisting: GoogleTokenVerifier },
    { provide: APP_GUARD, useClass: JwtGuard },
  ],
})
export class AuthModule {}
