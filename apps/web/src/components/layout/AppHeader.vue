<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Settings2 } from '@lucide/vue'
import AppLogo from '@/components/layout/AppLogo.vue'
import AppNav from '@/components/layout/AppNav.vue'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const ui = useUiStore()
</script>

<template>
  <header class="app-bar">
    <div class="app-container flex h-16 items-center gap-2 sm:gap-3 short:h-13">
      <div class="flex min-w-0 flex-1 items-center gap-2.5">
        <AppLogo class="size-8 shrink-0" />
        <span class="flex min-w-0 flex-col leading-none">
          <span class="truncate text-sm font-semibold tracking-tight">{{ t('app.title') }}</span>
          <span class="eyebrow mt-1 truncate text-[0.6rem]">{{ t('app.tagline') }}</span>
        </span>
      </div>

      <AppNav variant="tabs" class="shrink-0" />

      <div class="flex shrink-0 items-center justify-end md:flex-1">
        <button
          type="button"
          class="icon-btn"
          :aria-label="t('settings.title')"
          :title="t('settings.title')"
          @click="ui.open('settings')"
        >
          <Settings2 class="size-[1.15rem]" />
        </button>
      </div>
    </div>
  </header>
</template>
