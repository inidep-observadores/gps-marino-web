<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { CalendarDays, Clock, Compass, Construction, Gauge, MoveHorizontal, MoveVertical, Satellite } from '@lucide/vue'
import CardSection from '@/components/ui/CardSection.vue'
import ReadoutTile from '@/components/ui/ReadoutTile.vue'
import StatusPill from '@/components/ui/StatusPill.vue'

/** Pestaña GPS. Fase 0: estructura y lecturas vacías; la lectura real del GPS llega en la fase 1. */
const { t } = useI18n()
</script>

<template>
  <div class="dashboard">
    <div class="dashboard-aside">
      <CardSection :title="t('gps.title')" :icon="Satellite">
        <template #actions>
          <StatusPill status="none" :label="t('gps.inactive')" />
        </template>
        <div class="grid grid-cols-2 gap-2.5">
          <ReadoutTile class="col-span-2 min-[400px]:col-span-1" :label="t('gps.date')" value="--/--/----" :icon="CalendarDays" />
          <ReadoutTile class="col-span-2 min-[400px]:col-span-1" :label="t('gps.time')" value="--:--" :icon="Clock" />
          <ReadoutTile class="col-span-2" :label="t('gps.latitude')" value="--° --,---' -" :icon="MoveVertical" />
          <ReadoutTile class="col-span-2" :label="t('gps.longitude')" value="---° --,---' -" :icon="MoveHorizontal" />
          <ReadoutTile :label="t('gps.speed')" value="--" unit="kn" :icon="Gauge" />
          <ReadoutTile :label="t('gps.bearing')" value="---" unit="°" :icon="Compass" />
        </div>
      </CardSection>
    </div>
    <div class="dashboard-main">
      <section class="card card-body card-reveal flex items-start gap-3">
        <Construction class="mt-0.5 size-5 shrink-0 text-caution" aria-hidden="true" />
        <div class="flex flex-col gap-1">
          <h2 class="card-title">{{ t('common.comingSoon') }}</h2>
          <p class="text-sm text-secondary">{{ t('gps.pending') }}</p>
        </div>
      </section>
    </div>
  </div>
</template>
