# GPS Marino Web — Plan de desarrollo e implementación

> Réplica web (Vue) de **Marine Onboard GPS** (Flutter, `navegador_marino` v1.2.1), con el stack, las librerías y el sistema de diseño de **Drone Forecast**.
> Etapa 1: 100 % cliente, SQLite local, funciona sin conexión. Etapa 2: backend NestJS + Prisma + Postgres, login con Google y sincronización por usuario.
> Documento previo a la codificación. Fecha: 18/11/2026.

---

## 1. Relevamiento de Marine Onboard GPS (app de origen)

~12 000 líneas de Dart propias. Arquitectura BLoC, ObjectBox como base local, Google Maps, `geolocator` con servicio en primer plano (Android), i18n es/en. Tres pestañas: **GPS**, **Ubicaciones** y **Mapa**.

### 1.1 Inventario de funcionalidades (lo que hay que replicar)

**Permisos y arranque**
- Pantalla de permisos con explicación (registro en segundo plano, datos solo en el dispositivo) y verificación de GPS activado.
- Pantalla de carga; confirmación al salir de la app.

**Pestaña GPS (`gps_page`)**
- Lecturas: fecha, hora, latitud, longitud (formato `GG° MM,mmm' N/S`), velocidad (nudos, **promedio de las últimas 10 posiciones**), rumbo (`000°`).
- Con destino/ruta: destino, próximo punto, destino final, distancia al destino y **distancia total de la ruta** (Nm), rumbo al destino, ETA.
- Estados: GPS inactivo, esperando señal (animaciones), con fix.
- Menú de acciones (speed dial): activar/desactivar GPS, **registro rápido** (guarda la posición actual sin abrir el formulario), **registrar posición** (abre el formulario con los datos actuales), elegir destino.

**Navegación / rutas (`geolocation_bloc`)**
- Ruta = lista ordenada de `DestinationPoint` (waypoint guardado, punto de una capa o posición del cursor). Fijar destino, **añadir a la ruta**, cancelar.
- **Avance automático** al siguiente punto: llegada directa (≤ 0,1 Nm) o línea de través (≤ 0,27 Nm, velocidad > 1 kn y diferencia entre rumbo y marcación > 110°). El último punto nunca se descarta solo.
- **Aviso de arribo** configurable: activado/desactivado, distancia de aviso (Nm, 0,5 por defecto), avisar en cada punto o solo en el destino final.
- ETA = distancia / velocidad; distancia en Nm (m / 1852); marcación normalizada a 0–360.

**Ubicaciones / waypoints (`waypoints_*`)**
- Modelo: id, descripción, fecha-hora, lat, lon, velocidad (kn), rumbo (0–360), **ícono** (35 íconos Font Awesome: pez, camarón, ancla, salvavidas, hombre al agua, etc.), **color** (sistema, rojo, verde, azul, naranja), visible en el mapa.
- Lista con **búsqueda** sin acentos ni mayúsculas, **orden** por fecha / nombre / ícono, ascendente o descendente.
- **Selección múltiple**: seleccionar todo, mostrar u ocultar en el mapa, eliminar (con confirmación), compartir.
- **Compartir/exportar** seleccionados como **GPX**, **KML** y **JSON** (copia de seguridad), comprimidos en ZIP (`MogData.*`). TXT existe en el enum pero no está implementado.
- **Restaurar copia** desde `.json` o `.zip` con `MogData.json`. **Ojo:** hoy borra todos los registros antes de importar.
- Formulario de edición: lat/lon por grados, minutos y hemisferio (validaciones 0–90 / 0–60 / 0–180), fecha, hora, velocidad, rumbo, ícono, color, visible, descripción; pregunta si guardar al salir con cambios.

**Mapa (`map_*`)**
- Tipos: estándar, satélite, híbrido, terreno. Tema claro/oscuro del mapa.
- **Marcador del buque** rotado por rumbo (mostrar/ocultar).
- **Anillos de distancia** (cantidad y separación en Nm) y **línea COG** (proyección a N minutos).
- **Seguimiento** (cámara que sigue al buque), centrar, acercar/alejar.
- **Cursor** (retícula central): mostrar/ocultar, **registrar posición en el cursor**, **navegar hacia el cursor**; la ventana de información muestra posición, velocidad, rumbo, destino, ETA, distancia, próximo punto, destino final y datos del cursor.
- **Herramienta de medición**: marcar puntos, línea fija + línea dinámica al cursor, distancia total en Nm.
- Polilínea de la ruta activa, marcadores de inicio/destino.
- **Selección de elementos** de las capas: ficha con título y propiedades (línea, nro. de lance, etiqueta…), "Navegar hacia aquí", "Añadir a la ruta", "Ocultar en mapa".
- Persistencia de cámara (zoom/lat/lon), tipo de mapa y ajustes.

**Capas (`layers_*`)**
- **Capas base empaquetadas** (1,5 MB de GeoJSON): mapa base (costas de Argentina, Uruguay y Chile), áreas generales (mar territorial, ZEE, ZCP), zonas de veda, áreas de vieira, centolla (C1–C5, S1–S4) y langostino. Cada grupo con color, orden Z y visibilidad persistida.
- **Etiquetas de áreas** (mostrar/ocultar): reglas por capa (langostino: número de `Id_area`; vieira: sufijo de `name`; centolla: del nombre del archivo), centradas con **polylabel**. Documentado en `docs/geojson_logic_study.md`.
- **Capas importadas**: GeoJSON, GPX o ZIP que los contenga. Estilos **simplestyle-spec** (`stroke`, `fill`, `marker-*`), colores Garmin `gpxx:DisplayColor`, limpieza de `<time>` inválidos. Visibilidad por capa, **ocultar elementos sueltos**, mostrar descripciones de los puntos, sobrescribir si el nombre existe, eliminar, verificar que el archivo siga existiendo.

**Transversales**
- Tema claro/oscuro/sistema, i18n es/en, notificaciones locales, ajustes en `SharedPreferences`.

### 1.2 Modelo de datos actual (ObjectBox)

| Entidad | Campos |
|---|---|
| `Waypoint` | id (int), descripcion, fechaHora, latitud, longitud, velocidad, rumbo, icon (índice del enum), color (índice), verEnMapa |
| `ImportedLayer` | id, name, storedFileName, format (geojson/gpx), visible, importedAt, hiddenFeatures[], showDescriptions |
| Ajustes | tema, cámara, tipo de mapa, buque, anillos, COG, rutas (avisos), visibilidad por grupo base, etiquetas |

La ruta activa y el historial de posiciones viven solo en memoria.

---

## 2. Relevamiento de Drone Forecast (referencia técnica y visual)

- **Stack:** Vue 3.5 + Vite 8 + TypeScript 5 (fijado por `vue-tsc`) + Pinia + vue-i18n, PWA con `vite-plugin-pwa` (Workbox), Vitest. Sin vue-router: navegación por hash en `stores/ui.ts` con `KeepAlive`.
- **Mapas:** `maplibre-gl` 6 con teselas vectoriales de **OpenFreeMap** (estilos `positron`/`dark`, sin clave), carga diferida (`defineAsyncComponent`), worker con `setWorkerUrl`, colores del mapa sacados de los tokens del tema (`tokenColor`, `oklch` → `rgb`).
- **Viento:** `windParticles.ts` (canvas de partículas sobre MapLibre), `logic/windField.ts` (grilla e interpolación), `useWindGrid` (un pedido de ~48 puntos a Open-Meteo con todas las horas), `WindTimeControl`.
- **Gráficos:** SVG a mano, sin librería (`WindChart`, `WindGauge`, `WindProfile`), dibujados al ancho real con `useElementSize`.
- **Sistema de diseño (`src/style.css`):** Tailwind v4 sin config; tokens `--ds-*` en `oklch` por tema (`:root` claro, `[data-theme=dark]`); `@theme inline` → `bg-surface`, `text-ink`, `border-line`, `accent`, `go/caution/stop`; clases semánticas (`card`, `readout`, `btn-*`, `chip`, `segmented`, `list-row`, `sheet`, `status-pill`, `bottom-bar`, `nav-tabs`, `map-chip`, `data-table`…); utilidades `eyebrow`, `display`, `numeric`; tipografías **Geist** y **Geist Mono** autoalojadas; íconos `@lucide/vue`; fondo con retícula de carta y resplandor; animaciones `rise`/`sheet`; estado por `data-status`.
- **Patrones a reusar:** `BaseSheet` sobre `<dialog>`, `useConfirm` + `ConfirmHost` (nunca `window.confirm`), `useTheme` con script en `index.html`, `useOnline` + `ConnectionBanner`, `usePwaInstall`, repositorio intercambiable (memoria en tests), lógica pura en `src/logic` sin Vue y con tests, fixtures reales en `tests/fixtures`.
- **Offline:** precache del app shell; `CacheFirst` para teselas (800 entradas, 30 días); `NetworkFirst` para APIs.

---

## 3. Decisiones de arquitectura

### 3.1 Repositorio: monorepo con pnpm workspaces

```
GpsMarinoWeb/
  apps/
    web/        Vue 3 + Vite PWA (etapa 1)
    api/        NestJS + Prisma (etapa 2)
  packages/
    shared/     TypeScript puro, sin Vue ni Nest: tipos de dominio, esquemas zod,
                navegación (distancia, marcación, ETA, avance de ruta), formatos
                (lat/lon, kn, Nm), parsers GeoJSON/GPX/KML, contratos de sync
  docker-compose.yml   Postgres (etapa 2)
```

`packages/shared` es la pieza clave: la misma validación y los mismos tipos en el cliente (SQLite) y en el servidor (Postgres), y la lógica de navegación testeada una sola vez.

### 3.2 SQLite en el navegador (y por qué Prisma va solo en el backend)

**Prisma no corre en el navegador.** En el cliente se usa:
- **`@sqlite.org/sqlite-wasm`** (build oficial) dentro de un **Web Worker**, con el VFS **`opfs-sahpool`** (persiste en OPFS, no requiere cabeceras COOP/COEP, funciona en Chrome, Edge, Firefox y Safari 16.4+).
- **Drizzle ORM** con el driver `sqlite-proxy` para tener consultas tipadas y migraciones versionadas empaquetadas con la app (alternativa liviana: Kysely). La app habla con el worker por mensajes (Comlink).
- `navigator.storage.persist()` al primer guardado, para que el navegador no borre la base.
- Repositorios con interfaz (`WaypointRepository`, `LayerRepository`, `SettingsRepository`) e implementación en memoria para los tests, igual que la bitácora de Drone Forecast.

Prisma + Postgres quedan en `apps/api`. El esquema se mantiene alineado a mano entre ambos (mismos nombres de columnas), con un test que compare las columnas de las dos definiciones.

### 3.3 Esquema local (pensado ya para sincronizar)

Todas las tablas sincronizables llevan: `id` **UUID v7 generado en el cliente**, `created_at`, `updated_at` (ms), `deleted_at` (borrado lógico), `dirty` (pendiente de subir) y `server_version`.

| Tabla | Contenido |
|---|---|
| `waypoints` | description, recorded_at, lat, lon, speed_kn, bearing, icon (clave estable, ej. `fishFins`), color, visible |
| `imported_layers` | name, format, visible, imported_at, hidden_features (JSON), show_descriptions, content (texto GeoJSON/GPX normalizado), size_bytes |
| `settings` | key, value (JSON), updated_at; ajustes de mapa, rutas, capas base y tema |
| `active_route` | posición, destino (waypoint_id o lat/lon + nombre); se persiste para sobrevivir a una recarga (hoy se pierde) |
| `meta` | versión del esquema, `user_id` dueño de la base, cursor de sincronización |

El ícono y el color se guardan como **clave de texto** (no como índice) y se traducen al importar copias de la app Flutter, cuyo JSON usa índices.

### 3.4 Mapas y librerías (como en Drone Forecast)
- **MapLibre GL + OpenFreeMap**, cargado bajo demanda, colores desde los tokens.
- Tipos de mapa: **estándar** (OpenFreeMap positron/dark), **satélite** (raster Esri World Imagery, con atribución), **híbrido** (satélite + etiquetas vectoriales), **terreno** (OpenTopoMap o sombreado). Opcional: capa **OpenSeaMap** (balizas y señales náuticas).
- Marcadores de waypoints e íconos: **Font Awesome Free** (`@fortawesome/fontawesome-svg-core`) solo para los 35 íconos de marca, rasterizados como imágenes de MapLibre (`map.addImage`); `@lucide/vue` para toda la interfaz.
- Etiquetas de áreas con `polylabel`; GPX → GeoJSON con `@tmcw/togeojson`; ZIP con `fflate`; geometría con funciones propias en `shared` (o `@turf/*` puntual).
- Gráficos: SVG a mano como `WindChart`. Viento: se copian `windParticles.ts`, `windField.ts` y `useWindGrid`.

### 3.5 GPS en la web: diferencias que hay que asumir
| Flutter (Android) | Web | Mitigación |
|---|---|---|
| Servicio en primer plano: registra con la pantalla apagada | Con la pestaña oculta o la pantalla apagada el navegador **suspende** `watchPosition` | **Screen Wake Lock** mientras se navega, aviso claro en la interfaz; si hace falta segundo plano real, empaquetar con **Capacitor** + plugin de geolocalización en segundo plano (fase opcional) |
| `heading` y `speed` siempre presentes | `coords.heading`/`speed` pueden ser `null` (sobre todo en iOS y escritorio) | Calcular rumbo y velocidad a partir de posiciones sucesivas (filtradas por precisión) |
| Notificación local nativa | `Notification` vía service worker; en iOS solo con la PWA instalada | Aviso en pantalla + sonido/vibración como respaldo |
| GPS del dispositivo | En teléfonos usa el GNSS sin red; en una computadora suele ser por Wi-Fi/IP | Mostrar precisión; documentar que a bordo se usa un teléfono o tablet |

### 3.6 Sin conexión (crítico: en altamar no hay Internet)
- App shell, fuentes, capas base GeoJSON y código del mapa **precacheados** (el código del mapa no se difiere en esta app, al revés que en Drone Forecast, porque el mapa es la función principal).
- Las capas base (costas de Argentina, Uruguay y Chile) funcionan como **mapa de respaldo** sin teselas, igual que hoy.
- **Descarga de zona para uso sin conexión**: el usuario elige un rectángulo y rango de zoom; se bajan las teselas a Cache Storage con estimación de tamaño y tope. Alternativa a evaluar: un paquete **PMTiles** regional (Mar Argentino) guardado en OPFS y servido con el protocolo `pmtiles://`.
- Todo lo demás (waypoints, capas importadas, ajustes, ruta) vive en SQLite y nunca necesita red.

### 3.7 Autenticación y sincronización (etapa 2)
- **Login:** Google Identity Services en el cliente → el ID token se envía a `POST /auth/google`; Nest lo verifica con `google-auth-library`, crea o busca el `User` y emite un **access token JWT corto** + **refresh token rotativo en cookie httpOnly**. Sin conexión la app sigue funcionando con la sesión local; sincroniza al volver la red.
- **Modelo de sync (push/pull con cursor):**
  - `POST /sync/push` con los registros `dirty` (upsert por `id`; los borrados viajan como `deleted_at`).
  - `GET /sync/pull?since=<cursor>` devuelve lo cambiado en el servidor después del cursor (columna `server_version` incremental por usuario).
  - Conflictos: **última escritura gana por registro** según `updated_at`, con el reloj del servidor como desempate; los borrados lógicos se purgan pasado un tiempo.
  - Disparadores: al iniciar sesión, al recuperar conexión (`online`), cada N minutos con la app abierta y tras cada cambio (con *debounce*).
- **Datos previos al login:** la primera vez que alguien inicia sesión se le pregunta si quiere asociar a su cuenta las ubicaciones y capas guardadas localmente. Se usa **una base SQLite por usuario** (archivo OPFS por `user_id` + una anónima), así cerrar sesión o cambiar de cuenta no mezcla datos.
- **Capas importadas:** el contenido va en Postgres (`text`/`jsonb`) con un tope de tamaño; si crecen, pasar a almacenamiento de objetos (S3/R2).

### 3.8 Backend NestJS
- Módulos: `AuthModule` (Google + JWT + refresh), `UsersModule`, `SyncModule`, `WaypointsModule` y `LayersModule` (API REST de lectura útil para depurar y para una futura web de administración), `HealthModule`.
- Prisma con Postgres 16; todas las tablas con `userId` + índice `(userId, serverVersion)`; guard global que fuerza el filtro por usuario.
- Validación con los esquemas zod de `shared` (pipe propio) o `class-validator`; Swagger; tests con Jest + Supertest y una base Postgres en Docker para los e2e.
- Despliegue: Docker (api + postgres); la web como estáticos (Vercel, Hostinger o el mismo servidor con Caddy/Nginx).

---

## 4. Sistema de diseño (réplica de Drone Forecast)

- Copiar `style.css` completo (tokens, `@theme inline`, clases semánticas, retícula de fondo, animaciones) y las piezas de `components/ui` y `layout`: `BaseSheet`, `ConfirmDialog`/`ConfirmHost`, `SegmentedControl`, `CardSection`, `ReadoutTile`, `StatusPill`, `AppHeader`, `AppNav` (barra inferior en móvil, pestañas desde `md`), `ConnectionBanner`.
- Mismas reglas: nada de colores de la paleta de Tailwind ni hex sueltos, estado con `data-status`, mobile-first, variante `short:` para teléfono en horizontal, `prefers-reduced-motion`.
- **Adaptación náutica** (acordarla antes de cambiar nada): el acento azul se mantiene; el semáforo `go/caution/stop` se usa para el **estado del GPS** (con fix / buscando / inactivo) y para la **precisión**. Las lecturas grandes de la pestaña GPS se arman con `readout` + `numeric` (Geist Mono), al estilo de los tableros de Drone Forecast.
- **Modo nocturno de puente** (propuesta): un tercer tema rojo tenue para no encandilar de noche. Se agrega como token, sin tocar componentes.
- Los colores de los grupos de capas base (azul, rojo, verde, ámbar, rosa) pasan a ser tokens `--ds-layer-*`, definidos para ambos temas.

---

## 5. Plan por fases

Cada fase termina con `pnpm build && pnpm test` en verde y una prueba manual en el navegador integrado (y, en las fases marcadas, en un teléfono real).

### Etapa 1 — Webapp local, sin conexión

**Fase 0 · Fundaciones** (≈ 1 semana) — ✅ hecha (18/11/2026)
- Monorepo pnpm, TypeScript estricto, ESLint/Prettier, Vitest, CLAUDE.md y SPEC.md del proyecto.
- `apps/web`: Vite + Vue + Pinia + vue-i18n + Tailwind v4 + PWA; sistema de diseño portado; layout con las tres pestañas (GPS, Ubicaciones, Mapa) + Ajustes; tema claro/oscuro/sistema.
- Worker de SQLite (sqlite-wasm + OPFS) + Drizzle + migraciones + repositorios con tests en memoria.
- `packages/shared`: tipos de dominio, enums de íconos y colores con tabla de compatibilidad con los índices de Flutter.

**Fase 1 · GPS y navegación** (≈ 1,5 semanas) — ✅ hecha (18/11/2026); falta probar en un teléfono real
- `useGeolocation`: `watchPosition` con alta precisión, estados (inactivo / buscando / con fix / error de permiso), rumbo y velocidad calculados cuando faltan, velocidad promedio de 10 muestras, Wake Lock.
- Lógica pura con tests (portada de Dart): distancia en Nm, marcación, ETA, distancia total de la ruta, avance automático (0,1 Nm / 0,27 Nm + través > 110°), avisos de arribo; formatos `GG° MM,mmm'`, `000°`, kn, Nm.
- Pantalla de permisos (onboarding) y vista GPS completa con lecturas, estados animados y acciones (activar, registro rápido, registrar posición, elegir destino).
- Store de ruta persistido en `active_route`; notificaciones con respaldo en pantalla.

**Fase 2 · Ubicaciones** (≈ 1,5 semanas) — ✅ hecha (18/11/2026); falta probar compartir archivos en Android e iOS reales
- CRUD de waypoints; formulario con lat/lon en grados-minutos-hemisferio y las mismas validaciones; selector de ícono (35) y color; confirmar al salir con cambios (`useConfirm`).
- Lista: búsqueda sin acentos, orden por fecha/nombre/ícono asc/desc, selección múltiple, mostrar/ocultar en mapa, eliminar, fijar como destino o añadir a la ruta.
- Exportar GPX, KML, JSON (y TXT/CSV, que hoy falta) en ZIP; **Web Share API con archivos** y descarga como respaldo.
- Restaurar copia `.json`/`.zip` **compatible con los archivos `MogData` de la app Flutter**; se ofrece **reemplazar o combinar** (hoy solo reemplaza).

**Fase 3 · Mapa** (≈ 2,5 semanas) — ✅ hecha (18/11/2026); teselas guardadas con clave sin versión; falta probar en altamar real
- MapLibre con los cuatro tipos de mapa y tema; cámara persistida.
- Buque rotado por rumbo, seguimiento, centrar, zoom; waypoints con su ícono y color; polilínea de la ruta con inicio/destino.
- Anillos de distancia, línea COG, cursor central con ventana de información, registrar posición en el cursor y navegar hacia él.
- Herramienta de medición (línea fija + dinámica, total en Nm).
- Ficha del elemento seleccionado (propiedades, navegar, añadir a la ruta, ocultar).
- Hoja de ajustes del mapa (buque, anillos, COG, avisos de ruta).

**Fase 4 · Capas** (≈ 2 semanas)
- Capas base GeoJSON empaquetadas por grupo, con colores, orden Z, línea punteada en vedas, relleno al 15 % y visibilidad persistida.
- Etiquetas de áreas con las reglas por capa y `polylabel`.
- Importar GeoJSON, GPX y ZIP: detección de formato, validación previa, simplestyle-spec, colores Garmin, limpieza de `<time>`, sobrescribir por nombre, eliminar, ocultar elementos sueltos, mostrar descripciones de los puntos.
- Tests con los archivos reales de `assets/geojson` y GPX de ejemplo como fixtures.

**Fase 5 · Sin conexión y pruebas en dispositivo** (≈ 1,5 semanas)
- Precache completo, descarga de zonas del mapa (o PMTiles), indicador de espacio usado.
- Prueba en un teléfono Android real y en un iPhone: instalación como PWA, modo avión, pantalla encendida durante la navegación, avisos de arribo.
- Playwright para los recorridos principales (con la geolocalización simulada).

**Fase 6 · Extras de Drone Forecast (fuera de la paridad, a confirmar)** (≈ 1,5 semanas)
- Mapa de **viento con partículas** sobre el mapa náutico (código de Drone Forecast) + **oleaje** de la API Marine de Open-Meteo (altura, período y dirección de ola y mar de fondo).
- Gráficos SVG: pronóstico de viento y olas del punto o de la ruta; perfil de velocidad del recorrido.
- **Registro de derrota** (track) en SQLite y exportación GPX: hoy la app no guarda el recorrido.
- Solo con conexión o con el último pronóstico guardado en caché.

### Etapa 2 — Backend, cuentas y sincronización

**Fase 7 · API NestJS** (≈ 2 semanas)
- `apps/api` con Prisma + Postgres en Docker; modelos `User`, `Session`, `Waypoint`, `ImportedLayer`, `UserSetting`, `ActiveRoute`.
- Login con Google, JWT + refresh rotativo, guard por usuario, endpoints `sync/push` y `sync/pull`, Swagger, tests e2e.

**Fase 8 · Sincronización en el cliente** (≈ 2 semanas)
- Botón "Iniciar sesión con Google", estado de cuenta en Ajustes, una base SQLite por usuario.
- Motor de sync (cola de cambios `dirty`, push/pull, cursor, reintentos con espera creciente, indicador "sincronizado hace…").
- Asociar los datos locales a la cuenta en el primer login; pruebas con dos dispositivos y con conflictos.

**Fase 9 · Producción** (≈ 1 semana)
- Despliegue (API + Postgres + web), dominio y HTTPS, copias de seguridad de Postgres, monitoreo de errores, límites de tasa, política de privacidad (cambia respecto de la app actual, que promete que los datos no salen del dispositivo).

**Total estimado:** ~12 semanas para la etapa 1 completa (≈ 10,5 sin la fase 6) y ~5 semanas para la etapa 2, a tiempo completo.

---

## 6. Decisiones tomadas (18/11/2026)

1. **SQLite local con sqlite-wasm + Drizzle; Prisma solo en el backend.** Aprobado.
2. **Sin segundo plano real:** no se empaqueta con Capacitor. Se mantiene la pantalla encendida con Wake Lock mientras se navega.
3. **Mapas sin conexión:** toda tesela que se descarga al navegar queda en caché y se reutiliza sin conexión (Workbox `CacheFirst`, con un tope amplio y sin vencimiento corto). La descarga de zonas queda como mejora opcional. Las capas vectoriales de costas, límites y áreas se mantienen siempre, empaquetadas.
4. **Viento:** entra en el alcance (fase 6) con pronóstico **actual y futuro** (control de hora como `WindTimeControl` de Drone Forecast).
5. **Mejoras aprobadas:** restaurar copia con opción reemplazar/combinar, ruta activa persistida, exportación TXT/CSV, tema nocturno rojo.

## 7. Riesgos y decisiones abiertas

1. **GPS con la pantalla apagada:** la web no lo permite. Si es imprescindible registrar posiciones en segundo plano, hace falta Capacitor (APK) — no requiere reescribir la app, pero suma una fase.
2. **Mapa base sin conexión:** descargar zonas sobre la marcha o un paquete PMTiles regional. Hay que decidir el área y el zoom máximo (define el tamaño: de decenas a cientos de MB).
3. **Licencias de las teselas satelitales** (Esri) y uso **no comercial** de Open-Meteo, igual que en Drone Forecast.
4. **Alcance de la fase 6:** la app original no tiene clima; viento y olas son funciones nuevas.
5. **Compatibilidad de copias de seguridad:** se mantiene la lectura de `MogData.json` de la app Flutter; ¿también se quiere poder exportar en ese formato para pasar datos de la web a la app?
6. **Notificaciones en iOS:** solo con la PWA instalada (iOS 16.4+).
7. **Safari y OPFS:** soportado desde 16.4; se prueba en dispositivo en la fase 5.
8. **Privacidad:** el texto de permisos actual dice que los datos nunca salen del dispositivo; en la etapa 2 hay que actualizarlo y dejar la sincronización como opcional.
