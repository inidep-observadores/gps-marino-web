<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { BellRing, CircleCheck, Info, X } from '@lucide/vue'
import { useToastStore, type ToastTone } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'

/** Avisos breves en pantalla, anunciados por lectores de pantalla (`aria-live`). */
const { t } = useI18n()
const toasts = useToastStore()
/** En el mapa los avisos van arriba (debajo del panel de datos) para no tapar los botones de abajo. */
const ui = useUiStore()
const ICON = { info: Info, success: CircleCheck, warning: BellRing } satisfies Record<ToastTone, unknown>
const STATUS = { info: 'none', success: 'green', warning: 'yellow' } as const
</script>

<template>
  <div class="toast-stack" :class="{ 'toast-stack-top': ui.view === 'map' }" aria-live="polite" aria-atomic="false">
    <div v-for="item in toasts.items" :key="item.id" class="toast" role="status" :data-status="STATUS[item.tone]">
      <component :is="ICON[item.tone]" class="mt-0.5 size-4 shrink-0 text-status" aria-hidden="true" />
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <strong v-if="item.title" class="font-semibold">{{ item.title }}</strong>
        <span class="text-secondary">{{ item.message }}</span>
      </div>
      <button type="button" class="icon-btn -my-2 -mr-2 size-8" :aria-label="t('common.dismiss')" @click="toasts.dismiss(item.id)">
        <X class="size-4" />
      </button>
    </div>
  </div>
</template>
