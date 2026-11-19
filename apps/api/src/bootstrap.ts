import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import type { AppConfig } from './config'

/** Configuración común de la aplicación (CORS, cookies, límites). La usan `main.ts` y los tests e2e. */
export function configureApp(app: NestExpressApplication, config: AppConfig) {
  app.use(cookieParser())
  // Las capas importadas pueden pesar varios MB.
  app.useBodyParser('json', { limit: '15mb' })
  app.enableCors({ origin: config.webOrigins, credentials: true })
  app.set('trust proxy', 1)
  app.disable('x-powered-by')
}

export async function createApp(config: AppConfig): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), { logger: ['error', 'warn', 'log'] })
  configureApp(app, config)
  if (!config.production) {
    const doc = new DocumentBuilder().setTitle('GPS Marino Web API').setDescription('Cuentas y sincronización').setVersion('0.1.0').addBearerAuth().build()
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc))
  }
  return app
}
