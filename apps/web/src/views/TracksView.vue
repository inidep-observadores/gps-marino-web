<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Download, Eye, FileJson, EyeOff, FileUp, Pencil, Play, Route as RouteIcon, Trash2, X } from '@lucide/vue'
import { ASSUMED_SPEED_KN } from '@gpsm/shared'
import CardSection from '@/components/ui/CardSection.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useFormat } from '@/composables/useFormat'
import { TrackImportError } from '@/services/trackFiles'
import type { Track } from '@/repositories/tracks'
import { useToastStore } from '@/stores/toast'
import { useTrackPlayerStore } from '@/stores/trackPlayer'
import { useTracksStore } from '@/stores/tracks'
import { useUiStore } from '@/stores/ui'

/**
 * Pestaña Derrotas: las derrotas guardadas (grabadas o importadas) con su recorrido, para cambiarles el nombre, mostrarlas u
 * ocultarlas en el mapa, exportarlas, borrarlas o reproducirlas. Solo una derrota puede estar activa (en reproducción).
 */
const { t, d } = useI18n()
const f = useFormat()
const tracks = useTracksStore()
const player = useTrackPlayerStore()
const ui = useUiStore()
const toast = useToastStore()
const confirm = useConfirm()

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busy.value = true
  try {
    const r = await tracks.importFile(file)
    toast.push(r.tracks.length === 1 ? t('tracks.importedOne', { name: r.tracks[0]!.name }) : t('tracks.importedMany', { n: r.tracks.length }), { tone: 'success' })
    if (!r.timed) toast.push(t('tracks.untimed', { kn: ASSUMED_SPEED_KN }), { tone: 'warning', timeoutMs: 8000 })
  } catch (err) {
    toast.push(t(`tracks.errors.${err instanceof TrackImportError ? err.code : 'unreadable'}`), { tone: 'warning', timeoutMs: 7000 })
  } finally {
    busy.value = false
  }
}

async function play(tr: Track) {
  if (await player.open(tr.id)) ui.go('map')
}

// Cambiar el nombre en la propia fila: lápiz, escribir y Enter guarda (Escape cancela).
const renamingId = ref<string | null>(null)
const draft = ref('')
const renameError = ref(false)
async function startRename(tr: Track) {
  renamingId.value = tr.id
  draft.value = tr.name
  renameError.value = false
  await nextTick()
  const el = document.getElementById('track-rename') as HTMLInputElement | null
  el?.focus()
  el?.select()
}
function cancelRename() {
  renamingId.value = null
  renameError.value = false
}
async function commitRename(tr: Track) {
  if (!draft.value.trim()) {
    renameError.value = true
    return
  }
  await tracks.rename(tr.id, draft.value)
  cancelRename()
}

async function remove(tr: Track) {
  if (await confirm({ title: t('tracks.deleteTitle'), message: t('tracks.deleteMessage', { name: tr.name }), confirmLabel: t('waypoints.delete'), tone: 'danger' })) await tracks.remove(tr.id)
}
async function exportTrack(tr: Track, kind: 'gpx' | 'geojson' = 'gpx') {
  const r = await (kind === 'gpx' ? tracks.exportGpx(tr) : tracks.exportGeoJson(tr))
  if (r !== 'cancelled') toast.push(t(r === 'shared' ? 'export.shared' : 'export.downloaded', { name: tr.name }), { tone: 'success' })
}

const duration = (t0: number, t1: number | null) => {
  const m = Math.max(0, Math.round(((t1 ?? Date.now()) - t0) / 60_000))
  if (m >= 2880) return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}
const started = (tr: Track) => d(tr.startedAt, { dateStyle: 'medium', timeStyle: 'short' })
const sub = computed(() => (tracks.list.length ? t('tracks.count', tracks.list.length) : ''))
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4 pb-6">
    <CardSection :title="t('tracks.title')" :subtitle="sub" :icon="RouteIcon">
      <div class="flex flex-col gap-3">
        <p class="text-caption">{{ t('tracks.hint') }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="btn-primary" :disabled="busy" @click="fileInput?.click()">
            <FileUp class="size-4" aria-hidden="true" />{{ t('tracks.import') }}
          </button>
          <!-- `accept` solo con extensiones y application/* o text/*: sin él (o con image/*) Android abre el selector de fotos en vez del de archivos. -->
          <input ref="fileInput" type="file" accept=".geojson,.json,.gpx,.zip,.dbf,application/*,text/*" class="sr-only" tabindex="-1" aria-hidden="true" @change="onFile" />
          <span class="text-caption">{{ t('tracks.importHint') }}</span>
        </div>
      </div>
    </CardSection>

    <div v-if="!tracks.list.length" class="card card-body flex flex-col items-center gap-2 py-10 text-center">
      <span class="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-ink-subtle"><RouteIcon class="size-6" aria-hidden="true" /></span>
      <p class="font-medium">{{ t('tracks.emptyTitle') }}</p>
      <p class="text-caption max-w-xs">{{ t('tracks.emptyHint') }}</p>
    </div>

    <ul v-else class="list">
      <li v-for="tr in tracks.list" :key="tr.id" class="flex flex-col gap-2 px-4 py-3" :class="{ 'bg-accent/8': player.track?.id === tr.id }">
        <div class="flex items-center gap-2">
          <!-- Nombre (o editor) -->
          <div v-if="renamingId === tr.id" class="flex min-w-0 flex-1 flex-col gap-1">
            <input
              id="track-rename"
              v-model="draft"
              class="input h-10"
              maxlength="80"
              :aria-label="t('tracks.rename', { name: tr.name })"
              :aria-invalid="renameError"
              @keydown.enter.prevent="commitRename(tr)"
              @keydown.esc.prevent="cancelRename"
            />
            <span v-if="renameError" class="text-xs text-stop">{{ t('tracks.nameEmpty') }}</span>
          </div>
          <span v-else class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm font-semibold" :class="{ 'text-ink-subtle': !tr.visible && player.track?.id !== tr.id }">{{ tr.name }}</span>
            <span class="numeric text-xs text-ink-subtle">
              <template v-if="tracks.recording?.id === tr.id">● {{ t('tracks.recording') }} · </template>{{ f.distance(tr.distanceNm) }} {{ t('units.nm') }} · {{ duration(tr.startedAt, tr.endedAt) }} · {{ t('tracks.points', tr.pointCount) }}
            </span>
            <span class="text-xs text-ink-subtle">{{ started(tr) }}<template v-if="player.track?.id === tr.id"> · <span class="font-semibold text-accent">{{ t('tracks.selectedHint') }}</span></template></span>
          </span>

          <template v-if="renamingId === tr.id">
            <button type="button" class="icon-btn text-accent" :aria-label="t('tracks.renameSave')" @click="commitRename(tr)"><Check class="size-5" /></button>
            <button type="button" class="icon-btn" :aria-label="t('tracks.renameCancel')" @click="cancelRename"><X class="size-5" /></button>
          </template>
        </div>

        <!-- Acciones: botones grandes, en una fila que se ajusta en el teléfono -->
        <div v-if="renamingId !== tr.id" class="flex flex-wrap items-center gap-1.5">
          <button type="button" class="btn-secondary h-10" :disabled="tracks.recording?.id === tr.id || tr.pointCount < 2" :aria-label="t('tracks.play', { name: tr.name })" @click="play(tr)">
            <Play class="size-4" aria-hidden="true" />{{ t('tracks.player.play') }}
          </button>
          <button type="button" class="icon-btn" :aria-pressed="tr.visible" :aria-label="t(tr.visible ? 'layers.hideLayer' : 'layers.showLayer', { name: tr.name })" :title="t(tr.visible ? 'layers.hideLayer' : 'layers.showLayer', { name: tr.name })" @click="tracks.setVisible(tr.id, !tr.visible)">
            <Eye v-if="tr.visible" class="size-5 text-accent" />
            <EyeOff v-else class="size-5" />
          </button>
          <button type="button" class="icon-btn" :aria-label="t('tracks.rename', { name: tr.name })" :title="t('tracks.rename', { name: tr.name })" @click="startRename(tr)"><Pencil class="size-5" /></button>
          <button type="button" class="icon-btn" :disabled="tracks.recording?.id === tr.id" :aria-label="t('tracks.exportGpx', { name: tr.name })" :title="t('tracks.exportGpx', { name: tr.name })" @click="exportTrack(tr)"><Download class="size-5" /></button>
          <button type="button" class="icon-btn" :disabled="tracks.recording?.id === tr.id" :aria-label="t('tracks.exportGeoJson', { name: tr.name })" :title="t('tracks.exportGeoJson', { name: tr.name })" @click="exportTrack(tr, 'geojson')"><FileJson class="size-5" /></button>
          <button type="button" class="icon-btn text-stop" :disabled="tracks.recording?.id === tr.id" :aria-label="t('layers.deleteLayer', { name: tr.name })" :title="t('layers.deleteLayer', { name: tr.name })" @click="remove(tr)"><Trash2 class="size-5" /></button>
        </div>
      </li>
    </ul>
  </div>
</template>
