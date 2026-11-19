<script setup lang="ts">
import { computed } from 'vue'
import { arcPath, niceSpeedMax, polar, valueToAngle } from '@/logic/geometry'

/**
 * Velocímetro en arco (misma construcción que el anemómetro de Drone Forecast): escala de 260° con un fondo de escala
 * que crece con la velocidad, arco con brillo, cabeza de aguja y marcas. El número va en el centro.
 */
const props = defineProps<{ speedKn: number | null; value: string; unit: string; label: string }>()

const START = -130
const END = 130
const C = 100
const R = 80
const WIDTH = 12

const max = computed(() => niceSpeedMax(props.speedKn))
const angle = computed(() => valueToAngle(props.speedKn ?? 0, max.value, START, END))
const track = arcPath(C, C, R, START, END)
const valueArc = computed(() => arcPath(C, C, R, START, Math.max(START + 0.5, angle.value)))
const head = computed(() => polar(C, C, R, angle.value))

/** Marcas menores (cada 1/10 del fondo de escala) y etiquetas en 0, mitad y fin. */
const ticks = computed(() =>
  Array.from({ length: 11 }, (_, i) => {
    const a = START + ((END - START) * i) / 10
    const major = i % 5 === 0
    const a1 = polar(C, C, R - WIDTH / 2 - 3, a)
    const a2 = polar(C, C, R - WIDTH / 2 - (major ? 8 : 5.5), a)
    return { i, major, x1: a1.x, y1: a1.y, x2: a2.x, y2: a2.y }
  }),
)
const labels = computed(() =>
  [0, 0.5, 1].map((k) => {
    const p = polar(C, C, R - WIDTH / 2 - 17, START + (END - START) * k)
    return { k, x: p.x, y: p.y + 3, text: String(Math.round(max.value * k * 10) / 10) }
  }),
)
const aria = computed(() => `${props.label}: ${props.value} ${props.unit}`)
</script>

<template>
  <figure class="flex w-full flex-col items-center select-none">
    <div class="relative aspect-square w-full max-w-[13.5rem]">
      <svg viewBox="0 0 200 200" class="size-full overflow-visible" role="img" :aria-label="aria">
        <defs>
          <filter id="speed-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>
        <path :d="track" class="fill-none stroke-surface-3" :stroke-width="WIDTH" stroke-linecap="round" />
        <path v-if="valueArc" :d="valueArc" class="fill-none stroke-accent opacity-50" :stroke-width="WIDTH" stroke-linecap="round" filter="url(#speed-glow)" />
        <path v-if="valueArc" :d="valueArc" class="gauge-value fill-none stroke-accent" :stroke-width="WIDTH" stroke-linecap="round" />
        <circle :cx="head.x" :cy="head.y" :r="WIDTH / 2 + 1.5" class="fill-surface stroke-accent" stroke-width="3.5" />
        <line v-for="t in ticks" :key="t.i" :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2" class="stroke-ink-subtle" :stroke-width="t.major ? 1.6 : 1" stroke-linecap="round" opacity="0.7" />
        <text v-for="l in labels" :key="l.k" :x="l.x" :y="l.y" text-anchor="middle" class="fill-ink-subtle font-mono text-[8px]">{{ l.text }}</text>
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center pt-1 text-center" aria-hidden="true">
        <span class="numeric text-[2.2rem] leading-none font-medium tracking-tight text-ink">{{ value }}</span>
        <span class="mt-1 text-[0.7rem] font-semibold text-ink-muted">{{ unit }}</span>
      </div>
    </div>
    <figcaption class="eyebrow -mt-1 text-center">{{ label }}</figcaption>
  </figure>
</template>

<style scoped>
.gauge-value {
  transition: d 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}
</style>
