import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { BACKUP_FILE_NAME } from '@gpsm/shared'

/**
 * Archivos de exportación y copias, 100 % en el dispositivo (sin red).
 *
 * Compartir en el teléfono: Web Share API con archivos. Chrome para Android solo deja compartir algunos tipos
 * (texto, CSV, imágenes, PDF...): GPX, KML, JSON y ZIP suelen quedar fuera, así que `canShareFile` se consulta
 * por archivo y, si no se puede, se descarga (en Android queda en "Descargas"). Safari en iOS sí los comparte.
 */

export const MIME = {
  gpx: 'application/gpx+xml',
  kml: 'application/vnd.google-earth.kml+xml',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
} as const

/** Texto → archivo, opcionalmente comprimido en un ZIP que lo contiene con el mismo nombre. */
export function makeFile(text: string, name: string, type: string, zip = false): File {
  if (!zip) return new File([text], name, { type })
  const data = zipSync({ [name]: strToU8(text) }, { level: 6 })
  return new File([data as BlobPart], name.replace(/\.[^.]+$/, '') + '.zip', { type: MIME.zip })
}

export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** `shared`, `cancelled` (el usuario cerró el menú) o `downloaded` (no se podía compartir o falló). */
export async function shareOrDownload(file: File, title: string): Promise<'shared' | 'cancelled' | 'downloaded'> {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    }
  }
  downloadFile(file)
  return 'downloaded'
}

export class BackupFileError extends Error {}

/**
 * Lee una copia elegida por el usuario: `.json` o `.zip` con `MogData.json` (como la de Flutter) o con
 * cualquier `.json` adentro. Devuelve el texto JSON.
 */
export async function readBackupText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b // "PK"
  if (!isZip) return new TextDecoder().decode(bytes)
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes, { filter: (f) => /\.json$/i.test(f.name) })
  } catch {
    throw new BackupFileError('bad-zip')
  }
  const names = Object.keys(entries)
  const name = names.find((n) => n.split('/').pop() === BACKUP_FILE_NAME) ?? names[0]
  if (!name) throw new BackupFileError('no-json')
  return strFromU8(entries[name]!)
}

/** Sello de fecha para nombres de archivo: `20261118-2130`. */
export function fileStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}
