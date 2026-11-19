<script setup lang="ts" generic="T extends string">
import type { Component } from 'vue'

export interface SegmentOption<V extends string> {
  value: V
  label: string
  icon?: Component
}

/** Grupo de opciones excluyentes (role="radiogroup"), navegable con flechas. */
const model = defineModel<T>({ required: true })
const props = defineProps<{ options: SegmentOption<T>[]; label: string }>()

function move(step: number, e: KeyboardEvent) {
  const i = props.options.findIndex((o) => o.value === model.value)
  const next = props.options[(i + step + props.options.length) % props.options.length]!
  model.value = next.value
  const group = (e.currentTarget as HTMLElement).parentElement
  ;(group?.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus()
}
</script>

<template>
  <div class="segmented" role="radiogroup" :aria-label="label">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      class="segmented-item"
      :data-value="o.value"
      :aria-checked="o.value === model"
      :tabindex="o.value === model ? 0 : -1"
      @click="model = o.value"
      @keydown.right.prevent="move(1, $event)"
      @keydown.left.prevent="move(-1, $event)"
    >
      <component :is="o.icon" v-if="o.icon" class="size-4" aria-hidden="true" />
      {{ o.label }}
    </button>
  </div>
</template>
