<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, ChevronUp, Pause, Play, RotateCw, SkipBack, SkipForward, Wind, WifiOff } from '@lucide/vue'
import { MS_TO_KN, WIND_BAND_LIMITS_KN, cardinal16 } from '@gpsm/shared'
import { localDayKey } from '@/logic/windTime'
import { useWindStore } from '@/stores/wind'

/**
 * Selector de fecha y hora del pronóstico de viento (idea de `WindTimeControl` de Drone Forecast): hora grande, días,
 * deslizador de horas, reproducir ("Ahora" vuelve a la hora actual) y la leyenda de colores en nudos.
 * Se muestra mientras la capa de viento está visible. Plegable: en el teléfono deja más mapa a la vista.
 */
const { t, locale } = useI18n()
const wind = useWindStore()
const open = ref(true)

const label = computed(() =>
  new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).format(wind.hourMs),
)
const time = computed(() => new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', hour12: false }).format(wind.hourMs))
const dayLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y!, m! - 1, d!)
  const today = localDayKey(Date.now()) === key
  return today ? t('wind.today') : new Intl.DateTimeFormat(locale.value, { weekday: 'short', day: 'numeric' }).format(date)
}
const currentDay = computed(() => localDayKey(wind.hourMs))

const west = computed(() => t('units.west'))
const center = computed(() => {
  const w = wind.atCenter
  return w ? `${Math.round(w.speed * MS_TO_KN)} ${t('units.kn')} · ${cardinal16(w.directionFrom, west.value)}` : null
})
const updated = computed(() =>
  wind.grid ? new Intl.DateTimeFormat(locale.value, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(wind.grid.fetchedAt) : '',
)

const LEGEND = [
  { band: 'calm', cls: 'bg-go', text: `< ${WIND_BAND_LIMITS_KN.calm}` },
  { band: 'fresh', cls: 'bg-caution', text: `${WIND_BAND_LIMITS_KN.calm}–${WIND_BAND_LIMITS_KN.fresh}` },
  { band: 'strong', cls: 'bg-mark-orange', text: `${WIND_BAND_LIMITS_KN.fresh}–${WIND_BAND_LIMITS_KN.strong}` },
  { band: 'gale', cls: 'bg-stop', text: `> ${WIND_BAND_LIMITS_KN.strong}` },
] as const

const onSlide = (e: Event) => wind.setIndex(Number((e.target as HTMLInputElement).value))
</script>

<template>
  <section class="map-card" :aria-label="t('wind.title')">
    <!-- Cabecera: hora elegida y plegar -->
    <div class="flex items-center gap-2.5">
      <Wind class="size-5 shrink-0 text-accent" aria-hidden="true" />
      <button type="button" class="flex min-w-0 flex-1 flex-col text-left" :aria-expanded="open" @click="open = !open">
        <span class="numeric text-lg leading-tight font-medium">{{ time }}</span>
        <span class="text-caption truncate first-letter:uppercase">{{ label }}</span>
      </button>
      <button v-if="!wind.isNow && wind.range" type="button" class="btn-secondary h-9 px-3 text-sm" @click="wind.goNow()">{{ t('wind.now') }}</button>
      <button type="button" class="icon-btn" :aria-label="open ? t('wind.collapse') : t('wind.expand')" @click="open = !open">
        <ChevronDown v-if="open" class="size-5" />
        <ChevronUp v-else class="size-5" />
      </button>
    </div>

    <template v-if="open">
      <p v-if="!wind.range && !wind.loading" class="flex items-start gap-2 text-sm text-secondary" role="status">
        <WifiOff class="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
        {{ wind.error ? t(`wind.errors.${wind.error}`) : t('wind.noData') }}
      </p>
      <p v-else-if="!wind.range" class="text-caption" role="status">{{ t('wind.loading') }}</p>

      <template v-else>
        <!-- Días -->
        <div class="scroll-row" role="tablist" :aria-label="t('wind.day')">
          <button
            v-for="d in wind.days"
            :key="d.key"
            type="button"
            role="tab"
            class="chip capitalize"
            :aria-selected="currentDay === d.key"
            @click="wind.setDay(d)"
          >
            {{ dayLabel(d.key) }}
          </button>
        </div>

        <!-- Horas -->
        <div class="flex items-center gap-1.5">
          <button type="button" class="icon-btn" :aria-label="t('wind.prev')" :disabled="wind.index <= 0" @click="wind.step(-1)"><SkipBack class="size-5" /></button>
          <button type="button" class="icon-btn bg-accent text-accent-ink hover:bg-accent hover:text-accent-ink" :aria-label="wind.playing ? t('wind.pause') : t('wind.play')" @click="wind.togglePlay()">
            <Pause v-if="wind.playing" class="size-5" />
            <Play v-else class="size-5" />
          </button>
          <button type="button" class="icon-btn" :aria-label="t('wind.next')" :disabled="wind.index >= wind.count - 1" @click="wind.step(1)"><SkipForward class="size-5" /></button>
          <input
            type="range"
            class="wind-slider min-w-0 flex-1"
            min="0"
            :max="Math.max(0, wind.count - 1)"
            step="1"
            :value="wind.index"
            :aria-label="t('wind.hour')"
            :aria-valuetext="label"
            @input="onSlide"
          />
        </div>

        <!-- Leyenda y viento en el centro del mapa -->
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          <ul class="flex items-center gap-3 text-[0.68rem] text-ink-muted" :aria-label="t('wind.legend')">
            <li v-for="l in LEGEND" :key="l.band" class="flex items-center gap-1.5">
              <span class="h-1.5 w-3.5 rounded-full" :class="l.cls" aria-hidden="true"></span><span class="numeric">{{ l.text }}</span>
            </li>
            <li class="text-ink-subtle">{{ t('units.kn') }}</li>
          </ul>
          <p v-if="center" class="numeric text-xs text-ink-muted"><span class="text-ink-subtle">{{ t('wind.atCenter') }}</span> {{ center }}</p>
        </div>

        <p v-if="wind.error" class="flex items-center justify-between gap-2 text-xs text-caution" data-status="yellow">
          <span class="flex items-center gap-1.5"><WifiOff class="size-3.5 shrink-0" aria-hidden="true" />{{ t(`wind.errors.${wind.error}`) }}</span>
          <button type="button" class="font-semibold text-accent" @click="wind.retry()"><RotateCw class="mr-1 inline size-3" aria-hidden="true" />{{ t('wind.retry') }}</button>
        </p>
        <p class="text-[0.65rem] text-ink-subtle">
          {{ t('wind.source') }} · {{ t(wind.stale ? 'wind.updatedOld' : 'wind.updated', { time: updated }) }}
        </p>
      </template>
    </template>
  </section>
</template>
