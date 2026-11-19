import { Global, Module, type DynamicModule } from '@nestjs/common'
import { AuthModule } from './auth/auth.module'
import { CONFIG, type AppConfig } from './config'
import { HealthController } from './health.controller'
import { PrismaService } from './prisma.service'
import { SyncModule } from './sync/sync.module'

@Global()
@Module({})
class CoreModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: CoreModule,
      providers: [{ provide: CONFIG, useValue: config }, PrismaService],
      exports: [CONFIG, PrismaService],
    }
  }
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return { module: AppModule, imports: [CoreModule.forRoot(config), AuthModule, SyncModule], controllers: [HealthController] }
  }
}
