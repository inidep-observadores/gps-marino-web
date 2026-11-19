<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CalendarDays,
  Clock,
  Crosshair,
  LifeBuoy,
  MapPin,
  MapPinPlus,
  MonitorSmartphone,
  Power,
  RotateCw,
  Satellite,
  ShieldCheck,
  SatelliteDish,
  Smartphone,
  TriangleAlert,
  WifiOff,
} from '@lucide/vue'
import CardSection from '@/components/ui/CardSection.vue'
import CompassDial from '@/components/gps/CompassDial.vue'
import SpeedGauge from '@/components/gps/SpeedGauge.vue'
import ReadoutTile from '@/components/ui/ReadoutTile.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import { useFormat } from '@/composables/useFormat'
import { usePositionLog } from '@/composables/usePositionLog'
import { geoPermission, type GeoPermission } from '@/services/geolocation'
import { GPS_STATUS_COLOR as STATUS_COLOR } from '@/logic/gpsStatus'
import { useGpsStore } from '@/stores/gps'

/** Tarjeta principal de la pestaña GPS: estado de la señal, lecturas de posición y acciones de registro. */
const { t } = useI18n()
const f = useFormat()
const gps = useGpsStore()
const { quickSave, openSaveForm } = usePositionLog()

/** Primer uso: qué hay que saber antes de activar el GPS. */
const intro = [
  { key: 'onScreen', icon: Smartphone },
  { key: 'background', icon: SatelliteDish },
  { key: 'satellites', icon: WifiOff },
  { key: 'privacy', icon: ShieldCheck },
  { key: 'prompt', icon: MapPin },
] as const

const permission = ref<GeoPermission>('unknown')
onMounted(async () => (permission.value = await geoPermission()))

const showReadouts = computed(() => gps.status === 'fixed' || gps.status === 'stale')
const isError = computed(() => gps.status === 'denied' || gps.status === 'unavailable' || gps.status === 'unsupported')
const staleSeconds = computed(() => (gps.current ? Math.round((gps.now - gps.current.t) / 1000) : 0))
const s = computed(() => gps.current)
</script>

<template>
  <CardSection :title="t('gps.title')" :icon="Satellite" :status="STATUS_COLOR[gps.status]">
    <template #actions>
      <StatusPill :status="STATUS_COLOR[gps.status]" :label="t(`gps.status.${gps.status}`)" />
    </template>

    <!-- Apagado: explicación (primer uso) y botón para activar -->
    <div v-if="gps.status === 'inactive'" class="flex flex-col gap-4">
      <div v-if="permission !== 'granted'" class="flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/60 p-4">
        <h3 class="text-sm font-semibold">{{ t('gps.intro.title') }}</h3>
        <ul class="flex flex-col gap-2.5">
          <li v-for="item in intro" :key="item.key" class="flex items-start gap-3 text-sm text-secondary">
            <span class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <component :is="item.icon" class="size-4" aria-hidden="true" />
            </span>
            <span class="pt-1">{{ t(`gps.intro.${item.key}`) }}</span>
          </li>
        </ul>
      </div>
      <p v-else class="text-sm text-secondary">{{ t('gps.activateMessage') }}</p>
      <button type="button" class="btn-primary" @click="gps.start()">
        <Crosshair class="size-4" aria-hidden="true" />{{ t('gps.activate') }}
      </button>
    </div>

    <!-- Encendido, esperando el primer fix -->
    <div v-else-if="gps.status === 'searching'" class="flex flex-col items-center gap-4 py-4 text-center">
      <span class="radar"><SatelliteDish class="size-8" aria-hidden="true" /></span>
      <div class="flex flex-col gap-1">
        <p class="font-medium">{{ t('gps.waiting') }}</p>
        <p class="text-caption">{{ t('gps.waitingHint') }}</p>
      </div>
      <button type="button" class="btn-ghost" @click="gps.stop()">
        <Power class="size-4" aria-hidden="true" />{{ t('gps.deactivate') }}
      </button>
    </div>

    <!-- Sin permiso, sin señal o sin API -->
    <div v-else-if="isError" class="flex flex-col gap-4" data-status="red">
      <p class="flex items-start gap-2.5 text-sm">
        <TriangleAlert class="mt-0.5 size-4 shrink-0 text-status" aria-hidden="true" />
        <span>{{ t(`gps.${gps.status}Hint`) }}</span>
      </p>
      <button v-if="gps.status !== 'unsupported'" type="button" class="btn-secondary" @click="gps.start()">
        <RotateCw class="size-4" aria-hidden="true" />{{ t('gps.retry') }}
      </button>
    </div>

    <!-- Con posición -->
    <div v-else-if="showReadouts && s" class="flex flex-col gap-3">
      <p v-if="gps.status === 'stale'" class="flex items-start gap-2 rounded-2xl bg-caution/10 px-3.5 py-2.5 text-sm" data-status="yellow">
        <TriangleAlert class="mt-0.5 size-4 shrink-0 text-status" aria-hidden="true" />
        {{ t('gps.staleHint', { s: staleSeconds }) }}
      </p>

      <!-- En tarjetas anchas (tableta) las lecturas van a un lado y los instrumentos al otro -->
      <div class="grid gap-3 @2xl:grid-cols-2" :class="{ 'opacity-60': gps.status === 'stale' }">
        <div class="flex flex-col gap-2.5">
          <div class="readout flex-1 justify-center gap-2.5 p-4">
            <span class="readout-label">{{ t('gps.latitude') }} · {{ t('gps.longitude') }}</span>
            <span class="readout-hero">{{ f.lat(s.lat) }}</span>
            <span class="readout-hero">{{ f.lon(s.lon) }}</span>
            <span class="readout-meta numeric">{{ t('gps.accuracy') }} {{ t('gps.accuracyValue', { m: f.meters(s.accuracyM) }) }}</span>
          </div>
          <div class="grid grid-cols-2 gap-2.5">
            <ReadoutTile :label="t('gps.date')" :value="f.date(s.t)" :icon="CalendarDays" />
            <ReadoutTile :label="t('gps.time')" :value="f.time(s.t)" :icon="Clock" />
          </div>
        </div>

        <!-- Instrumentos: velocidad y rumbo -->
        <div class="rounded-2xl border border-line bg-surface-2/60 p-3 @md:p-4">
          <div class="grid grid-cols-2 gap-2 @xl:gap-4">
            <SpeedGauge :speed-kn="gps.speedKn" :value="f.speed(gps.speedKn)" :unit="t('units.kn')" :label="t('gps.speed')" />
            <CompassDial :course-deg="gps.courseDeg" :value="f.bearing(gps.courseDeg)" :label="t('gps.bearing')" />
          </div>
          <p class="text-caption mt-2 text-center">{{ t('gps.speedHint') }}</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2.5">
        <button type="button" class="btn-secondary" :disabled="!gps.hasFix" @click="quickSave()">
          <LifeBuoy class="size-4 text-mark-orange" aria-hidden="true" />{{ t('gps.quickSave') }}
        </button>
        <button type="button" class="btn-primary" :disabled="!gps.hasFix" @click="openSaveForm()">
          <MapPinPlus class="size-4" aria-hidden="true" />{{ t('gps.savePosition') }}
        </button>
      </div>
      <div class="flex items-center justify-between gap-2">
        <span v-if="gps.screenOn" class="eyebrow flex items-center gap-1.5">
          <MonitorSmartphone class="size-3.5" aria-hidden="true" />{{ t('gps.screenOn') }}
        </span>
        <span v-else></span>
        <button type="button" class="btn-ghost h-9 px-3" @click="gps.stop()">
          <Power class="size-4" aria-hidden="true" />{{ t('gps.deactivate') }}
        </button>
      </div>
    </div>
  </CardSection>
</template>
