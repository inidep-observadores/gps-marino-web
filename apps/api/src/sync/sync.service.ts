import { HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import {
  clampUpdatedAt,
  incomingWins,
  type PullResponse,
  type PushPayload,
  type PushResponse,
  type PushResult,
  type RouteSync,
  type TrackPointSync,
} from '@gpsm/shared'
import { CONFIG, type AppConfig } from '../config'
import { Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma.service'

type Results = Record<string, PushResult>
type Known = Map<string, { updatedAt: number; serverVersion: number }>

const json = (v: unknown) => (v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue))

/**
 * Sincronización por usuario. Cada pedido de `push` corre en una transacción que bloquea la fila del usuario:
 * así los `serverVersion` se asignan en orden y nunca quedan "huecos" visibles para un `pull` concurrente.
 */
@Injectable()
export class SyncService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async push(userId: string, p: PushPayload): Promise<PushResponse> {
    const now = Date.now()
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ syncVersion: number }[]>`SELECT "syncVersion" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
        if (!rows[0]) throw new UnauthorizedException('La cuenta ya no existe')
        const start = rows[0].syncVersion
        let version = start
        const bump = () => ++version

        const waypoints = await this.apply(
          p.waypoints,
          await this.known(tx.waypoint.findMany({ where: { userId, id: { in: p.waypoints.map((w) => w.id) } }, select: { id: true, updatedAt: true, serverVersion: true } })),
          now,
          bump,
          async ({ id, ...w }, serverVersion, exists) => {
            const data = { ...w, serverVersion }
            if (exists) await tx.waypoint.update({ where: { userId_id: { userId, id } }, data })
            else await tx.waypoint.create({ data: { ...data, userId, id } })
          },
        )

        if (p.layers.length) await this.checkLayerQuota(tx, userId, p.layers)
        const layers = await this.apply(
          p.layers,
          await this.known(tx.importedLayer.findMany({ where: { userId, id: { in: p.layers.map((l) => l.id) } }, select: { id: true, updatedAt: true, serverVersion: true } })),
          now,
          bump,
          async ({ id, ...l }, serverVersion, exists) => {
            // Una capa borrada no necesita guardar su contenido (puede ser grande).
            const content = l.deletedAt === null ? l.content : ''
            const data = { ...l, content, sizeBytes: Buffer.byteLength(content), hiddenFeatures: json(l.hiddenFeatures), serverVersion }
            if (exists) await tx.importedLayer.update({ where: { userId_id: { userId, id } }, data })
            else await tx.importedLayer.create({ data: { ...data, userId, id } })
          },
        )

        const tracks = await this.apply(
          p.tracks,
          await this.known(tx.track.findMany({ where: { userId, id: { in: p.tracks.map((t) => t.id) } }, select: { id: true, updatedAt: true, serverVersion: true } })),
          now,
          bump,
          async ({ id, ...t }, serverVersion, exists) => {
            const data = { ...t, serverVersion }
            if (exists) await tx.track.update({ where: { userId_id: { userId, id } }, data })
            else await tx.track.create({ data: { ...data, userId, id } })
            if (t.deletedAt !== null) await tx.trackPoint.deleteMany({ where: { userId, trackId: id } })
          },
        )

        await this.appendTrackPoints(tx, userId, p.trackPoints)

        const settings = await this.apply(
          p.settings.map((s) => ({ ...s, id: s.key })),
          await this.known(tx.userSetting.findMany({ where: { userId, key: { in: p.settings.map((s) => s.key) } }, select: { key: true, updatedAt: true, serverVersion: true } }).then((r) => r.map((x) => ({ id: x.key, updatedAt: x.updatedAt, serverVersion: x.serverVersion })))),
          now,
          bump,
          async ({ key, value, updatedAt }, serverVersion, exists) => {
            if (exists) await tx.userSetting.update({ where: { userId_key: { userId, key } }, data: { value: json(value), updatedAt, serverVersion } })
            else await tx.userSetting.create({ data: { userId, key, value: json(value), updatedAt, serverVersion } })
          },
        )

        let route: PushResult | null = null
        if (p.route) {
          const r = await this.applyRoute(tx, userId, p.route, now, bump)
          route = r
        }

        if (version !== start) await tx.user.update({ where: { id: userId }, data: { syncVersion: version } })
        return { cursor: version, waypoints, layers, tracks, settings, route }
      },
      { timeout: 60_000, maxWait: 10_000 },
    )
  }

  async pull(userId: string, since: number, limit: number): Promise<PullResponse> {
    const where = { userId, serverVersion: { gt: since } }
    const q = { where, orderBy: { serverVersion: 'asc' as const }, take: limit + 1 }
    // Una sola foto de la base: si entra un push entre consulta y consulta no se pierden cambios.
    const [w, l, t, s, r] = await this.prisma.$transaction(
      [
        this.prisma.waypoint.findMany(q),
        this.prisma.importedLayer.findMany(q),
        this.prisma.track.findMany(q),
        this.prisma.userSetting.findMany(q),
        this.prisma.activeRoute.findMany({ where, take: 1 }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )

    const all = [
      ...w.map((row) => ({ v: row.serverVersion, kind: 'w' as const, row })),
      ...l.map((row) => ({ v: row.serverVersion, kind: 'l' as const, row })),
      ...t.map((row) => ({ v: row.serverVersion, kind: 't' as const, row })),
      ...s.map((row) => ({ v: row.serverVersion, kind: 's' as const, row })),
      ...r.map((row) => ({ v: row.serverVersion, kind: 'r' as const, row })),
    ].sort((a, b) => a.v - b.v)
    const hasMore = all.length > limit
    const page = all.slice(0, limit)

    const out: PullResponse = { cursor: page.length ? page[page.length - 1]!.v : since, hasMore, waypoints: [], layers: [], tracks: [], settings: [], route: null }
    for (const e of page) {
      switch (e.kind) {
        case 'w': {
          const { userId: _u, ...row } = e.row
          out.waypoints.push(row as PullResponse['waypoints'][number])
          break
        }
        case 'l': {
          const { userId: _u, sizeBytes: _s, ...row } = e.row
          out.layers.push({ ...row, hiddenFeatures: row.hiddenFeatures as string[] } as PullResponse['layers'][number])
          break
        }
        case 't': {
          const { userId: _u, ...row } = e.row
          out.tracks.push(row)
          break
        }
        case 's':
          out.settings.push({ key: e.row.key, value: e.row.value as never, updatedAt: e.row.updatedAt, serverVersion: e.row.serverVersion })
          break
        case 'r':
          out.route = { points: e.row.points as RouteSync['points'], updatedAt: e.row.updatedAt, serverVersion: e.row.serverVersion }
          break
      }
    }
    return out
  }

  async trackPoints(userId: string, trackId: string, from: number, limit: number): Promise<{ points: TrackPointSync[]; next: number | null }> {
    const track = await this.prisma.track.findUnique({ where: { userId_id: { userId, id: trackId } }, select: { deletedAt: true } })
    if (!track || track.deletedAt !== null) throw new NotFoundException('Derrota inexistente')
    const rows = await this.prisma.trackPoint.findMany({ where: { userId, trackId, seq: { gte: from } }, orderBy: { seq: 'asc' }, take: limit + 1 })
    const page = rows.slice(0, limit)
    return {
      points: page.map(({ seq, t, lat, lon, speedKn, courseDeg }) => ({ seq, t, lat, lon, speedKn, courseDeg })),
      next: rows.length > limit ? rows[limit]!.seq : null,
    }
  }

  // ---------- internos ----------

  private async known(q: Promise<{ id: string; updatedAt: number; serverVersion: number }[]>): Promise<Known> {
    return new Map((await q).map((r) => [r.id, { updatedAt: r.updatedAt, serverVersion: r.serverVersion }]))
  }

  /** Aplica "última escritura gana" a cada registro; `write` hace el insert o el update ya con el `serverVersion` nuevo. */
  private async apply<T extends { id: string; updatedAt: number }>(
    items: T[],
    known: Known,
    now: number,
    bump: () => number,
    write: (item: T, serverVersion: number, exists: boolean) => Promise<void>,
  ): Promise<Results> {
    const results: Results = {}
    for (const item of items) {
      const existing = known.get(item.id)
      const updatedAt = clampUpdatedAt(item.updatedAt, now)
      if (existing && !incomingWins(updatedAt, existing.updatedAt)) {
        results[item.id] = { applied: false, serverVersion: existing.serverVersion }
        continue
      }
      const serverVersion = bump()
      await write({ ...item, updatedAt }, serverVersion, !!existing)
      known.set(item.id, { updatedAt, serverVersion })
      results[item.id] = { applied: true, serverVersion }
    }
    return results
  }

  private async applyRoute(tx: Prisma.TransactionClient, userId: string, r: RouteSync, now: number, bump: () => number): Promise<PushResult> {
    const existing = await tx.activeRoute.findUnique({ where: { userId } })
    const updatedAt = clampUpdatedAt(r.updatedAt, now)
    if (existing && !incomingWins(updatedAt, existing.updatedAt)) return { applied: false, serverVersion: existing.serverVersion }
    const serverVersion = bump()
    const data = { points: json(r.points), updatedAt, serverVersion }
    await tx.activeRoute.upsert({ where: { userId }, create: { userId, ...data }, update: data })
    return { applied: true, serverVersion }
  }

  private async appendTrackPoints(tx: Prisma.TransactionClient, userId: string, groups: PushPayload['trackPoints']) {
    if (!groups.length) return
    const alive = new Set(
      (await tx.track.findMany({ where: { userId, deletedAt: null, id: { in: groups.map((g) => g.trackId) } }, select: { id: true } })).map((t) => t.id),
    )
    for (const g of groups) {
      if (!alive.has(g.trackId) || !g.points.length) continue
      await tx.trackPoint.createMany({ data: g.points.map((pt) => ({ ...pt, userId, trackId: g.trackId })), skipDuplicates: true })
    }
  }

  private async checkLayerQuota(tx: Prisma.TransactionClient, userId: string, incoming: PushPayload['layers']) {
    const replaced = incoming.map((l) => l.id)
    const stored = await tx.importedLayer.aggregate({ where: { userId, id: { notIn: replaced } }, _sum: { sizeBytes: true } })
    const added = incoming.filter((l) => l.deletedAt === null).reduce((n, l) => n + Buffer.byteLength(l.content), 0)
    if ((stored._sum.sizeBytes ?? 0) + added > this.config.layerQuotaBytes) {
      throw new HttpException('Se superó el espacio disponible para capas importadas', HttpStatus.PAYLOAD_TOO_LARGE)
    }
  }
}
