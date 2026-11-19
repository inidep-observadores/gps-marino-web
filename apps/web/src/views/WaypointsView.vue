<script setup lang="ts">
import { onActivated, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Construction, MapPinned } from '@lucide/vue'
import type { Waypoint } from '@gpsm/shared'
import CardSection from '@/components/ui/CardSection.vue'
import { useDatabaseStore } from '@/stores/database'

/** Pestaña Ubicaciones. Fase 0: lista leída de SQLite (prueba de punta a punta de la base); edición en la fase 2. */
const { t, d } = useI18n()
const database = useDatabaseStore()
const items = ref<Waypoint[] | null>(null)

async function load() {
  try {
    items.value = await (await database.ready()).waypoints.list()
  } catch {
    items.value = []
  }
}
onMounted(load)
onActivated(load)
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4 sm:gap-5">
    <CardSection
      :title="t('waypoints.title')"
      :subtitle="items ? t('waypoints.count', items.length) : t('common.loading')"
      :icon="MapPinned"
    >
      <div v-if="items === null" class="flex flex-col gap-2" role="status" :aria-label="t('common.loading')">
        <div v-for="i in 3" :key="i" class="skeleton h-12"></div>
      </div>
      <div v-else-if="!items.length" class="flex flex-col items-center gap-2 py-8 text-center">
        <span class="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-ink-subtle">
          <MapPinned class="size-6" aria-hidden="true" />
        </span>
        <p class="font-medium">{{ t('waypoints.empty') }}</p>
        <p class="text-caption max-w-xs">{{ t('waypoints.emptyHint') }}</p>
      </div>
      <ul v-else class="list">
        <li v-for="w in items" :key="w.id" class="list-row">
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm font-medium">{{ w.description || '—' }}</span>
            <span class="numeric truncate text-xs text-ink-subtle">{{ w.lat.toFixed(5) }}, {{ w.lon.toFixed(5) }}</span>
          </span>
          <span class="numeric text-xs text-ink-muted">{{ d(w.recordedAt, { dateStyle: 'short', timeStyle: 'short' }) }}</span>
        </li>
      </ul>
    </CardSection>

    <section class="card card-body flex items-start gap-3">
      <Construction class="mt-0.5 size-5 shrink-0 text-caution" aria-hidden="true" />
      <p class="text-sm text-secondary">{{ t('waypoints.pending') }}</p>
    </section>
  </div>
</template>
