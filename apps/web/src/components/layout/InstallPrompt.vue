<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Maximize, Share, Smartphone, WifiOff } from '@lucide/vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import { usePwaInstall } from '@/composables/usePwaInstall'

/**
 * Sugerencia de instalar la app. Las reglas de cuándo aparece y cuándo vuelve a aparecer están en `usePwaInstall`.
 * Cerrar con la X, el fondo o Escape cuenta como "Ahora no" (se vuelve a sugerir en 24 horas).
 */
const { t } = useI18n()
const { isOpen, isIos, muted, setMuted, install, dismiss } = usePwaInstall()

const open = computed({
  get: () => isOpen.value,
  // Solo se llama cuando el usuario cierra la hoja; `install()` cierra tocando el estado directamente.
  set: (value: boolean) => {
    if (!value && isOpen.value) dismiss()
  },
})

const benefits = computed(() => [
  { icon: Smartphone, text: t('install.benefitHome') },
  { icon: Maximize, text: t('install.benefitFullscreen') },
  { icon: WifiOff, text: t('install.benefitOffline') },
])
</script>

<template>
  <BaseSheet v-model:open="open" :title="t('install.title')">
    <div class="flex flex-col gap-4">
      <p class="text-sm text-secondary">{{ t('install.description') }}</p>

      <!-- iOS no permite instalar desde código: se muestran los pasos. -->
      <ol v-if="isIos" class="list">
        <li class="flex items-center gap-3 px-4 py-3 text-sm">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-ink">1</span>
          <span>
            {{ t('install.iosStep1Before') }} <Share class="inline size-4 align-text-bottom text-accent" aria-hidden="true" />
            <strong>{{ t('install.iosShare') }}</strong> {{ t('install.iosStep1After') }}
          </span>
        </li>
        <li class="flex items-center gap-3 px-4 py-3 text-sm">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-ink">2</span>
          <span>{{ t('install.iosStep2') }} <strong>{{ t('install.iosAdd') }}</strong></span>
        </li>
        <li class="flex items-center gap-3 px-4 py-3 text-sm">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-ink">3</span>
          <span>{{ t('install.iosStep3') }}</span>
        </li>
      </ol>
      <ul v-else class="list">
        <li v-for="b in benefits" :key="b.text" class="flex items-center gap-3 px-4 py-3 text-sm">
          <component :is="b.icon" class="size-5 shrink-0 text-accent" aria-hidden="true" />
          {{ b.text }}
        </li>
      </ul>

      <div class="flex flex-col gap-2">
        <button v-if="!isIos" type="button" class="btn-primary" @click="install()">{{ t('install.install') }}</button>
        <button type="button" :class="isIos ? 'btn-primary' : 'btn-secondary'" @click="dismiss()">
          {{ isIos ? t('install.understood') : t('install.notNow') }}
        </button>
      </div>

      <label class="flex min-h-11 items-center gap-3 text-sm text-secondary">
        <input type="checkbox" class="size-5 accent-[var(--ds-accent)]" :checked="muted" @change="setMuted(($event.target as HTMLInputElement).checked)" />
        {{ t('install.dontShowAgain') }}
      </label>
    </div>
  </BaseSheet>
</template>
