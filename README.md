# GPS Marino Web

Webapp (PWA) de GPS y registro de ubicaciones para uso a bordo, réplica de **Marine Onboard GPS**. Funciona sin conexión y guarda los datos en una base SQLite local del navegador. En una segunda etapa se suma un backend NestJS + Postgres con inicio de sesión de Google y sincronización.

Plan completo: [PLAN.md](PLAN.md). Guía para desarrollar: [CLAUDE.md](CLAUDE.md).

## Requisitos
- Node 22+ y pnpm 11.

## Uso
```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test
pnpm build      # apps/web/dist
pnpm preview    # sirve el build (service worker y modo sin conexión)
```

## Estado
Fase 0 (fundaciones) terminada: monorepo, paquete compartido, sistema de diseño, layout con las pestañas GPS / Ubicaciones / Mapa, tema claro/oscuro/nocturno, PWA y base SQLite persistente (OPFS) con migraciones y repositorios. 

Fase 1 (GPS y navegación) terminada: lectura del GPS con estados, velocidad promedio y rumbo (derivados si el dispositivo no los da), pantalla encendida, registro rápido y registrar posición con ícono y color, destino y ruta con avance automático, ETA y avisos de arribo, ruta persistida.

Fase 2 (ubicaciones) terminada: alta y edición completas (grados-minutos-hemisferio, fecha y hora, velocidad, rumbo, ícono, color), lista con búsqueda sin acentos, orden, agrupado por día y selección múltiple (mostrar/ocultar en el mapa, exportar, eliminar), exportación GPX/KML/CSV y copia de seguridad compatible con la app Flutter (MogData), restaurar combinando o reemplazando, y aviso de copia pendiente.

Fase 3 (mapa) terminada: MapLibre a pantalla completa con mapa estándar, satélite, híbrido y batimetría (+ señales náuticas), buque con rumbo, seguir al buque, anillos de distancia, línea COG, ruta, ubicaciones con su ícono, cursor (registrar y navegar a esa posición), medición de distancias, ficha de la ubicación tocada y teselas guardadas para usar sin conexión.

Fase 4 (capas) terminada: capas base de la app Flutter (costas, áreas generales, vedas, vieira, centolla, langostino) con sus colores y etiquetas, siempre disponibles sin conexión; importación de GeoJSON, GPX y ZIP con estilos simplestyle y colores Garmin, descripciones de puntos, elementos ocultos y ficha con distancia, rumbo y ETA. Próximo: fase 5 (sin conexión y pruebas en dispositivo).
