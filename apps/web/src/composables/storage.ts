/**
 * Lectura/escritura JSON en localStorage, tolerante a fallos: en modo privado o con el almacenamiento
 * bloqueado la app sigue funcionando, solo que sin recordar el estado.
 */
export function readJson<T>(key: string): Partial<T> {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Partial<T>) : {}
  } catch {
    return {}
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* sin persistencia */
  }
}
