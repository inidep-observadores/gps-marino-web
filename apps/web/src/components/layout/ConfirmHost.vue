<script setup lang="ts">
import { computed } from 'vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { answerConfirm, pendingConfirm } from '@/composables/useConfirm'

/** Único diálogo de confirmación de la app: lo abre `useConfirm()` desde cualquier componente. */
const options = computed(() => pendingConfirm.value?.options ?? null)
const open = computed({
  get: () => pendingConfirm.value !== null,
  set: (v: boolean) => {
    if (!v && pendingConfirm.value) answerConfirm(false) // se cerró sin confirmar (Escape, fondo o Cancelar)
  },
})
</script>

<template>
  <ConfirmDialog
    v-model:open="open"
    :title="options?.title ?? ''"
    :message="options?.message"
    :confirm-label="options?.confirmLabel"
    :cancel-label="options?.cancelLabel"
    :tone="options?.tone ?? 'default'"
    @confirm="answerConfirm(true)"
  />
</template>
