<script setup lang="ts">
import type { Status } from '@/types'

/** Estado con color y texto (nunca solo color). */
defineProps<{ status: Status; label: string }>()
</script>

<template>
  <span class="status-pill" :data-status="status">
    <span class="status-dot" aria-hidden="true"></span>
    {{ label }}
  </span>
</template>
