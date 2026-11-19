import type es from './es'

type Messages<T> = { [K in keyof T]: T[K] extends string ? string : Messages<T[K]> }

const en: Messages<typeof es> = {
  app: {
    title: 'Marine GPS',
    tagline: 'Onboard navigation',
    disclaimer: 'Navigation aid. It does not replace official nautical charts or the vessel instruments.',
    localData: 'Your data is stored on this device',
  },
  nav: {
    label: 'Sections',
    gps: 'GPS',
    waypoints: 'Waypoints',
    map: 'Map',
  },
  common: {
    close: 'Close',
    cancel: 'Cancel',
    confirm: 'Confirm',
    loading: 'Loading…',
    offline: 'Offline. Everything saved on the device is still available.',
    comingSoon: 'Under construction',
  },
  gps: {
    title: 'GPS data',
    inactive: 'GPS off',
    date: 'Date',
    time: 'Time',
    latitude: 'Latitude',
    longitude: 'Longitude',
    speed: 'Speed',
    bearing: 'Heading',
    pending: 'GPS readings, position logging and navigation to a target arrive in phase 1.',
  },
  waypoints: {
    title: 'Waypoints',
    count: 'No saved waypoints | 1 saved waypoint | {n} saved waypoints',
    empty: 'No saved waypoints yet.',
    emptyHint: 'Positions you log from the GPS tab or the map will show up here.',
    pending: 'Editing, search, sorting, export (GPX, KML, JSON, CSV) and backup restore arrive in phase 2.',
  },
  map: {
    title: 'Map',
    pending:
      'The map (MapLibre), vessel, route, cursor, measuring tool and the coast, boundary and fishing area layers arrive in phases 3 and 4.',
  },
  settings: {
    title: 'Settings',
    appearance: 'Appearance',
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeNight: 'Night',
    themeNightHint: 'Dim red for the bridge at night: keeps your night vision.',
    language: 'Language',
    storage: 'Storage',
    storagePersistent: 'Local database saved on this device',
    storageMemory: 'Temporary database: changes are lost when closing',
    storageOpening: 'Opening the local database…',
    storageError: 'Could not open the local database',
    storageFallback: 'Reason: {reason}',
    storageProtected: 'Protected from automatic browser cleanup',
    storageUnprotected: 'The browser could delete it when low on space. Installing the app helps protect it.',
    storageUsage: 'Space used: {used} of {quota}',
    sqlite: 'SQLite {version}',
    records: 'Records',
    recordsWaypoints: 'Waypoints',
    recordsLayers: 'Imported layers',
    install: 'Install the app',
    installHint: 'Opens like an app and works offline.',
    version: 'Version {version}',
  },
}

export default en
