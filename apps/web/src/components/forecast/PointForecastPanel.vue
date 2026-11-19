<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RotateCw, Waves, Wind, WifiOff } from '@lucide/vue'
import { HOUR_MS, MS_TO_KN, WIND_BAND_LIMITS_KN, beaufortForce, cardinal16, hoursFrom, type PointHour } from '@gpsm/shared'
import { useFormat } from '@/composables/useFormat'
import { usePointForecastStore } from '@/stores/pointForecast'
import { useUiStore } from '@/stores/ui'
import HourlyChart, { type ChartBand, type ChartLine } from './HourlyChart.vue'

/**
 * Pronóstico de un punto del mapa: lecturas de la hora elegida (viento, ráfagas, Beaufort, olas y mar de fondo) y dos
 * gráficos (viento y ráfagas en nudos; altura de ola y de mar de fondo en metros). Tocar un gráfico elige la hora.
 */
const props = defineProps<{ lat: number; lon: number }>()

const { t, locale } = useI18n()
const f = useFormat()
const store = usePointForecastStore()
const ui = useUiStore()
const now = ref(Date.now())

onMounted(() => void store.load({ lat: props.lat, lon: props.lon }))

const hours = computed<PointHour[]>(() => (store.data ? hoursFrom(store.data, now.value) : []))
const selected = ref<number | null>(null)
// Al llegar los datos: se elige la hora actual.
watch(
  () => store.data,
  (d) => {
    if (d) selected.value = Math.floor(Date.now() / HOUR_MS) * HOUR_MS
  },
)
const sel = computed(() => hours.value.find((h) => h.t === selected.value) ?? hours.value[0] ?? null)

const kn = (ms: number | null) => (ms == null ? null : ms * MS_TO_KN)
const west = computed(() => t('units.west'))
const dir = (d: number | null) => (d == null ? '--' : `${cardinal16(d, west.value)} ${Math.round(d)}°`)
const num = (v: number | null, digits = 0) => (v == null ? '--' : v.toLocaleString(locale.value, { minimumFractionDigits: digits, maximumFractionDigits: digits }))

const windLines = computed<ChartLine[]>(() => [
  { name: 'gust', color: '--ds-caution', value: (h) => kn(h.gustMs), dashed: true },
  { name: 'wind', color: '--ds-accent', value: (h) => kn(h.windMs), area: true },
])
const waveLines = computed<ChartLine[]>(() => [
  { name: 'swell', color: '--ds-go', value: (h) => h.swellH, dashed: true },
  { name: 'wave', color: '--ds-accent', value: (h) => h.waveH, area: true },
])
const L = WIND_BAND_LIMITS_KN
const bands: ChartBand[] = [
  { from: 0, to: L.calm, color: '--ds-go' },
  { from: L.calm, to: L.fresh, color: '--ds-caution' },
  { from: L.fresh, to: L.strong, color: '--ds-mark-orange' },
  { from: L.strong, to: 999, color: '--ds-stop' },
]

const when = computed(() => (sel.value ? new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).format(sel.value.t) : ''))
const fetched = computed(() => (store.data ? new Intl.DateTimeFormat(locale.value, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(store.data.fetchedAt) : ''))
const stale = computed(() => !!store.data && Date.now() - store.data.fetchedAt > 3 * HOUR_MS)
</script>

<template>
  <div class="flex flex-col gap-5">
    <p class="flex flex-col gap-0.5 text-sm text-ink-muted">
      <span class="eyebrow">{{ t(ui.forecastSource === 'gps' ? 'pointForecast.sourceGps' : 'pointForecast.sourceCursor') }}</span>
      <span class="numeric">{{ f.lat(lat) }} · {{ f.lon(lon) }}</span>
    </p>

    <div v-if="store.loading" class="flex flex-col gap-3" role="status" :aria-label="t('wind.loading')">
      <div class="skeleton h-24"></div>
      <div class="skeleton h-40"></div>
    </div>

    <div v-else-if="store.error" class="flex flex-col items-start gap-3" data-status="yellow">
      <p class="flex items-start gap-2 text-sm"><WifiOff class="mt-0.5 size-4 shrink-0 text-status" aria-hidden="true" />{{ t(`pointForecast.errors.${store.error}`) }}</p>
      <button type="button" class="btn-secondary" @click="store.retry()"><RotateCw class="size-4" aria-hidden="true" />{{ t('wind.retry') }}</button>
    </div>

    <template v-else-if="store.data && sel">
      <!-- Lecturas de la hora elegida -->
      <div class="readout gap-2.5">
        <span class="readout-label first-letter:uppercase">{{ when }}</span>
        <div class="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <div class="flex flex-col gap-0.5">
            <span class="eyebrow flex items-center gap-1"><Wind class="size-3" aria-hidden="true" />{{ t('pointForecast.wind') }}</span>
            <span class="numeric text-lg leading-tight">{{ num(kn(sel.windMs)) }} <span class="text-xs text-ink-subtle">{{ t('units.kn') }}</span></span>
            <span class="numeric text-xs text-ink-muted">{{ dir(sel.windDir) }}</span>
            <span v-if="sel.windMs != null" class="text-xs text-ink-muted">{{ t('wind.beaufortN', { n: beaufortForce(sel.windMs) }) }} · {{ t(`wind.beaufort.${beaufortForce(sel.windMs)}`) }}</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class="eyebrow">{{ t('pointForecast.gusts') }}</span>
            <span class="numeric text-lg leading-tight">{{ num(kn(sel.gustMs)) }} <span class="text-xs text-ink-subtle">{{ t('units.kn') }}</span></span>
          </div>
          <template v-if="store.data.hasWaves">
            <div class="flex flex-col gap-0.5">
              <span class="eyebrow flex items-center gap-1"><Waves class="size-3" aria-hidden="true" />{{ t('pointForecast.waves') }}</span>
              <span class="numeric text-lg leading-tight">{{ num(sel.waveH, 1) }} <span class="text-xs text-ink-subtle">m</span></span>
              <span class="numeric text-xs text-ink-muted">{{ num(sel.waveT) }} s · {{ dir(sel.waveDir) }}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="eyebrow">{{ t('pointForecast.swell') }}</span>
              <span class="numeric text-lg leading-tight">{{ num(sel.swellH, 1) }} <span class="text-xs text-ink-subtle">m</span></span>
              <span class="numeric text-xs text-ink-muted">{{ num(sel.swellT) }} s · {{ dir(sel.swellDir) }}</span>
            </div>
          </template>
        </div>
      </div>

      <section class="flex flex-col gap-1.5">
        <h3 class="eyebrow">{{ t('pointForecast.windChart') }}</h3>
        <HourlyChart v-model:selected="selected" :hours="hours" :lines="windLines" :bands="bands" :min-max="20" unit="kn" :now-ms="now" :label="t('pointForecast.windChart')" />
        <p class="text-caption flex gap-3">
          <span class="flex items-center gap-1.5"><span class="h-0.5 w-4 rounded bg-accent"></span>{{ t('pointForecast.wind') }}</span>
          <span class="flex items-center gap-1.5"><span class="h-0.5 w-4 rounded border-t-2 border-dashed border-caution"></span>{{ t('pointForecast.gusts') }}</span>
        </p>
      </section>

      <section v-if="store.data.hasWaves" class="flex flex-col gap-1.5">
        <h3 class="eyebrow">{{ t('pointForecast.waveChart') }}</h3>
        <HourlyChart v-model:selected="selected" :hours="hours" :lines="waveLines" :min-max="2" unit="m" :now-ms="now" :label="t('pointForecast.waveChart')" />
        <p class="text-caption flex gap-3">
          <span class="flex items-center gap-1.5"><span class="h-0.5 w-4 rounded bg-accent"></span>{{ t('pointForecast.waves') }}</span>
          <span class="flex items-center gap-1.5"><span class="h-0.5 w-4 rounded border-t-2 border-dashed border-go"></span>{{ t('pointForecast.swell') }}</span>
        </p>
      </section>
      <p v-else class="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-secondary">{{ t('pointForecast.noWaves') }}</p>

      <p class="text-[0.68rem] text-ink-subtle">{{ t('wind.source') }} · {{ t(stale ? 'wind.updatedOld' : 'wind.updated', { time: fetched }) }}</p>
    </template>
  </div>
</template>
