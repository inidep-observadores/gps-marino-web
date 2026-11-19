import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n } from './i18n'
import { useDatabaseStore } from './stores/database'
import { usePrefsStore } from './stores/prefs'
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

// La base local se abre en paralelo al primer render; las vistas esperan `database.ready()`.
const database = useDatabaseStore()
void database.open().catch((e) => console.error('[db]', e))

// Acceso desde la consola solo en desarrollo, para inspeccionar y probar la base.
if (import.meta.env.DEV) (window as unknown as { __gpsm: unknown }).__gpsm = { database }

app.mount('#app')
