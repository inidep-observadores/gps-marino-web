import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { BackupFileError, fileStamp, makeFile, readBackupText } from '@/services/files'

describe('archivos de exportación y copias', () => {
  it('comprime en un ZIP que se puede volver a leer (como la copia de Flutter)', async () => {
    const zip = makeFile('[{"a":1}]', 'MogData.json', 'application/json', true)
    expect(zip.name).toBe('MogData.zip')
    expect(zip.type).toBe('application/zip')
    expect(await readBackupText(zip)).toBe('[{"a":1}]')
  })

  it('lee un JSON suelto', async () => {
    expect(await readBackupText(new File(['[]'], 'copia.json'))).toBe('[]')
  })

  it('en un ZIP prefiere MogData.json y si no, el primer .json', async () => {
    const both = zipSync({ 'otro.json': strToU8('"x"'), 'dir/MogData.json': strToU8('"y"'), 'leeme.txt': strToU8('z') })
    expect(await readBackupText(new File([both as BlobPart], 'a.zip'))).toBe('"y"')
    const one = zipSync({ 'otro.json': strToU8('"x"') })
    expect(await readBackupText(new File([one as BlobPart], 'b.zip'))).toBe('"x"')
  })

  it('un ZIP sin JSON es un error claro', async () => {
    const none = zipSync({ 'leeme.txt': strToU8('z') })
    await expect(readBackupText(new File([none as BlobPart], 'c.zip'))).rejects.toBeInstanceOf(BackupFileError)
  })

  it('sello de fecha para nombres de archivo', () => {
    expect(fileStamp(new Date(2026, 10, 8, 7, 5))).toBe('20261108-0705')
  })
})
