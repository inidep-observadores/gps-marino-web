# CLAUDE.md — GPS Marino Web

Réplica web de **Marine Onboard GPS** (Flutter, en `D:\Desarrollo\Flutter\Movil\Proyectos\marine_onboard_gps`) con el stack y el sistema de diseño de **Drone Forecast** (`D:\Desarrollo\_PROYECTOS\Drones\Drone Forecast`). Plan, decisiones y fases en `PLAN.md`: leerlo antes de agregar funciones. Para replicar una función, mirar primero cómo la resuelve la app Flutter (`lib/src/modules/...`) y cómo resuelve Drone Forecast la parte web equivalente.

## Contexto de uso (condiciona todo el diseño)
Se usa **sobre todo en el teléfono, a bordo de buques de pesca y sin Internet** (funciona también en computadora). Por eso:
- **Nada puede depender de la red**: todo se genera y se guarda en el dispositivo (exportar, copias, ZIP, íconos, fuentes). Ninguna librería por CDN.
- **Los datos solo existen en el teléfono** hasta la etapa 2: copias de seguridad fáciles y visibles (aviso tras 7 días sin copia).
- **Táctil, una mano, barco en movimiento, guantes**: objetivos grandes, acciones abajo al alcance del pulgar, nada que dependa solo de gestos finos o de hover; la pulsación larga es un atajo, siempre hay botón equivalente.
- **Teléfonos modestos y listas largas** (miles de lances): dibujo incremental, `content-visibility`, `shallowRef` en listas grandes.
- Lectura a pleno sol y de noche (tema nocturno), teclados numéricos (`inputmode`) en coordenadas, velocidad y rumbo.

## Comandos (raíz, pnpm)
- `pnpm install` — dependencias del monorepo.
- `pnpm dev` — servidor de desarrollo de la web (Vite). En el navegador integrado: config `web` de `.claude/launch.json` (puerto 5180); `web-preview` sirve `dist/` en 4180 (service worker y modo sin conexión).
- `pnpm typecheck` / `pnpm test` / `pnpm build` — en todos los paquetes.
- `pnpm db:generate` — tras cambiar `apps/web/src/db/schema.ts`, genera la migración SQL (drizzle-kit). Nunca editar a mano una migración ya publicada: crear otra.

Antes de dar algo por terminado: `pnpm build && pnpm test`.

## Estructura
```
packages/shared/      TS puro (sin Vue ni Nest), con tests: dominio + esquemas zod (domain.ts), íconos/colores de marca
                      compatibles con Flutter (marks.ts), uuidv7 (ids.ts), búsqueda sin acentos (text.ts),
                      geometría esférica en Nm (geo.ts), formatos náuticos (format.ts), velocidad promedio y COG
                      derivados de posiciones (motion.ts), ruta/ETA/avance automático/avisos de arribo (navigation.ts),
                      orden/búsqueda/agrupado por día (waypointList.ts), copias MogData compatibles con Flutter
                      (backup.ts), exportadores GPX/KML/CSV (exporters.ts), geometrías del mapa: anillos, COG, ruta,
                      medición (mapGeometry.ts), capas GeoJSON/GPX con simplestyle, colores Garmin, etiquetas de
                      áreas con polylabel y elementos ocultos (layers.ts; el GPX recibe el parser XML inyectado),
                      teselas XYZ y estimación de descargas (tiles.ts), campo de viento: grilla, interpolación,
                      bandas en nudos, Beaufort y pedido a Open-Meteo (wind.ts), pronóstico de un punto con olas
                      (pointForecast.ts), derrota: cuándo grabar un punto, distancia, estadísticas y GPX (track.ts)
apps/web/
  src/db/             schema.ts (Drizzle), migrations/ (generadas), migrations.ts (glob de Vite),
                      engine.ts (motor SQL síncrono sobre sqlite-wasm: lo usan el worker y los tests),
                      worker.ts (SQLite + OPFS opfs-sahpool, expuesto con Comlink), client.ts (Drizzle sqlite-proxy),
                      protocol.ts (API del worker, nombre de archivo por usuario)
  src/repositories/   waypoints, layers, settings (+ ruta activa): interfaz + implementación Drizzle; reloj inyectable
  src/services/       geolocation (watchPosition → PositionSample; fuente intercambiable), simulatedGeo (solo desarrollo),
                      notify (notificaciones del sistema vía service worker + vibración),
                      files (ZIP con fflate, compartir con Web Share o descargar, leer copias .json/.zip)
  src/logic/          lógica pura de la web, con tests: waypointForm (grados-minutos-hemisferio, validaciones de Flutter)
  src/stores/         prefs (idioma y tema, localStorage), ui (vista por hash + hoja abierta + posición capturada),
                      database (base abierta + repos), gps (estado, muestras, velocidad/COG, Wake Lock),
                      navigation (ruta persistida, tramos, ETA, avance y avisos), waypoints, toast
  src/composables/    useTheme, useConfirm, useOnline, useMediaQuery, usePwaInstall, useNavItems, useFormat (formatos de
                      pantalla por idioma), useWakeLock, usePositionLog (registro rápido / registrar posición), storage
  src/components/     ui/ (BaseSheet, ConfirmDialog, CardSection, ReadoutTile, SegmentedControl, StatusPill),
                      ToggleRow; layout/ (AppHeader, AppNav, AppFooter, AppSheets, ConfirmHost, ToastHost, ConnectionBanner,
                      AppLogo); gps/ (PositionCard, NavigationCard, DestinationPicker);
                      waypoints/ (WaypointForm: alta y edición, WaypointRow, SelectionBar, ExportPanel, RestorePanel);
                      marks/ (MarkGlyph, MarkIconPicker, MarkColorPicker, markIcons: SVG de Font Awesome sin su librería);
                      panels/ (SettingsPanel, RouteSettings);
                      map/ (MapCanvas: MapLibre, siempre vía lazyMap; mapStyles: tipos de mapa y tokenColor;
                      mapImages: íconos y buque dibujados en canvas; offlineTiles: caché propio de teselas;
                      mapLayers: capas vectoriales en MapLibre; windParticles (canvas de viento), WindTimeControl,
                      OfflineMapsSection (descarga de zona); MapInfoPanel, MapFeatureCard, MapSettingsPanel, LayersPanel)
  src/layers/         baseLayers (grupos base empaquetados en public/layers, con su token de color)
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
- En desarrollo, `window.__gpsm` da acceso a `database`, `gps`, `navigation` y `waypoints` desde la consola.
  **El navegador integrado no tiene GPS:** `const sim = __gpsm.simulate({ lat: -38.05, lon: -57.5, speedKn: 8, courseDeg: 135, reportMotion: false })`
  pone un buque simulado (con `reportMotion: false` llegan sin velocidad ni rumbo, como en iOS, y se prueban los derivados);
  `sim.set({ speedKn: 120 })` acelera para probar el avance de ruta. Con el panel del navegador oculto las capturas llegan
  desfasadas (animaciones en pausa): verificar estado por DOM/JS.
- **GPS (fase 1):** velocidad = promedio de las últimas 10 muestras (como Flutter); si el dispositivo no informa velocidad o rumbo
  se derivan de posiciones más alejadas que el ruido (`2 × precisión`, mín. 15 m), no de la anterior (a 1 Hz el avance es menor que
  la precisión). `stale` tras 15 s sin fix. Arranque automático solo si el permiso ya estaba concedido. Wake Lock mientras el GPS está activo.
- **Ruta:** `stepRoute` (shared) decide aviso y avance en cada fix: llegada a 0,1 Nm o "línea de través" (≤ 0,27 Nm, > 1 kn, diferencia
  rumbo/marcación > 110°); el último punto nunca se quita solo. ETA = distancia total / velocidad promedio. Ajustes de aviso en `settings`
  (`route.arrival`). Notificación del sistema si hay permiso + aviso en pantalla siempre.
- **Ubicaciones (fase 2):** formulario único `WaypointForm` para alta ("Registrar posición") y edición; las hojas pueden
  pedir confirmación antes de cerrarse con `useCloseGuard` (X, fondo, Escape). Selección múltiple con botón o pulsación
  larga (`useLongPress`); al salir de la pestaña se limpia. Orden y sentido se guardan en `settings` (`waypoints.list`).
- **Copias:** formato `MogData.json` de Flutter (fecha en µs como texto, íconos/colores por índice, también `icon`/`color`
  de copias viejas) + `uuid`/`updated` propios (Flutter los ignora). Exportar copia = ZIP con `MogData.json` adentro (lo que
  busca Flutter al restaurar). Restaurar: combinar (sin duplicar por `uuid` o por instante+posición) o reemplazar
  (con confirmación), en una sola transacción (`importMany`). Fecha de la última copia en `settings` (`backup.lastAt`).
- **Compartir archivos:** Chrome para Android no comparte GPX/KML/JSON/ZIP con Web Share (solo algunos tipos): `canShareFile`
  se consulta por archivo y si no se puede se descarga. El navegador integrado no tiene Web Share. No hacer clic en
  "Guardar archivo" al verificar (descarga un archivo en la máquina del usuario): verificar armando el archivo por JS.
- **Mapa (fase 3):** `MapView` a pantalla completa (sin márgenes ni pie; `.map-screen` resta encabezado y barra inferior).
  Un solo mapa: `MapCanvas` lee los stores y registra en `stores/map` un `controller` (zoom, centrar). Cursor = centro del
  mapa; la medición marca puntos bajo el cursor. Ajustes en `settings` (`map.settings`), cámara en localStorage
  (`gpsm.map.camera.v1`, propia del dispositivo). Las capas propias se vuelven a agregar en cada `style.load`.
  - **Tipos:** estándar = OpenFreeMap (claro/oscuro); satélite e híbrido = Esri World Imagery (+ referencias);
    "Terreno" = batimetría Esri Ocean (datos hasta z10, por eso `maxzoom: 10`). Señales náuticas: OpenSeaMap (opcional).
  - **Sin conexión:** las teselas de OpenFreeMap llevan la VERSIÓN del planeta en la URL y cambia seguido: con el caché del
    service worker lo guardado dejaría de encontrarse. Por eso el estilo se reescribe al protocolo `ofm://` y
    `offlineTiles.ts` guarda cada tesela con clave sin versión (caché primero, tope `MAX_TILES`). Estilos, TileJSON,
    fuentes y sprites: service worker (StaleWhileRevalidate); raster Esri/OpenSeaMap: service worker (CacheFirst).
    Sin estilo guardado se usa un estilo local vacío y lo propio (buque, ruta, ubicaciones) se sigue viendo.
  - El código del mapa va en un fragmento aparte pero SE PRECACHEA (al revés que en Drone Forecast).
  - Íconos de ubicaciones: se registran con `ensureMarkImages` al armar las capas (`styleimagemissing` falla al cambiar
    de estilo). Las etiquetas van en otra fuente que los íconos: si faltan glifos sin conexión, MapLibre descarta todos
    los símbolos de la tesela de esa fuente.
  - **Verificar con el panel del navegador VISIBLE** (`mcp__ccd_view__show_pane` preview): oculto, no corre
    `requestAnimationFrame` y MapLibre no termina de cargar el estilo (parece un error y no lo es). En desarrollo
    `window.__map` es la instancia de MapLibre.
- **Capas (fase 4):** grupos base en `apps/web/public/layers/` (copiados de `assets/geojson` de Flutter; se PRECACHEAN y
  sirven de mapa de respaldo sin conexión). Visibilidad por grupo en `settings` (`layers.base`, claves de Flutter) y
  etiquetas de áreas en `layers.labels`. Importadas: GeoJSON/GPX/ZIP (primer archivo válido), contenido en SQLite,
  nombre repetido → confirmar sobrescribir. Estilos de Flutter: áreas generales sin relleno, demás grupos base al 15 %,
  importadas lo de simplestyle o 25 %; veda punteada. Se parsea con color por defecto VACÍO y cada elemento lleva `_tok`
  (token de color): MapLibre resuelve el color con el tema actual (`colorExpr` en `mapLayers.ts`).
  Tocables: líneas y puntos (las áreas no, como en Flutter). Ocultar un elemento de una capa importada lo atenúa; si es
  una línea, también los puntos de sus extremos (`relatedFeatureIds`). Ids de elementos: `<capa>|<n>[|<parte>]`.
- **No usar `map.isStyleLoaded()` para decidir si actualizar capas:** da falso mientras se bajan teselas. `MapCanvas`
  usa su propia marca `overlayReady` (verdadera tras `style.load` + `addOverlay`).
- **Viento (fase 5):** capa más del diálogo de Capas (`stores/wind.ts`, `settings` clave `layers.wind`). Una grilla de ~48
  puntos de Open-Meteo con TODAS las horas en un solo pedido (`buildWindGridUrl`): cambiar de hora no usa la red; solo se
  vuelve a pedir si el mapa sale de la grilla o se acerca mucho. Animación en un canvas encima del mapa
  (`windParticles.ts`, portado de Drone Forecast; colores por nudos: <10 / 10–21 / 21–33 / >33). `WindTimeControl` (días,
  deslizador, reproducir, "Ahora") solo aparece con la capa encendida. Horas elegibles: desde la hora actual (`logic/windTime.ts`).
  Sin conexión: service worker NetworkFirst para `api.open-meteo.com` (4 días) + se conserva la última grilla en memoria; la
  fecha de la respuesta (`Date`) indica de cuándo es el pronóstico. Atribución obligatoria: "Datos: Open-Meteo.com"; uso gratuito
  solo NO comercial. El canvas está `hidden` con la capa apagada: al encender hay que `resize()` antes de sembrar partículas.
- **Mapas sin conexión por zona:** `OfflineMapsSection` (en Configuración del mapa) baja las teselas de la vista (+15 % de
  margen) hasta z9/11/13 con tope de 8000 teselas; 6 en paralelo, cancelable, se corta si se cae la red.
- **Pronóstico de punto (fase 6):** botón "Pronóstico" del mapa → hoja con lecturas de la hora elegida y dos gráficos SVG a mano
  (`forecast/HourlyChart.vue`: viento y ráfagas en nudos, olas y mar de fondo en metros; tocar el gráfico elige la hora y
  mueve el cursor de ambos). Dos pedidos en paralelo: Open-Meteo Forecast y **Marine** (`marine-api.open-meteo.com`); si el
  punto está en tierra o sin cobertura marina, las olas quedan en `null` y solo se muestra el viento. Ambos dominios van por
  el service worker (NetworkFirst, 4 días): sin conexión se ve el último pronóstico de ESE mismo punto.
- **Derrotas:** tablas `tracks` + `track_points` (migración 0001). `stores/tracks.ts` graba mientras el GPS está activo
  (`shouldRecord`: cada 20 m, o 8 m si hay giro de 20°, mín. 3 s, descarta precisión peor que 50 m), guarda de a 10 puntos o
  30 s y al ocultar la app. Si el GPS se apaga, la derrota se cierra; si la app se cierra grabando, al abrir se cierra con su
  último punto. Se dibujan en el mapa (azul; la que se graba, en rojo), se exportan en GPX desde el panel de Capas.
- **Instalar la app (PWA):** replica Viaja MDP. `startPwaInstall()` (main.ts, antes de montar) captura `beforeinstallprompt`; `layout/InstallPrompt.vue` (en `AppSheets`) sugiere instalar 6 s después. "Ahora no" o cerrar la hoja = silencio de 24 h (`gpsm.install.snoozed`, instante en ms); "No volver a mostrar" = silencio permanente (`gpsm.install.muted`); ambas en localStorage del dispositivo. Ajustes → "Instalar la app" ignora ambos silencios. Ya instalada (display-mode) no se sugiere; iOS muestra los pasos de "Compartir". Reglas puras en `logic/installPrompt.ts`.
- `typescript` fijado en 5.x por `vue-tsc`. pnpm rechaza versiones publicadas hace poco (`minimumReleaseAge`): fijar una versión con al menos un par de semanas en vez de agregar excepciones.
- Íconos PWA (`public/*.png`) generados desde `public/icon.svg` con Chrome headless (el maskable con la marca al 72 %).
- En la web no hay GPS en segundo plano: con la pantalla apagada o la pestaña oculta el navegador suspende la geolocalización. Decisión: no hace falta (se usa Wake Lock mientras se navega).
