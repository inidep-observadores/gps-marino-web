<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { HardDrive, ShieldAlert } from '@lucide/vue'

const { t } = useI18n()
</script>

<template>
  <!-- En móvil deja lugar para la barra inferior de navegación. -->
  <footer class="app-container mt-10 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-safe">
    <div class="flex flex-col gap-3 border-t border-line pt-6 text-xs leading-relaxed text-ink-subtle sm:flex-row sm:justify-between">
      <p class="flex max-w-2xl items-start gap-2">
        <ShieldAlert class="mt-0.5 size-4 shrink-0 text-caution" aria-hidden="true" />
        {{ t('app.disclaimer') }}
      </p>
      <p class="flex items-center gap-2 font-mono text-[0.68rem] tracking-wide uppercase sm:text-right">
        <HardDrive class="size-3.5 shrink-0" aria-hidden="true" />
        {{ t('app.localData') }}
      </p>
    </div>
  </footer>
</template>
