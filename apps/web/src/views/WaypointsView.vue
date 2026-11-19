<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Construction, MapPinned } from '@lucide/vue'
import MarkGlyph from '@/components/marks/MarkGlyph.vue'
import CardSection from '@/components/ui/CardSection.vue'
import { useFormat } from '@/composables/useFormat'
import { useWaypointsStore } from '@/stores/waypoints'

/** Pestaña Ubicaciones. Fase 1: lista de lo registrado; edición, búsqueda, orden y exportación en la fase 2. */
const { t } = useI18n()
const f = useFormat()
const waypoints = useWaypointsStore()
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4 sm:gap-5">
    <CardSection
      :title="t('waypoints.title')"
      :subtitle="waypoints.loaded ? t('waypoints.count', waypoints.items.length) : t('common.loading')"
      :icon="MapPinned"
    >
      <div v-if="!waypoints.loaded" class="flex flex-col gap-2" role="status" :aria-label="t('common.loading')">
        <div v-for="i in 3" :key="i" class="skeleton h-12"></div>
      </div>
      <div v-else-if="!waypoints.items.length" class="flex flex-col items-center gap-2 py-8 text-center">
        <span class="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-ink-subtle">
          <MapPinned class="size-6" aria-hidden="true" />
        </span>
        <p class="font-medium">{{ t('waypoints.empty') }}</p>
        <p class="text-caption max-w-xs">{{ t('waypoints.emptyHint') }}</p>
      </div>
      <ul v-else class="list">
        <li v-for="w in waypoints.items" :key="w.id" class="list-row">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-base">
            <MarkGlyph :icon="w.icon" :color="w.color" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm font-medium" :class="{ 'text-ink-subtle italic': !w.description }">
              {{ w.description || t('destination.unnamed') }}
            </span>
            <span class="numeric truncate text-xs text-ink-subtle">{{ f.lat(w.lat) }} · {{ f.lon(w.lon) }}</span>
          </span>
          <span class="numeric shrink-0 text-right text-xs text-ink-muted">{{ f.date(w.recordedAt) }}<br />{{ f.time(w.recordedAt) }}</span>
        </li>
      </ul>
    </CardSection>

    <section class="card card-body flex items-start gap-3">
      <Construction class="mt-0.5 size-5 shrink-0 text-caution" aria-hidden="true" />
      <p class="text-sm text-secondary">{{ t('waypoints.pending') }}</p>
    </section>
  </div>
</template>
