<script setup lang="ts">
import { useId } from 'vue'

/** Fila con etiqueta (y ayuda opcional) e interruptor accesible (`role="switch"`). */
const model = defineModel<boolean>({ required: true })
defineProps<{ label: string; hint?: string; disabled?: boolean }>()
const id = useId()
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <span class="flex min-w-0 flex-col gap-0.5">
      <label :for="id" class="text-sm font-medium text-ink">{{ label }}</label>
      <span v-if="hint" class="text-caption">{{ hint }}</span>
    </span>
    <button
      :id="id"
      type="button"
      role="switch"
      class="switch"
      :aria-checked="model"
      :disabled="disabled"
      @click="model = !model"
    ></button>
  </div>
</template>
