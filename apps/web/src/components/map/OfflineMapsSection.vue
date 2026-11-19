<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, HardDriveDownload, Trash2, X } from '@lucide/vue'
import { countTiles, expandBounds, type Bounds } from '@gpsm/shared'
import SegmentedControl, { type SegmentOption } from '@/components/ui/SegmentedControl.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useTheme } from '@/composables/useTheme'
import { useMapStore } from '@/stores/map'
import { useToastStore } from '@/stores/toast'
import {
  DOWNLOAD_MIN_ZOOM,
  SOURCE_LIMITS,
  clearTileCache,
  downloadArea,
  storedTileCount,
  type DownloadProgress,
  type TileSource,
} from './offlineTiles'

/**
 * Mapas sin conexión: baja el mapa estándar de la zona que se está viendo (más un margen) hasta el nivel de detalle
 * elegido. Lo que se mira con conexión ya se guarda solo; esto sirve para preparar la zona de pesca antes de zarpar.
 * Antes de bajar se muestra cuántas teselas son y una estimación del espacio.
 */
const { t } = useI18n()
const map = useMapStore()
const toast = useToastStore()
const confirm = useConfirm()
const theme = useTheme()

/** Se baja el mapa que se está usando: el vectorial si ese es el tipo elegido; en cualquier otro caso, Argenmap (el mapa base). */
const source = computed<TileSource>(() => (map.settings.mapType === 'vector' ? 'vector' : 'argenmap'))
const limits = computed(() => SOURCE_LIMITS[source.value])

type Detail = 'basic' | 'medium' | 'high'
const DETAIL_ZOOM: Record<Detail, number> = { basic: 9, medium: 11, high: 13 }
const detail = ref<Detail>('medium')
const detailOptions = computed<SegmentOption<Detail>[]>(() => [
  { value: 'basic', label: t('offlineMaps.basic') },
  { value: 'medium', label: t('offlineMaps.medium') },
  { value: 'high', label: t('offlineMaps.high') },
])

const bounds = ref<Bounds | null>(null)
const stored = ref(0)
const progress = ref<DownloadProgress | null>(null)
let abort: AbortController | null = null

onMounted(async () => {
  const b = map.controller?.getBounds()
  bounds.value = b ? expandBounds(b, 0.15) : null
  stored.value = await storedTileCount(source.value)
})
onBeforeUnmount(() => abort?.abort())

const maxZoom = computed(() => DETAIL_ZOOM[detail.value])
const total = computed(() => (bounds.value ? countTiles(bounds.value, DOWNLOAD_MIN_ZOOM, maxZoom.value) : 0))
const tooBig = computed(() => total.value > limits.value.maxTiles)
const estimateMb = computed(() => Math.max(1, Math.round((total.value * limits.value.avgKb) / 1024)))
const busy = computed(() => progress.value !== null)
const pct = computed(() => (progress.value?.total ? Math.round((progress.value.done / progress.value.total) * 100) : 0))

async function start() {
  if (!bounds.value || tooBig.value || busy.value) return
  abort = new AbortController()
  progress.value = { done: 0, total: total.value, failed: 0, skipped: 0 }
  try {
    const r = await downloadArea(bounds.value, maxZoom.value, total.value, (p) => (progress.value = p), abort.signal, { kind: source.value, dark: theme.isDark.value })
    if (r.aborted) toast.push(t('offlineMaps.cancelled'), { tone: 'info' })
    else if (r.offline) toast.push(t('offlineMaps.offline'), { tone: 'warning', timeoutMs: 8000 })
    else if (r.failed) toast.push(t('offlineMaps.partial', { n: r.failed }), { tone: 'warning', timeoutMs: 8000 })
    else toast.push(t('offlineMaps.done'), { tone: 'success' })
  } finally {
    progress.value = null
    abort = null
    stored.value = await storedTileCount(source.value)
  }
}

async function clear() {
  const ok = await confirm({
    title: t('offlineMaps.clearTitle'),
    message: t('offlineMaps.clearMessage'),
    confirmLabel: t('offlineMaps.clear'),
    tone: 'danger',
  })
  if (!ok) return
  await clearTileCache(source.value)
  stored.value = 0
  toast.push(t('offlineMaps.cleared'), { tone: 'success' })
}
</script>

<template>
  <section class="panel-section">
    <h3 class="eyebrow flex items-center gap-1.5"><HardDriveDownload class="size-3.5" aria-hidden="true" />{{ t('offlineMaps.title') }}</h3>
    <p class="text-caption">{{ t('offlineMaps.intro') }}</p>

    <div class="field">
      <span class="field-label">{{ t('offlineMaps.detail') }}</span>
      <SegmentedControl v-model="detail" :options="detailOptions" :label="t('offlineMaps.detail')" :class="{ 'pointer-events-none opacity-60': busy }" />
    </div>

    <div class="readout gap-1">
      <span class="readout-label">{{ t('offlineMaps.visibleArea') }}</span>
      <span class="numeric text-sm">{{ t('offlineMaps.estimate', { tiles: total.toLocaleString(), mb: estimateMb }) }}</span>
      <span v-if="tooBig" class="text-xs text-stop">{{ t('offlineMaps.tooBig', { max: limits.maxTiles.toLocaleString() }) }}</span>
    </div>

    <div v-if="busy && progress" class="flex flex-col gap-2" role="status">
      <div class="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
        <div class="h-full rounded-full bg-accent transition-[width]" :style="{ width: `${pct}%` }"></div>
      </div>
      <p class="numeric text-xs text-ink-muted">
        {{ t('offlineMaps.progress', { done: progress.done.toLocaleString(), total: progress.total.toLocaleString(), pct }) }}
      </p>
      <button type="button" class="btn-secondary" @click="abort?.abort()"><X class="size-4" aria-hidden="true" />{{ t('common.cancel') }}</button>
    </div>
    <button v-else type="button" class="btn-primary" :disabled="tooBig || !total" @click="start">
      <Download class="size-4" aria-hidden="true" />{{ t('offlineMaps.download') }}
    </button>

    <div class="flex items-center justify-between gap-3 text-sm">
      <span class="numeric text-ink-muted">{{ t('offlineMaps.stored', { n: stored.toLocaleString(), mb: Math.round((stored * limits.avgKb) / 1024) }) }}</span>
      <button type="button" class="btn-ghost h-9 px-3 text-stop" :disabled="!stored || busy" @click="clear">
        <Trash2 class="size-4" aria-hidden="true" />{{ t('offlineMaps.clear') }}
      </button>
    </div>
    <p class="text-caption">{{ t('offlineMaps.satelliteNote') }}</p>
  </section>
</template>
