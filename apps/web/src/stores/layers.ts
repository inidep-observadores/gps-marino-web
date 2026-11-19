import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { unzipSync, strFromU8 } from 'fflate'
import {
  DEFAULT_BASE_VISIBLE,
  LayerFormatError,
  detectLayerFormat,
  layerNameFromFile,
  parseGeoJsonLayer,
  parseGpxLayer,
  type BaseGroup,
  type DrawFeature,
  type ImportedLayer,
  type LayerFormat,
  type ParsedLayer,
} from '@gpsm/shared'
import { BASE_LAYER_GROUPS, IMPORTED_TOKENS } from '@/layers/baseLayers'
import { useDatabaseStore } from './database'

const BASE_KEY = 'layers.base'
const LABELS_KEY = 'layers.labels'

/** Capa lista para dibujar: elementos con el token de color (`_tok`) y la marca de ocultos. */
export interface RenderLayer {
  /** `base-<grupo>` o `imp-<id>`. */
  sourceId: string
  kind: 'base' | 'imported'
  group?: BaseGroup
  /** Id de la capa importada. */
  layerId?: string
  dashed: boolean
  parsed: ParsedLayer
}

export class LayerImportError extends Error {
  constructor(public code: 'unsupported' | 'zipEmpty' | 'unreadable' | 'invalid' | 'empty') {
    super(code)
  }
}

/** Lee un GPX con el `DOMParser` del navegador. */
const parseXml = (s: string) => new DOMParser().parseFromString(s, 'application/xml')

/** Agrega `_tok` (token de color por defecto) a cada elemento sin perder los ids. */
function tagged(parsed: ParsedLayer, token: string): ParsedLayer {
  const tag = (f: DrawFeature) => ({ ...f, properties: { ...f.properties, _tok: token } })
  return { ...parsed, features: parsed.features.map(tag) }
}

function parseLayer(format: LayerFormat, text: string, key: string, group?: BaseGroup, fileName?: string): ParsedLayer {
  // Color por defecto vacío: el mapa lo resuelve con el token del tema (cambia con el tema nocturno).
  const opts = { key, defaultColor: '', group, fileName }
  return format === 'gpx' ? parseGpxLayer(text, parseXml, opts) : parseGeoJsonLayer(text, opts)
}

/** Archivo elegido → texto y formato. Un ZIP se abre y se toma el primer GPX/GeoJSON (como la app Flutter). */
export async function readLayerFile(file: File): Promise<{ name: string; format: LayerFormat; text: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let entries: Record<string, Uint8Array>
    try {
      entries = unzipSync(bytes, { filter: (f) => detectLayerFormat(f.name) != null && !f.name.startsWith('__MACOSX') })
    } catch {
      throw new LayerImportError('unreadable')
    }
    const name = Object.keys(entries).sort()[0]
    if (!name) throw new LayerImportError('zipEmpty')
    return { name: layerNameFromFile(name), format: detectLayerFormat(name)!, text: strFromU8(entries[name]!) }
  }
  const format = detectLayerFormat(file.name)
  if (!format) throw new LayerImportError('unsupported')
  return { name: layerNameFromFile(file.name), format, text: new TextDecoder().decode(bytes) }
}

/**
 * Capas del mapa: grupos base empaquetados (visibilidad y etiquetas guardadas en `settings`) y capas importadas
 * (en SQLite, con su contenido). Las geometrías se parsean una vez y quedan en memoria.
 */
export const useLayersStore = defineStore('layers', () => {
  const database = useDatabaseStore()

  const baseVisible = ref<Record<BaseGroup, boolean>>({ ...DEFAULT_BASE_VISIBLE })
  const showLabels = ref(false)
  const imported = ref<ImportedLayer[]>([])
  const baseParsed = shallowRef(new Map<BaseGroup, ParsedLayer>())
  const importedParsed = shallowRef(new Map<string, ParsedLayer>())
  const loadingBase = ref(false)

  async function load() {
    const repos = await database.ready()
    baseVisible.value = { ...baseVisible.value, ...(await repos.settings.get<Partial<Record<BaseGroup, boolean>>>(BASE_KEY, {})) }
    showLabels.value = await repos.settings.get(LABELS_KEY, false)
    imported.value = await repos.layers.list()
    const parsed = new Map<string, ParsedLayer>()
    imported.value.forEach((l, i) => {
      try {
        parsed.set(l.id, tagged(parseLayer(l.format, l.content, l.id), IMPORTED_TOKENS[i % IMPORTED_TOKENS.length]!))
      } catch {
        /* una capa dañada no impide cargar las demás */
      }
    })
    importedParsed.value = parsed
    await ensureBase()
  }

  /** Baja (del precache) y parsea los grupos base visibles que todavía no estén en memoria. */
  async function ensureBase() {
    const missing = BASE_LAYER_GROUPS.filter((g) => baseVisible.value[g.key] && !baseParsed.value.has(g.key))
    if (!missing.length) return
    loadingBase.value = true
    try {
      const next = new Map(baseParsed.value)
      for (const g of missing) {
        const parts = await Promise.all(
          g.files.map(async (file) => {
            const res = await fetch(file.path)
            if (!res.ok) return null
            const fileName = file.path.split('/').pop()!
            return tagged(parseLayer('geojson', await res.text(), `${g.key}/${fileName}`, g.key, fileName), file.token)
          }),
        )
        const ok = parts.filter((p): p is ParsedLayer => !!p)
        next.set(g.key, {
          features: ok.flatMap((p) => p.features),
          labels: ok.flatMap((p) => p.labels),
          descriptions: [],
          props: Object.assign({}, ...ok.map((p) => p.props)),
        })
      }
      baseParsed.value = next
    } finally {
      loadingBase.value = false
    }
  }

  async function setBaseVisible(group: BaseGroup, visible: boolean) {
    baseVisible.value = { ...baseVisible.value, [group]: visible }
    await (await database.ready()).settings.set(BASE_KEY, baseVisible.value)
    await ensureBase()
  }

  async function setShowLabels(v: boolean) {
    showLabels.value = v
    await (await database.ready()).settings.set(LABELS_KEY, v)
  }

  const findByName = (name: string) => imported.value.find((l) => l.name.toLowerCase() === name.toLowerCase()) ?? null

  /**
   * Valida e importa. Si ya hay una capa con ese nombre y no se pidió sobrescribir, devuelve `exists` sin guardar
   * (la interfaz pregunta y vuelve a llamar con `overwrite`).
   */
  async function importFile(file: File, overwrite = false): Promise<{ status: 'imported' | 'exists'; name: string }> {
    const { name, format, text } = await readLayerFile(file)
    let parsed: ParsedLayer
    try {
      parsed = parseLayer(format, text, 'check')
    } catch (e) {
      throw new LayerImportError(e instanceof LayerFormatError && e.message === 'empty' ? 'empty' : 'invalid')
    }
    void parsed
    const repos = await database.ready()
    const existing = findByName(name)
    if (existing && !overwrite) return { status: 'exists', name }
    const input = { name, format, visible: true, importedAt: Date.now(), hiddenFeatures: [], showDescriptions: false, content: text }
    const saved = existing ? await repos.layers.update(existing.id, input) : await repos.layers.create(input)
    if (!saved) throw new LayerImportError('unreadable')
    await load()
    return { status: 'imported', name }
  }

  async function patch(id: string, p: Partial<Pick<ImportedLayer, 'visible' | 'showDescriptions' | 'hiddenFeatures'>>) {
    const updated = await (await database.ready()).layers.update(id, p)
    if (updated) imported.value = imported.value.map((l) => (l.id === id ? updated : l))
  }

  const toggleVisible = (id: string) => patch(id, { visible: !imported.value.find((l) => l.id === id)?.visible })
  const toggleDescriptions = (id: string) => patch(id, { showDescriptions: !imported.value.find((l) => l.id === id)?.showDescriptions })

  /** Oculta o muestra elementos de una capa importada (quedan atenuados en el mapa, como en Flutter). */
  async function setHidden(id: string, featureIds: string[], hide: boolean) {
    const layer = imported.value.find((l) => l.id === id)
    if (!layer) return
    const set = new Set(layer.hiddenFeatures)
    for (const f of featureIds) {
      if (hide) set.add(f)
      else set.delete(f)
    }
    await patch(id, { hiddenFeatures: [...set] })
  }

  async function remove(id: string) {
    await (await database.ready()).layers.remove(id)
    imported.value = imported.value.filter((l) => l.id !== id)
    const next = new Map(importedParsed.value)
    next.delete(id)
    importedParsed.value = next
  }

  /** Capas a dibujar, de abajo hacia arriba: grupos base visibles y luego las importadas visibles. */
  const renderLayers = computed<RenderLayer[]>(() => [
    ...BASE_LAYER_GROUPS.filter((g) => baseVisible.value[g.key] && baseParsed.value.has(g.key)).map((g) => ({
      sourceId: `base-${g.key}`,
      kind: 'base' as const,
      group: g.key,
      dashed: !!g.dashed,
      parsed: baseParsed.value.get(g.key)!,
    })),
    ...imported.value
      .filter((l) => l.visible && importedParsed.value.has(l.id))
      .map((l) => ({ sourceId: `imp-${l.id}`, kind: 'imported' as const, layerId: l.id, dashed: false, parsed: importedParsed.value.get(l.id)! })),
  ])

  return {
    baseVisible,
    showLabels,
    imported,
    loadingBase,
    renderLayers,
    importedParsed,
    load,
    setBaseVisible,
    setShowLabels,
    importFile,
    toggleVisible,
    toggleDescriptions,
    setHidden,
    remove,
    findByName,
  }
})
