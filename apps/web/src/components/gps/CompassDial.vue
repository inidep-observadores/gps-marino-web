<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { cardinal16 } from '@gpsm/shared'
import { polar, shortestRotation } from '@/logic/geometry'

/**
 * Rosa de los vientos con aguja de rumbo: marcas cada 5° (más largas cada 10° y 30°), puntos cardinales y el rumbo
 * en una placa central. La aguja gira por el camino más corto (de 350° a 10° no da la vuelta entera).
 * Sin rumbo (parado o sin dato) la aguja se atenúa y la placa muestra guiones.
 */
const props = defineProps<{ courseDeg: number | null; value: string; label: string }>()

const { t } = useI18n()
const C = 100
const R = 88

const rotation = ref(props.courseDeg ?? 0)
watch(
  () => props.courseDeg,
  (c) => {
    if (c != null) rotation.value = shortestRotation(rotation.value, c)
  },
)

const ticks = Array.from({ length: 72 }, (_, i) => {
  const deg = i * 5
  const len = deg % 30 === 0 ? 9 : deg % 10 === 0 ? 5.5 : 3
  const a = polar(C, C, R, deg)
  const b = polar(C, C, R - len, deg)
  return { deg, major: deg % 30 === 0, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
})
const cardinals = computed(() =>
  [
    { deg: 0, text: 'N', north: true },
    { deg: 90, text: 'E', north: false },
    { deg: 180, text: 'S', north: false },
    { deg: 270, text: t('units.west'), north: false },
  ].map((c) => {
    const p = polar(C, C, R - 20, c.deg)
    return { ...c, x: p.x, y: p.y + 3.5 }
  }),
)
const cardinal = computed(() => (props.courseDeg == null ? '' : cardinal16(props.courseDeg, t('units.west'))))
const aria = computed(() => `${props.label}: ${props.value} ${cardinal.value}`.trim())
</script>

<template>
  <figure class="flex w-full flex-col items-center select-none">
    <div class="relative aspect-square w-full max-w-[13.5rem]">
      <svg viewBox="0 0 200 200" class="size-full overflow-visible" role="img" :aria-label="aria">
        <circle :cx="C" :cy="C" :r="R + 4" class="fill-none stroke-surface-3" stroke-width="2" />
        <line v-for="tk in ticks" :key="tk.deg" :x1="tk.x1" :y1="tk.y1" :x2="tk.x2" :y2="tk.y2" class="stroke-ink-subtle" :stroke-width="tk.major ? 1.6 : 1" stroke-linecap="round" opacity="0.7" />
        <text
          v-for="c in cardinals"
          :key="c.deg"
          :x="c.x"
          :y="c.y"
          text-anchor="middle"
          class="font-mono text-[11px] font-semibold"
          :class="c.north ? 'fill-stop' : 'fill-ink-muted'"
        >
          {{ c.text }}
        </text>

        <!-- Aguja: punta del color de acento hacia el rumbo y cola gris. -->
        <g class="needle" :class="{ 'opacity-25': courseDeg == null }" :style="{ transform: `rotate(${rotation}deg)` }">
          <path d="M100 22 L108.5 104 L100 95 L91.5 104 Z" class="fill-accent" />
          <path d="M100 178 L95.5 106 L104.5 106 Z" class="fill-surface-3" />
        </g>
        <circle :cx="C" :cy="C" r="25" class="fill-surface stroke-line-strong" stroke-width="1.5" />
        <text :x="C" :y="C + 1" text-anchor="middle" class="fill-ink font-mono text-[15px] font-medium">{{ value }}</text>
        <text :x="C" :y="C + 13" text-anchor="middle" class="fill-ink-subtle font-mono text-[8px] font-semibold">{{ cardinal }}</text>
      </svg>
    </div>
    <figcaption class="eyebrow -mt-1 text-center">{{ label }}</figcaption>
  </figure>
</template>

<style scoped>
.needle {
  transform-origin: 100px 100px;
  transition:
    transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.3s;
}
@media (prefers-reduced-motion: reduce) {
  .needle {
    transition: none;
  }
}
</style>
