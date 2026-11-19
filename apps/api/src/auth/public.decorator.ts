import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC = 'isPublic'
/** Ruta abierta: no exige access token (el guard es global y por defecto todo lo exige). */
export const Public = () => SetMetadata(IS_PUBLIC, true)
