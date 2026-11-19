<script setup lang="ts">
import { computed } from 'vue'
import { beaufortTone, type BeaufortTone } from '@gpsm/shared'
import { SCENE_H, SCENE_W, seaScene } from '@/logic/seaWaves'

/**
 * Ilustración del mar para una fuerza de Beaufort: cielo teñido con el color de la fuerza, rayas de viento, tres capas de
 * olas (más altas y picadas con la fuerza), corderitos de espuma y rociones. Las olas se mecen suavemente (no con
 * `prefers-reduced-motion`). Los colores salen de los tokens del tema.
 */
const props = defineProps<{ force: number }>()

const scene = computed(() => seaScene(props.force))
const TONE_VAR: Record<BeaufortTone, string> = {
  go: 'var(--ds-go)',
  caution: 'var(--ds-caution)',
  orange: 'var(--ds-mark-orange)',
  stop: 'var(--ds-stop)',
}
const tone = computed(() => TONE_VAR[beaufortTone(props.force)])
/** Mar más oscuro y cargado con el viento. */
const seaStyle = computed(() => ({ '--tone': tone.value, '--f': String(props.force) }))
</script>

<template>
  <svg :viewBox="`0 0 ${SCENE_W} ${SCENE_H}`" class="sea-scene block h-auto w-full" :style="seaStyle" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="sea-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style="stop-color: var(--ds-surface-2)" />
        <stop offset="1" style="stop-color: color-mix(in oklch, var(--tone) 24%, var(--ds-surface-2))" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#sea-sky)" />

    <!-- Rayas del viento -->
    <g class="stroke-ink-subtle" stroke-width="1.4" stroke-linecap="round" opacity="0.55">
      <line v-for="(s, i) in scene.streaks" :key="`w${i}`" :x1="s.x" :y1="s.y" :x2="s.x + s.len" :y2="s.y" />
    </g>

    <!-- Mar: tres capas -->
    <g class="sea-layers">
      <path class="sea-layer sea-back" :d="scene.layers[0]" />
      <path class="sea-layer sea-mid" :d="scene.layers[1]" />
      <path class="sea-layer sea-front" :d="scene.layers[2]" />
    </g>

    <!-- Espuma sobre las crestas y rociones -->
    <g fill="none" class="stroke-foam" stroke-width="1.8" stroke-linecap="round">
      <path v-for="(c, i) in scene.caps" :key="`c${i}`" :d="`M${c.x - c.w / 2},${c.y + 1.5} Q${c.x},${c.y - c.w * 0.35} ${c.x + c.w / 2},${c.y + 1.5}`" />
    </g>
    <g class="fill-foam" opacity="0.85">
      <circle v-for="(p, i) in scene.spray" :key="`s${i}`" :cx="p.x" :cy="p.y" :r="p.r" />
    </g>
  </svg>
</template>

<style scoped>
.sea-layer {
  transition: d 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
  animation: sea-bob 5s ease-in-out infinite alternate;
}
.sea-back {
  fill: color-mix(in oklch, var(--ds-accent) calc(34% - var(--f) * 1%), var(--ds-surface-2));
  animation-duration: 7s;
}
.sea-mid {
  fill: color-mix(in oklch, var(--ds-accent) calc(56% - var(--f) * 1.5%), var(--ds-canvas));
  animation-duration: 5.5s;
  animation-direction: alternate-reverse;
}
.sea-front {
  fill: color-mix(in oklch, var(--ds-accent) calc(74% - var(--f) * 2.5%), var(--ds-canvas));
  animation-duration: 4.2s;
}
@keyframes sea-bob {
  from {
    transform: translateY(-1.6px);
  }
  to {
    transform: translateY(1.6px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .sea-layer {
    animation: none;
  }
}
</style>
