<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Construction, Map as MapIcon } from '@lucide/vue'

/** Pestaña Mapa. Fase 0: marcador de lugar; el mapa llega en la fase 3. */
const { t } = useI18n()

/** Muestra de los colores de los grupos de capas base (tokens del tema). */
const layers = [
  'bg-layer-coast',
  'bg-layer-territorial',
  'bg-layer-eez',
  'bg-layer-zcp',
  'bg-layer-crab',
  'bg-layer-shrimp',
]
</script>

<template>
  <section class="card card-reveal flex min-h-[60dvh] flex-col items-center justify-center gap-4 p-8 text-center">
    <span class="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-ink-subtle">
      <MapIcon class="size-7" aria-hidden="true" />
    </span>
    <h2 class="display text-3xl">{{ t('map.title') }}</h2>
    <p class="flex max-w-md items-start gap-2 text-left text-sm text-secondary">
      <Construction class="mt-0.5 size-4 shrink-0 text-caution" aria-hidden="true" />
      {{ t('map.pending') }}
    </p>
    <div class="flex gap-1.5" aria-hidden="true">
      <span v-for="c in layers" :key="c" class="h-1.5 w-8 rounded-full" :class="c"></span>
    </div>
  </section>
</template>
