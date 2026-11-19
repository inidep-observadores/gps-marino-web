import { BadRequestException, type PipeTransform } from '@nestjs/common'
import type { z } from 'zod'

/** Valida con un esquema zod (los mismos que usa la web) y devuelve el valor ya tipado y con valores por defecto. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}
  transform(value: unknown): z.output<S> {
    const r = this.schema.safeParse(value)
    if (!r.success) {
      throw new BadRequestException({
        message: 'Datos inválidos',
        issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
    }
    return r.data
  }
}
