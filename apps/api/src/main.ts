import 'reflect-metadata'
import { createApp } from './bootstrap'
import { loadConfig } from './config'

const config = loadConfig()
const app = await createApp(config)
await app.listen(config.port)
console.log(`API escuchando en http://localhost:${config.port}${config.production ? '' : ' (documentación en /docs)'}`)
