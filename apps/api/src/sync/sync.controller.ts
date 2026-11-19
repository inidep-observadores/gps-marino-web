import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import { pullQuerySchema, pushRequestSchema, trackPointsQuerySchema, type PullResponse, type PushPayload, type PushResponse, type TrackPointSync } from '@gpsm/shared'
import { CurrentUserId } from '../auth/current-user'
import { ZodPipe } from '../common/zod.pipe'
import { SyncService } from './sync.service'

function jsonSchemaOf(schema: z.ZodType): object {
  try {
    return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as object
  } catch {
    return { type: 'object' }
  }
}

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(@Inject(SyncService) private readonly sync: SyncService) {}

  @Post('push')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sube los registros modificados (última escritura gana por registro)' })
  @ApiBody({ schema: jsonSchemaOf(pushRequestSchema) })
  push(@CurrentUserId() userId: string, @Body(new ZodPipe(pushRequestSchema)) body: PushPayload): Promise<PushResponse> {
    return this.sync.push(userId, body)
  }

  @Get('pull')
  @ApiOperation({ summary: 'Cambios posteriores a un cursor (`since`); repetir mientras `hasMore` sea verdadero' })
  pull(@CurrentUserId() userId: string, @Query(new ZodPipe(pullQuerySchema)) q: z.output<typeof pullQuerySchema>): Promise<PullResponse> {
    return this.sync.pull(userId, q.since, q.limit)
  }

  @Get('tracks/:id/points')
  @ApiOperation({ summary: 'Puntos de una derrota, por tandas (`next` = desde qué `seq` seguir, o null)' })
  trackPoints(
    @CurrentUserId() userId: string,
    @Param('id', new ZodPipe(z.uuid())) id: string,
    @Query(new ZodPipe(trackPointsQuerySchema)) q: z.output<typeof trackPointsQuerySchema>,
  ): Promise<{ points: TrackPointSync[]; next: number | null }> {
    return this.sync.trackPoints(userId, id, q.from, q.limit)
  }
}
