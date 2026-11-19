import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n } from './i18n'
import { useDatabaseStore } from './stores/database'
import { useGpsStore } from './stores/gps'
import { useNavigationStore } from './stores/navigation'
import { usePrefsStore } from './stores/prefs'
import { useWaypointsStore } from './stores/waypoints'
import './style.css'

const app = createApp(App)
app.use(createPinia()).use(i18n)

const prefs = usePrefsStore()
watch(
  () => prefs.locale,
  (locale) => {
    i18n.global.locale.value = locale
    document.documentElement.lang = locale
  },
  { immediate: true },
)

// La base local se abre en paralelo al primer render; los stores esperan `database.ready()`.
const database = useDatabaseStore()
const navigation = useNavigationStore()
const waypoints = useWaypointsStore()
const gps = useGpsStore()
void database
  .open()
  .then(() => Promise.all([navigation.load(), waypoints.load()]))
  .catch((e) => console.error('[db]', e))

// Como la app Flutter, el GPS arranca solo al abrir... si el permiso ya estaba concedido (no se pide sin un gesto).
void gps.autoStart()

// Solo en desarrollo: acceso desde la consola y buque simulado (el navegador integrado no tiene GPS real).
if (import.meta.env.DEV) {
  void import('./services/simulatedGeo').then(({ createSimulatedSource }) => {
    ;(window as unknown as { __gpsm: unknown }).__gpsm = {
      database,
      gps,
      navigation,
      waypoints,
      /** `__gpsm.simulate({ lat: -38, lon: -57.5, speedKn: 8, courseDeg: 135 })` → devuelve el control (`.set({...})`). */
      simulate(opts: Parameters<typeof createSimulatedSource>[0]) {
        const src = createSimulatedSource(opts)
        gps.useSource(src)
        return src
      },
    }
  })
}

app.mount('#app')
