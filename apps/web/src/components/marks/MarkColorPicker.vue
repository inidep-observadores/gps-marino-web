<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { MARK_COLORS, type MarkColor } from '@gpsm/shared'
import { MARK_COLOR_CLASS } from './markIcons'

/** Colores de marca (radiogroup con muestra + nombre). */
const model = defineModel<MarkColor>({ required: true })
defineProps<{ label: string }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="label">
    <button
      v-for="c in MARK_COLORS"
      :key="c"
      type="button"
      role="radio"
      class="chip"
      :aria-checked="model === c"
      :aria-pressed="model === c"
      @click="model = c"
    >
      <span class="size-3 rounded-full bg-current" :class="MARK_COLOR_CLASS[c]" aria-hidden="true"></span>
      {{ t(`marks.colors.${c}`) }}
    </button>
  </div>
</template>
