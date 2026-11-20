<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Crosshair, Minus, Pause, Play, Plus, RotateCcw, Route as RouteIcon, X } from '@lucide/vue'
import { useFormat } from '@/composables/useFormat'
import { useTrackPlayerStore } from '@/stores/trackPlayer'

/**
 * Reproductor de la derrota activa: hora y datos del buque, deslizador para moverlo a cualquier punto, reproducir y pausar,
 * velocidad (veces el tiempo real) y seguir al buque. Todo con botones grandes, al alcance del pulgar.
 */
const { t, locale } = useI18n()
const f = useFormat()
const player = useTrackPlayerStore()

const stamp = computed(() =>
  new Intl.DateTimeFormat(locale.value, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(player.t).replace(/\./g, ''),
)
const pos = computed(() => player.position)
/** Slider en milésimas: suficiente resolución para derrotas largas sin pesar. */
const SLIDER_MAX = 1000
const sliderValue = computed(() => Math.round(player.progress * SLIDER_MAX))
const onSlide = (e: Event) => player.seek(Number((e.target as HTMLInputElement).value) / SLIDER_MAX)
const speedLabel = computed(() => `×${new Intl.NumberFormat(locale.value).format(player.speed)}`)
const canSlower = computed(() => player.speed > 1)
const canFaster = computed(() => player.speed < 86400)
</script>

<template>
  <section v-if="player.track" class="map-card gap-1.5! p-2.5!" :aria-label="t('tracks.title')">
    <!-- Fila 1: reproducir, nombre y hora de la derrota, seguir y cerrar -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="icon-btn size-10! shrink-0 bg-accent text-accent-ink hover:bg-accent hover:text-accent-ink"
        :aria-label="player.playing ? t('tracks.player.pause') : player.atEnd ? t('tracks.player.restart') : t('tracks.player.play')"
        @click="player.toggle()"
      >
        <Pause v-if="player.playing" class="size-5" />
        <RotateCcw v-else-if="player.atEnd" class="size-5" />
        <Play v-else class="size-5" />
      </button>
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-[0.8rem] leading-tight font-semibold">{{ player.track.name }}</span>
        <span class="numeric truncate text-[0.72rem] leading-tight text-ink-muted capitalize">{{ stamp }}</span>
      </div>
      <button
        type="button"
        class="icon-btn size-9!"
        :aria-pressed="player.follow"
        :aria-label="player.follow ? t('tracks.player.unfollow') : t('tracks.player.follow')"
        :title="player.follow ? t('tracks.player.unfollow') : t('tracks.player.follow')"
        @click="player.follow = !player.follow"
      >
        <Crosshair class="size-5" :class="{ 'text-accent': player.follow }" />
      </button>
      <button type="button" class="icon-btn size-9!" :aria-label="t('tracks.player.close')" :title="t('tracks.player.close')" @click="player.close()"><X class="size-5" /></button>
    </div>

    <!-- Fila 2: posición, velocidad y rumbo del buque en este instante (una línea, con contraste) -->
    <p v-if="pos" class="numeric flex flex-wrap items-baseline justify-center gap-x-3 gap-y-0 text-center text-[0.9rem] leading-snug font-semibold text-ink" aria-live="off">
      <span>{{ f.latCompact(pos.lat) }}</span>
      <span>{{ f.lonCompact(pos.lon) }}</span>
      <span class="font-medium">{{ f.speed(pos.speedKn) }}<span class="ml-0.5 text-xs font-normal text-ink-muted">{{ t('units.kn') }}</span></span>
      <span class="font-medium">{{ f.bearing(pos.courseDeg) }}</span>
    </p>

    <!-- Fila 3: deslizador y velocidad de reproducción -->
    <div class="flex items-center gap-1">
      <input
        type="range"
        class="wind-slider min-w-0 flex-1"
        min="0"
        :max="SLIDER_MAX"
        step="1"
        :value="sliderValue"
        :aria-label="t('tracks.player.position')"
        :aria-valuetext="stamp"
        @input="onSlide"
      />
      <div class="flex shrink-0 items-center" role="group" :aria-label="t('tracks.player.speed')">
        <button type="button" class="icon-btn size-9!" :disabled="!canSlower" :aria-label="t('tracks.player.slower')" @click="player.stepSpeed(-1)"><Minus class="size-4" /></button>
        <span class="numeric min-w-12 text-center text-[0.8rem] font-semibold" aria-live="polite">{{ speedLabel }}</span>
        <button type="button" class="icon-btn size-9!" :disabled="!canFaster" :aria-label="t('tracks.player.faster')" @click="player.stepSpeed(1)"><Plus class="size-4" /></button>
      </div>
    </div>
  </section>
</template>
