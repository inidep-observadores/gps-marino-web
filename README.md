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
Fase 0 (fundaciones) terminada: monorepo, paquete compartido, sistema de diseño, layout con las pestañas GPS / Ubicaciones / Mapa, tema claro/oscuro/nocturno, PWA y base SQLite persistente (OPFS) con migraciones y repositorios. Próximo: fase 1 (GPS y navegación).
