<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, FileArchive, FileSpreadsheet, Globe, MapPinned, Share2 } from '@lucide/vue'
import { BACKUP_FILE_NAME, toCsv, toGpx, toKml, toMogJson, type Waypoint } from '@gpsm/shared'
import ToggleRow from '@/components/ui/ToggleRow.vue'
import { useFormat } from '@/composables/useFormat'
import { MIME, canShareFile, downloadFile, fileStamp, makeFile, shareOrDownload } from '@/services/files'
import { useToastStore } from '@/stores/toast'
import { useWaypointsStore } from '@/stores/waypoints'

/**
 * Exportar ubicaciones (las seleccionadas o todas). Todo se genera en el teléfono, sin conexión.
 * - Copia de seguridad: `MogData.json` dentro de un ZIP, igual que la app Flutter (se restaura en cualquiera de las dos).
 * - GPX / KML / CSV: archivo suelto por defecto (lo abren directo otras apps); opcionalmente en ZIP.
 */
const props = defineProps<{ ids: string[]; backup: boolean }>()
const emit = defineEmits<{ done: [] }>()

type Format = 'backup' | 'gpx' | 'kml' | 'csv'

const { t } = useI18n()
const f = useFormat()
const store = useWaypointsStore()
const toast = useToastStore()

const format = ref<Format>(props.backup ? 'backup' : 'gpx')
const zip = ref(false)
const busy = ref(false)

const list = computed<Waypoint[]>(() => {
  // Sin selección = todas (aunque haya una búsqueda activa), en el orden en que se guardaron.
  if (!props.ids.length) return [...store.items].sort((a, b) => a.recordedAt - b.recordedAt)
  const set = new Set(props.ids)
  return store.visibleList.filter((w) => set.has(w.id))
})

const FORMATS = computed(() => [
  { id: 'backup' as const, icon: FileArchive, title: t('export.backup'), hint: t('export.backupHint') },
  { id: 'gpx' as const, icon: MapPinned, title: t('export.gpx'), hint: t('export.gpxHint') },
  { id: 'kml' as const, icon: Globe, title: t('export.kml'), hint: t('export.kmlHint') },
  { id: 'csv' as const, icon: FileSpreadsheet, title: t('export.csv'), hint: t('export.csvHint') },
])

function build(dry = false): File {
  const items = dry ? [] : list.value
  const base = `MogData-${fileStamp()}`
  switch (format.value) {
    case 'backup':
      // El archivo de adentro se llama siempre MogData.json: es lo que busca la app Flutter al restaurar.
      return makeFile(dry ? '' : toMogJson(items), BACKUP_FILE_NAME, MIME.json, true)
    case 'gpx':
      return makeFile(dry ? '' : toGpx(items, { fallbackName: (w) => `${f.date(w.recordedAt)} ${f.time(w.recordedAt)}` }), `${base}.gpx`, MIME.gpx, zip.value)
    case 'kml':
      return makeFile(dry ? '' : toKml(items, { fallbackName: (w) => `${f.date(w.recordedAt)} ${f.time(w.recordedAt)}` }), `${base}.kml`, MIME.kml, zip.value)
    case 'csv':
      return makeFile(dry ? '' : toCsv(items, { west: t('units.west') }), `${base}.csv`, MIME.csv, zip.value)
  }
}

/** ¿El navegador deja compartir este tipo de archivo? (Chrome Android no comparte GPX/KML/ZIP: se descarga.) */
const shareable = computed(() => {
  void zip.value
  return canShareFile(build(true))
})

async function run(mode: 'share' | 'download') {
  if (!list.value.length) return
  busy.value = true
  try {
    const file = build()
    let result: 'shared' | 'cancelled' | 'downloaded'
    if (mode === 'share') result = await shareOrDownload(file, t('waypoints.title'))
    else {
      downloadFile(file)
      result = 'downloaded'
    }
    if (result === 'cancelled') return
    if (format.value === 'backup') await store.markBackup()
    toast.push(t(result === 'shared' ? 'export.shared' : 'export.downloaded', { name: file.name }), { tone: 'success' })
    emit('done')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <p class="text-sm text-secondary">{{ t('export.count', list.length) }}</p>

    <div class="flex flex-col gap-2" role="radiogroup" :aria-label="t('export.format')">
      <button
        v-for="opt in FORMATS"
        :key="opt.id"
        type="button"
        role="radio"
        :aria-checked="format === opt.id"
        class="flex items-start gap-3 rounded-2xl border p-3.5 text-left transition"
        :class="format === opt.id ? 'border-accent bg-accent/8 ring-2 ring-accent/20' : 'border-line hover:border-line-strong'"
        @click="format = opt.id"
      >
        <component :is="opt.icon" class="mt-0.5 size-5 shrink-0" :class="format === opt.id ? 'text-accent' : 'text-ink-subtle'" aria-hidden="true" />
        <span class="flex flex-col gap-0.5">
          <span class="text-sm font-semibold">{{ opt.title }}</span>
          <span class="text-caption">{{ opt.hint }}</span>
        </span>
      </button>
    </div>

    <ToggleRow v-if="format !== 'backup'" v-model="zip" :label="t('export.zip')" :hint="t('export.zipHint')" />

    <p v-if="!shareable" class="text-caption">{{ t('export.noShare') }}</p>

    <div class="grid gap-2.5" :class="shareable ? 'grid-cols-2' : 'grid-cols-1'">
      <button type="button" :class="shareable ? 'btn-secondary' : 'btn-primary'" :disabled="busy || !list.length" @click="run('download')">
        <Download class="size-4" aria-hidden="true" />{{ t('export.download') }}
      </button>
      <button v-if="shareable" type="button" class="btn-primary" :disabled="busy || !list.length" @click="run('share')">
        <Share2 class="size-4" aria-hidden="true" />{{ t('export.share') }}
      </button>
    </div>
  </div>
</template>
