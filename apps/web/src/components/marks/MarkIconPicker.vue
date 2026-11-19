<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { MARK_ICONS, type MarkColor, type MarkIcon } from '@gpsm/shared'
import MarkGlyph from './MarkGlyph.vue'

/** Grilla de los 35 íconos de marca (radiogroup). El color elegido se previsualiza en el ícono marcado. */
const model = defineModel<MarkIcon>({ required: true })
defineProps<{ color: MarkColor; label: string }>()
const { t } = useI18n()
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5" role="radiogroup" :aria-label="label">
    <button
      v-for="icon in MARK_ICONS"
      :key="icon"
      type="button"
      role="radio"
      :aria-checked="model === icon"
      :aria-label="t(`marks.icons.${icon}`)"
      :title="t(`marks.icons.${icon}`)"
      class="flex aspect-square items-center justify-center rounded-xl border text-lg transition"
      :class="
        model === icon
          ? 'border-accent bg-accent/10 ring-2 ring-accent/30'
          : 'border-line bg-surface-2/60 text-ink-muted hover:border-line-strong hover:text-ink'
      "
      @click="model = icon"
    >
      <MarkGlyph :icon="icon" :color="model === icon ? color : undefined" />
    </button>
  </div>
</template>
