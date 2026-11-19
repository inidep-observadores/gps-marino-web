<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Database, Download, Monitor, Moon, MoonStar, Sun } from '@lucide/vue'
import SegmentedControl, { type SegmentOption } from '@/components/ui/SegmentedControl.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { useDatabaseStore } from '@/stores/database'
import { usePrefsStore, type Locale, type ThemePreference } from '@/stores/prefs'
import type { Status } from '@/types'

const { t, locale } = useI18n()
const prefs = usePrefsStore()
const database = useDatabaseStore()
const { canInstall, install } = usePwaInstall()

const themeOptions = computed<SegmentOption<ThemePreference>[]>(() => [
  { value: 'system', label: t('settings.themeSystem'), icon: Monitor },
  { value: 'light', label: t('settings.themeLight'), icon: Sun },
  { value: 'dark', label: t('settings.themeDark'), icon: Moon },
  { value: 'night', label: t('settings.themeNight'), icon: MoonStar },
])

const localeOptions: SegmentOption<Locale>[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
]

const storageStatus = computed<{ status: Status; label: string }>(() => {
  if (database.status === 'error') return { status: 'red', label: t('settings.storageError') }
  if (database.status !== 'ready') return { status: 'none', label: t('settings.storageOpening') }
  return database.persistent
    ? { status: 'green', label: t('settings.storagePersistent') }
    : { status: 'yellow', label: t('settings.storageMemory') }
})

const counts = ref<{ waypoints: number; layers: number } | null>(null)
const protectedStorage = ref<boolean | null>(null)
const usage = ref<{ used: string; quota: string } | null>(null)

const fmtBytes = (n: number) =>
  new Intl.NumberFormat(locale.value, { style: 'unit', unit: n >= 1e9 ? 'gigabyte' : 'megabyte', maximumFractionDigits: 1 }).format(
    n >= 1e9 ? n / 1e9 : n / 1e6,
  )

onMounted(async () => {
  try {
    protectedStorage.value = (await navigator.storage?.persisted?.()) ?? null
    const est = await navigator.storage?.estimate?.()
    if (est?.usage != null && est.quota) usage.value = { used: fmtBytes(est.usage), quota: fmtBytes(est.quota) }
  } catch {
    /* API no disponible */
  }
  try {
    const repos = await database.ready()
    counts.value = { waypoints: await repos.waypoints.count(), layers: (await repos.layers.list()).length }
  } catch {
    counts.value = null
  }
})

const version = __APP_VERSION__
</script>

<template>
  <div class="flex flex-col gap-7">
    <section class="flex flex-col gap-3">
      <h3 class="eyebrow">{{ t('settings.appearance') }}</h3>
      <div class="field">
        <span class="field-label">{{ t('settings.theme') }}</span>
        <SegmentedControl v-model="prefs.theme" :options="themeOptions" :label="t('settings.theme')" />
        <p v-if="prefs.theme === 'night'" class="text-caption">{{ t('settings.themeNightHint') }}</p>
      </div>
      <div class="field">
        <span class="field-label">{{ t('settings.language') }}</span>
        <SegmentedControl v-model="prefs.locale" :options="localeOptions" :label="t('settings.language')" />
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h3 class="eyebrow flex items-center gap-1.5"><Database class="size-3.5" aria-hidden="true" />{{ t('settings.storage') }}</h3>
      <div class="readout gap-3">
        <StatusPill class="self-start" :status="storageStatus.status" :label="storageStatus.label" />
        <p v-if="database.info?.fallbackReason" class="text-caption">
          {{ t('settings.storageFallback', { reason: database.info.fallbackReason }) }}
        </p>
        <p v-if="database.error" class="text-caption">{{ database.error }}</p>
        <p v-if="database.persistent && protectedStorage !== null" class="text-caption">
          {{ protectedStorage ? t('settings.storageProtected') : t('settings.storageUnprotected') }}
        </p>
        <dl v-if="counts" class="grid grid-cols-2 gap-2 text-sm">
          <div class="flex flex-col gap-0.5">
            <dt class="text-caption">{{ t('settings.recordsWaypoints') }}</dt>
            <dd class="numeric">{{ counts.waypoints }}</dd>
          </div>
          <div class="flex flex-col gap-0.5">
            <dt class="text-caption">{{ t('settings.recordsLayers') }}</dt>
            <dd class="numeric">{{ counts.layers }}</dd>
          </div>
        </dl>
        <p class="numeric text-[0.7rem] text-ink-subtle">
          <span v-if="usage">{{ t('settings.storageUsage', usage) }} · </span>
          <span v-if="database.info">{{ t('settings.sqlite', { version: database.info.sqliteVersion }) }}</span>
        </p>
      </div>
    </section>

    <section v-if="canInstall" class="flex flex-col gap-2">
      <button type="button" class="btn-primary" @click="install()">
        <Download class="size-4" aria-hidden="true" />{{ t('settings.install') }}
      </button>
      <p class="text-caption text-center">{{ t('settings.installHint') }}</p>
    </section>

    <p class="numeric text-center text-[0.7rem] text-ink-subtle">{{ t('settings.version', { version }) }}</p>
  </div>
</template>
