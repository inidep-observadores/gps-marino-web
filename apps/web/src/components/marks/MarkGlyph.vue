<script setup lang="ts">
import { computed } from 'vue'
import type { MarkColor, MarkIcon } from '@gpsm/shared'
import { MARK_COLOR_CLASS, MARK_ICON_DEFS } from './markIcons'

/** Ícono de marca de un waypoint (SVG de Font Awesome, sin la librería de componentes). Decorativo: el texto va aparte. */
const props = defineProps<{ icon: MarkIcon; color?: MarkColor }>()

const def = computed(() => MARK_ICON_DEFS[props.icon].icon)
const paths = computed(() => {
  const p = def.value[4]
  return Array.isArray(p) ? p : [p]
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${def[0]} ${def[1]}`"
    class="inline-block size-[1em] shrink-0"
    :class="color ? MARK_COLOR_CLASS[color] : undefined"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>
