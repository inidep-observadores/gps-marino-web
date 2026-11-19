<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { beaufortFromKnots, beaufortTone, type BeaufortTone } from '@gpsm/shared'

/** Insignia de la fuerza Beaufort de una velocidad en nudos: número sobre el color de la fuerza (verde a rojo, como el mapa de viento). */
const props = defineProps<{ kn: number }>()
const { t } = useI18n()

const force = computed(() => beaufortFromKnots(props.kn))
const BG: Record<BeaufortTone, string> = { go: 'bg-go', caution: 'bg-caution', orange: 'bg-mark-orange', stop: 'bg-stop' }
const label = computed(() => `${t('wind.beaufortN', { n: force.value })} · ${t(`wind.beaufort.${force.value}`)}`)
</script>

<template>
  <span class="numeric flex size-11 shrink-0 flex-col items-center justify-center rounded-xl text-canvas" :class="BG[beaufortTone(force)]" role="img" :aria-label="label" :title="label">
    <span class="text-[0.5rem] leading-none font-semibold tracking-[0.14em] uppercase opacity-80">Bft</span>
    <span class="text-lg leading-none font-semibold">{{ force }}</span>
  </span>
</template>
