<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Waves, Wind } from '@lucide/vue'
import { BEAUFORT_SCALE, beaufortFromKnots, beaufortKmh, beaufortTone, parseNumber, type BeaufortLevel, type BeaufortTone } from '@gpsm/shared'
import SeaScene from '@/components/beaufort/SeaScene.vue'

/**
 * Referencia visual de la escala de Beaufort (fuerza 0–12): ilustración del mar, nombre, velocidad del viento en nudos y
 * km/h, altura de ola y descripción del estado del mar. Toque en una fuerza (cinta o lista) o escribir una velocidad.
 */
const { t, locale } = useI18n()

const selected = ref(4)
const level = computed<BeaufortLevel>(() => BEAUFORT_SCALE[selected.value]!)

/** Clases por tono (completas, para que Tailwind las vea). */
const TONE: Record<BeaufortTone, { bg: string; text: string; soft: string; ring: string }> = {
  go: { bg: 'bg-go', text: 'text-go', soft: 'bg-go/12', ring: 'ring-go' },
  caution: { bg: 'bg-caution', text: 'text-caution', soft: 'bg-caution/12', ring: 'ring-caution' },
  orange: { bg: 'bg-mark-orange', text: 'text-mark-orange', soft: 'bg-mark-orange/12', ring: 'ring-mark-orange' },
  stop: { bg: 'bg-stop', text: 'text-stop', soft: 'bg-stop/12', ring: 'ring-stop' },
}
const tone = (force: number) => TONE[beaufortTone(force)]

const num = (v: number) => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(v)
const range = (l: BeaufortLevel, unit: 'kn' | 'kmh') => {
  const kn = l.maxKn == null ? null : l.maxKn
  const [min, max] = unit === 'kn' ? [l.minKn, kn] : [beaufortKmh(l).min, beaufortKmh(l).max]
  if (max == null) return t('beaufort.orMore', { n: min })
  return min === max ? `${min}` : `${min}–${max}`
}
const name = (force: number) => t(`wind.beaufort.${force}`)
const waves = (l: BeaufortLevel) => (l.waveM === 0 ? '—' : `${num(l.waveM)} ${t('units.m')}`)
const wavesMax = (l: BeaufortLevel) => (l.waveMaxM == null ? t('beaufort.orMore', { n: num(l.waveM) }) : `${num(l.waveMaxM)} ${t('units.m')}`)

// Buscar por velocidad: escribir nudos elige la fuerza.
const speedText = ref('')
const speedInvalid = ref(false)
function onSpeed(value: string) {
  speedText.value = value
  if (!value.trim()) {
    speedInvalid.value = false
    return
  }
  const v = parseNumber(value)
  speedInvalid.value = v == null || v < 0
  if (!speedInvalid.value) selected.value = beaufortFromKnots(v as number)
}

const hero = ref<HTMLElement | null>(null)
/** Tocar una fila de la lista: en el teléfono el detalle queda arriba, así que se sube hasta él. */
function pickFromList(force: number) {
  selected.value = force
  if (!window.matchMedia('(min-width: 1024px)').matches) hero.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="dashboard mx-auto max-w-5xl">
    <div class="dashboard-aside lg:sticky lg:top-20 lg:col-span-5">
      <!-- Detalle de la fuerza elegida -->
      <section ref="hero" class="card card-reveal overflow-hidden scroll-mt-20" :aria-live="'polite'">
        <SeaScene :force="selected" />
        <div class="card-body flex flex-col gap-4">
          <div class="flex items-center gap-4">
            <span class="numeric flex size-16 shrink-0 flex-col items-center justify-center rounded-2xl text-canvas" :class="tone(selected).bg">
              <span class="text-[0.55rem] font-semibold tracking-[0.14em] uppercase opacity-80">Bft</span>
              <span class="text-3xl leading-none font-semibold">{{ selected }}</span>
            </span>
            <div class="min-w-0">
              <p class="eyebrow">{{ t('beaufort.force', { n: selected }) }}</p>
              <h2 class="display text-3xl text-balance">{{ name(selected) }}</h2>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <div class="readout">
              <span class="readout-label"><Wind class="size-3.5" aria-hidden="true" />{{ t('beaufort.wind') }}</span>
              <span class="readout-value">{{ range(level, 'kn') }}<span class="readout-unit">{{ t('units.kn') }}</span></span>
              <span class="readout-meta numeric">{{ range(level, 'kmh') }} km/h</span>
            </div>
            <div class="readout">
              <span class="readout-label"><Waves class="size-3.5" aria-hidden="true" />{{ t('beaufort.waves') }}</span>
              <span class="readout-value">{{ waves(level) }}</span>
              <span class="readout-meta numeric">{{ t('beaufort.max') }} {{ wavesMax(level) }}</span>
            </div>
          </div>

          <div class="rounded-2xl p-3.5" :class="tone(selected).soft">
            <p class="eyebrow mb-1.5" :class="tone(selected).text">{{ t('beaufort.seaState') }}</p>
            <p class="text-sm leading-relaxed text-ink">{{ t(`beaufort.sea.${selected}`) }}</p>
          </div>
        </div>
      </section>

      <!-- Cinta de fuerzas y buscador por velocidad -->
      <section class="card card-body flex flex-col gap-3.5">
        <div class="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1" role="radiogroup" :aria-label="t('beaufort.scale')">
          <button
            v-for="l in BEAUFORT_SCALE"
            :key="l.force"
            type="button"
            role="radio"
            :aria-checked="selected === l.force"
            :aria-label="t('beaufort.pick', { n: l.force, name: name(l.force) })"
            class="numeric flex h-11 flex-col items-center justify-end gap-1 rounded-lg border border-line pb-1 text-xs font-semibold text-ink-muted transition"
            :class="selected === l.force ? `bg-surface-2 text-ink ring-2 ${tone(l.force).ring}` : 'hover:bg-surface-2'"
            @click="selected = l.force"
          >
            {{ l.force }}
            <span class="h-1 w-4/5 rounded-full" :class="tone(l.force).bg"></span>
          </button>
        </div>
        <label class="field">
          <span class="field-label flex items-baseline justify-between"><span>{{ t('beaufort.search') }}</span><span class="numeric text-ink-subtle">{{ t('units.kn') }}</span></span>
          <input class="input numeric" type="text" inputmode="decimal" autocomplete="off" placeholder="0" :value="speedText" :aria-invalid="speedInvalid" @input="onSpeed(($event.target as HTMLInputElement).value)" />
          <span class="text-caption">{{ t('beaufort.searchHint') }}</span>
        </label>
      </section>
    </div>

    <!-- Tabla completa -->
    <div class="dashboard-main lg:col-span-7">
      <p class="text-sm text-secondary">{{ t('beaufort.intro') }}</p>
      <ul class="list">
        <li v-for="l in BEAUFORT_SCALE" :key="l.force">
          <button type="button" class="list-row" :aria-current="selected === l.force ? 'true' : undefined" @click="pickFromList(l.force)">
            <span class="numeric flex size-10 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-canvas" :class="tone(l.force).bg">{{ l.force }}</span>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="truncate text-sm font-semibold">{{ name(l.force) }}</span>
              <span class="numeric text-xs text-ink-muted">{{ range(l, 'kn') }} {{ t('units.kn') }} · {{ range(l, 'kmh') }} km/h</span>
            </span>
            <span class="numeric flex shrink-0 flex-col items-end text-xs text-ink-muted">
              <span class="flex items-center gap-1"><Waves class="size-3.5 text-ink-subtle" aria-hidden="true" />{{ waves(l) }}</span>
            </span>
          </button>
        </li>
      </ul>
      <p class="text-caption">{{ t('beaufort.note') }}</p>
    </div>
  </div>
</template>
