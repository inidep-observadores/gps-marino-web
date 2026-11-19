import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

export interface AuthedRequest extends Request {
  userId?: string
}

/** Id del usuario autenticado (lo pone el guard a partir del access token). */
export const CurrentUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const id = ctx.switchToHttp().getRequest<AuthedRequest>().userId
  if (!id) throw new Error('CurrentUserId usado en una ruta pública')
  return id
})
