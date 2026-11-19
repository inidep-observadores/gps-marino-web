/**
 * Textos en español (fuente de las claves; `en.ts` está tipado contra este archivo).
 * No usar `|`, `@`, `{` ni `$` literales: vue-i18n los interpreta.
 */
export default {
  app: {
    title: 'GPS Marino',
    tagline: 'Navegación a bordo',
    disclaimer:
      'Ayuda a la navegación. No reemplaza las cartas náuticas oficiales ni los instrumentos del buque.',
    localData: 'Tus datos se guardan en este dispositivo',
  },
  nav: {
    label: 'Secciones',
    gps: 'GPS',
    waypoints: 'Ubicaciones',
    map: 'Mapa',
  },
  common: {
    close: 'Cerrar',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    loading: 'Cargando…',
    offline: 'Sin conexión. Todo lo guardado en el dispositivo sigue disponible.',
    comingSoon: 'En construcción',
  },
  gps: {
    title: 'Datos GPS',
    inactive: 'GPS inactivo',
    date: 'Fecha',
    time: 'Hora',
    latitude: 'Latitud',
    longitude: 'Longitud',
    speed: 'Velocidad',
    bearing: 'Rumbo',
    pending: 'La lectura del GPS, el registro de posiciones y la navegación a un destino llegan en la fase 1.',
  },
  waypoints: {
    title: 'Ubicaciones',
    count: 'Sin ubicaciones guardadas | 1 ubicación guardada | {n} ubicaciones guardadas',
    empty: 'Todavía no hay ubicaciones guardadas.',
    emptyHint: 'Cuando registres una posición desde la pestaña GPS o el mapa, aparecerá aquí.',
    pending: 'Edición, búsqueda, orden, exportación (GPX, KML, JSON, CSV) y restaurar copias llegan en la fase 2.',
  },
  map: {
    title: 'Mapa',
    pending:
      'El mapa (MapLibre), el buque, la ruta, el cursor, la medición y las capas de costas, límites y áreas de pesca llegan en las fases 3 y 4.',
  },
  settings: {
    title: 'Ajustes',
    appearance: 'Apariencia',
    theme: 'Tema',
    themeSystem: 'Sistema',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    themeNight: 'Nocturno',
    themeNightHint: 'Rojo tenue para el puente de noche: no encandila.',
    language: 'Idioma',
    storage: 'Almacenamiento',
    storagePersistent: 'Base local guardada en este dispositivo',
    storageMemory: 'Base temporal: los cambios se pierden al cerrar',
    storageOpening: 'Abriendo la base local…',
    storageError: 'No se pudo abrir la base local',
    storageFallback: 'Motivo: {reason}',
    storageProtected: 'Protegida contra el borrado automático del navegador',
    storageUnprotected: 'El navegador podría borrarla si le falta espacio. Instalar la app ayuda a protegerla.',
    storageUsage: 'Espacio usado: {used} de {quota}',
    sqlite: 'SQLite {version}',
    records: 'Registros',
    recordsWaypoints: 'Ubicaciones',
    recordsLayers: 'Capas importadas',
    install: 'Instalar la app',
    installHint: 'Se abre como una app y funciona sin conexión.',
    version: 'Versión {version}',
  },
}
