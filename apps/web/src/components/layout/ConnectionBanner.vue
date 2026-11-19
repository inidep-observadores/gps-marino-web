<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { WifiOff } from '@lucide/vue'
import { useOnline } from '@/composables/useOnline'

/** Aviso de "sin conexión". En altamar es lo normal: el mensaje tranquiliza, no alarma. */
const { t } = useI18n()
const online = useOnline()
</script>

<template>
  <Transition
    enter-from-class="opacity-0 -translate-y-2"
    leave-to-class="opacity-0 -translate-y-2"
    enter-active-class="transition duration-300"
    leave-active-class="transition duration-200"
  >
    <div v-if="!online" class="app-container pt-3" role="status">
      <p class="flex items-center gap-2.5 rounded-2xl border border-line bg-surface-2/70 px-4 py-2.5 text-sm text-ink">
        <WifiOff class="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
        {{ t('common.offline') }}
      </p>
    </div>
  </Transition>
</template>
