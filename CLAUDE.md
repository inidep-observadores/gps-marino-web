# CLAUDE.md — GPS Marino Web

Réplica web de **Marine Onboard GPS** (Flutter, en `D:\Desarrollo\Flutter\Movil\Proyectos\marine_onboard_gps`) con el stack y el sistema de diseño de **Drone Forecast** (`D:\Desarrollo\_PROYECTOS\Drones\Drone Forecast`). Plan, decisiones y fases en `PLAN.md`: leerlo antes de agregar funciones. Para replicar una función, mirar primero cómo la resuelve la app Flutter (`lib/src/modules/...`) y cómo resuelve Drone Forecast la parte web equivalente.

## Comandos (raíz, pnpm)
- `pnpm install` — dependencias del monorepo.
- `pnpm dev` — servidor de desarrollo de la web (Vite). En el navegador integrado: config `web` de `.claude/launch.json` (puerto 5180); `web-preview` sirve `dist/` en 4180 (service worker y modo sin conexión).
- `pnpm typecheck` / `pnpm test` / `pnpm build` — en todos los paquetes.
- `pnpm db:generate` — tras cambiar `apps/web/src/db/schema.ts`, genera la migración SQL (drizzle-kit). Nunca editar a mano una migración ya publicada: crear otra.

Antes de dar algo por terminado: `pnpm build && pnpm test`.

## Estructura
```
packages/shared/      TS puro (sin Vue ni Nest): dominio + esquemas zod (domain.ts), íconos/colores de marca
                      compatibles con Flutter (marks.ts), uuidv7 (ids.ts), búsqueda sin acentos (text.ts). Con tests.
apps/web/
  src/db/             schema.ts (Drizzle), migrations/ (generadas), migrations.ts (glob de Vite),
                      engine.ts (motor SQL síncrono sobre sqlite-wasm: lo usan el worker y los tests),
                      worker.ts (SQLite + OPFS opfs-sahpool, expuesto con Comlink), client.ts (Drizzle sqlite-proxy),
                      protocol.ts (API del worker, nombre de archivo por usuario)
  src/repositories/   waypoints, layers, settings (+ ruta activa): interfaz + implementación Drizzle; reloj inyectable
  src/stores/         prefs (idioma y tema, localStorage), ui (vista por hash + hoja abierta), database (base abierta + repos)
  src/composables/    useTheme, useConfirm, useOnline, useMediaQuery, usePwaInstall, useNavItems, storage
  src/components/     ui/ (BaseSheet, ConfirmDialog, CardSection, ReadoutTile, SegmentedControl, StatusPill),
                      layout/ (AppHeader, AppNav, AppFooter, AppSheets, ConfirmHost, ConnectionBanner, AppLogo), panels/
  src/views/          GpsView, WaypointsView, MapView (por hash en App.vue, con KeepAlive)
  src/i18n/           es.ts (fuente de las claves) y en.ts (tipado contra es)
  tests/              Vitest en Node con SQLite real en memoria (tests/helpers/testDb.ts)
```

## Convenciones
- **Unidades internas:** velocidad en **nudos**, rumbo en grados 0–360, coordenadas en grados decimales WGS84, instantes en ms (UTC). Distancias de navegación en **millas náuticas** (1 Nm = 1852 m). Convertir solo al mostrar.
- **Formatos de la app original** (replicarlos): lat/lon `GG° MM,mmm' N/S/E/O`, rumbo `000°`, velocidad `x.x kn`, distancia `x.xx Nmi`.
- **Datos locales:** toda entidad sincronizable lleva `id` UUID v7 (cliente), `created_at`, `updated_at`, `deleted_at` (borrado lógico) y `dirty`. Los repositorios marcan `dirty` y nunca borran filas físicamente (salvo la ruta activa y ajustes). Ver `PLAN.md` §3.3 y §3.7.
- **Íconos/colores de marca:** se guardan como clave (`'fishFins'`), no índice. El orden de `MARK_ICONS`/`MARK_COLORS` es el del enum de Flutter: no reordenar, agregar al final (las copias `MogData.json` usan índices).
- **Preferencias del dispositivo** (tema, idioma) en localStorage `gpsm.prefs.v1` (el script de `index.html` lo lee: si cambia la clave, actualizar ambos). **Ajustes que viajan con la cuenta** (mapa, rutas, capas base) en la tabla `settings` vía `SettingsRepository`.
- **Lógica nueva = test nuevo.** La lógica pura (navegación, formatos, parsers) va en `packages/shared` o en módulos sin Vue; no tocar la red ni el DOM desde ahí.
- **i18n:** toda cadena visible en `es.ts` y `en.ts`. No usar `|`, `@`, `{`, `$` literales salvo pluralización/interpolación intencional. Español neutro (tuteo, sin voseo ni regionalismos).
- Confirmaciones con `useConfirm()` + `ConfirmHost`, nunca `window.confirm`/`alert`.
- Sin secretos ni claves de API en el cliente.

## Diseño y estilos (heredado de Drone Forecast)
- Tailwind v4 sin config: todo en `src/style.css`. Tokens `--ds-*` por tema: `:root` (claro), `[data-theme='dark']`, `[data-theme='night']` (rojo tenue para el puente de noche). La variante `dark:` cubre oscuro y nocturno. **No usar colores de la paleta de Tailwind ni hex sueltos en componentes.**
- Clases semánticas (`card`, `readout`, `btn-*`, `chip`, `segmented`, `list`/`list-row`, `sheet`, `status-pill`, `bottom-bar`, `map-chip`...). Estado con `data-status="green|yellow|red|none"` y siempre con texto.
- Colores de grupos de capas: tokens `--ds-layer-*` (utilidades `bg-layer-*`, etc.), definidos en los tres temas. MapLibre no entiende `oklch`: convertir con `tokenColor` como en Drone Forecast (`components/spots/mapStyle.ts`).
- `useTheme().isDark` es verdadero en oscuro y nocturno (para elegir el estilo del mapa).
- Mobile-first; barra inferior en móvil y pestañas en el encabezado desde `md`.

## Cosas que hay que saber
- **SQLite en el navegador:** `@sqlite.org/sqlite-wasm` en un worker con el VFS `opfs-sahpool` (no requiere COOP/COEP). Un solo contexto puede abrir el pool: con la app abierta en dos pestañas del mismo origen, la segunda cae a una base **en memoria** y Ajustes lo informa (`DbInfo.fallbackReason`). Pendiente: coordinar pestañas (Web Locks) si molesta.
- `@sqlite.org/sqlite-wasm` está excluido de `optimizeDeps` (localiza su `.wasm` relativo al módulo). El `.wasm` se precachea para abrir sin conexión; los workers `sqlite3-worker1` y `sqlite3-opfs-async-proxy` que emite el paquete no se usan y se excluyen del precache.
- Las migraciones se aplican en el worker al abrir la base (`engine.migrate`, tabla `__migrations`), no con el migrador de Drizzle (lee del sistema de archivos).
- En desarrollo, `window.__gpsm.database` da acceso a la base desde la consola (`await __gpsm.database.ready()` → repositorios).
- `typescript` fijado en 5.x por `vue-tsc`. pnpm rechaza versiones publicadas hace poco (`minimumReleaseAge`): fijar una versión con al menos un par de semanas en vez de agregar excepciones.
- Íconos PWA (`public/*.png`) generados desde `public/icon.svg` con Chrome headless (el maskable con la marca al 72 %).
- En la web no hay GPS en segundo plano: con la pantalla apagada o la pestaña oculta el navegador suspende la geolocalización. Decisión: no hace falta (se usa Wake Lock mientras se navega).
