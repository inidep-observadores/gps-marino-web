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
  <section v-if="player.track" class="map-card" :aria-label="t('tracks.title')">
    <!-- Cabecera: nombre, hora de la derrota y cerrar -->
    <div class="flex items-center gap-2.5">
      <RouteIcon class="size-5 shrink-0 text-accent" aria-hidden="true" />
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="truncate text-[0.8rem] leading-tight font-semibold">{{ player.track.name }}</span>
        <span class="numeric flex flex-wrap gap-x-2 text-[0.72rem] leading-tight text-ink-muted">
          <span class="capitalize">{{ stamp }}</span>
          <span v-if="pos">{{ f.speed(pos.speedKn) }} {{ t('units.kn') }} · {{ f.bearing(pos.courseDeg) }}</span>
          <span>{{ t('tracks.player.distance', { done: f.distance(pos?.distanceNm ?? 0), total: f.distance(player.totalNm), unit: t('units.nm') }) }}</span>
        </span>
      </div>
      <button type="button" class="icon-btn" :aria-label="t('tracks.player.close')" :title="t('tracks.player.close')" @click="player.close()"><X class="size-5" /></button>
    </div>

    <!-- Deslizador: mueve el buque a cualquier punto de la derrota -->
    <input
      type="range"
      class="wind-slider w-full"
      min="0"
      :max="SLIDER_MAX"
      step="1"
      :value="sliderValue"
      :aria-label="t('tracks.player.position')"
      :aria-valuetext="stamp"
      @input="onSlide"
    />

    <div class="flex items-center gap-1.5">
      <button
        type="button"
        class="icon-btn bg-accent text-accent-ink hover:bg-accent hover:text-accent-ink"
        :aria-label="player.playing ? t('tracks.player.pause') : player.atEnd ? t('tracks.player.restart') : t('tracks.player.play')"
        @click="player.toggle()"
      >
        <Pause v-if="player.playing" class="size-5" />
        <RotateCcw v-else-if="player.atEnd" class="size-5" />
        <Play v-else class="size-5" />
      </button>

      <!-- Velocidad: veces el tiempo real -->
      <div class="flex items-center" role="group" :aria-label="t('tracks.player.speed')">
        <button type="button" class="icon-btn" :disabled="!canSlower" :aria-label="t('tracks.player.slower')" @click="player.stepSpeed(-1)"><Minus class="size-5" /></button>
        <span class="numeric min-w-14 text-center text-sm font-semibold" aria-live="polite">{{ speedLabel }}</span>
        <button type="button" class="icon-btn" :disabled="!canFaster" :aria-label="t('tracks.player.faster')" @click="player.stepSpeed(1)"><Plus class="size-5" /></button>
      </div>

            <button
        type="button"
        class="icon-btn ml-auto"
        :aria-pressed="player.follow"
        :aria-label="player.follow ? t('tracks.player.unfollow') : t('tracks.player.follow')"
        :title="player.follow ? t('tracks.player.unfollow') : t('tracks.player.follow')"
        @click="player.follow = !player.follow"
      >
        <Crosshair class="size-5" :class="{ 'text-accent': player.follow }" />
      </button>
    </div>
  </section>
</template>
