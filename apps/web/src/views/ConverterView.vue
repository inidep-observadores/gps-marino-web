<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDownToLine, Copy, Crosshair, Eraser, Gauge, Globe, Ruler, Wind } from '@lucide/vue'
import BeaufortBadge from '@/components/beaufort/BeaufortBadge.vue'
import CoordinateAxis from '@/components/converter/CoordinateAxis.vue'
import UnitConverter from '@/components/converter/UnitConverter.vue'
import CardSection from '@/components/ui/CardSection.vue'
import { beaufortFromKnots } from '@gpsm/shared'
import { useCopy } from '@/composables/useCopy'
import { useFormat } from '@/composables/useFormat'
import { useGpsStore } from '@/stores/gps'

/**
 * Conversor de unidades de uso náutico (sin conexión): coordenadas, profundidad, distancia, velocidad y presión.
 * En cada tarjeta se escribe el valor en cualquier unidad y las demás se calculan en el acto.
 */
const { t } = useI18n()
const f = useFormat()
const gps = useGpsStore()
const copy = useCopy()

const lat = ref<number | null>(null)
const lon = ref<number | null>(null)
const bothValid = computed(() => lat.value != null && lon.value != null)
const summary = computed(() => (bothValid.value ? `${f.lat(lat.value)} · ${f.lon(lon.value)}` : ''))

function useMyPosition() {
  const c = gps.current
  if (!c) return
  lat.value = c.lat
  lon.value = c.lon
}
function clearCoords() {
  lat.value = null
  lon.value = null
}

const unit = (id: string, label: string, symbol: string) => ({ id, label, symbol })
const depth = computed(() => [unit('m', t('converter.units.m'), 'm'), unit('fathom', t('converter.units.fathom'), t('converter.symbols.fathom'))])
const distanceLong = computed(() => [unit('nm', t('converter.units.nm'), t('units.nm')), unit('km', t('converter.units.km'), 'km')])
const distanceShort = computed(() => [unit('m', t('converter.units.m'), 'm'), unit('cable', t('converter.units.cable'), t('converter.symbols.cable'))])
const speed = computed(() => [unit('kn', t('converter.units.kn'), t('units.kn')), unit('kmh', t('converter.units.kmh'), 'km/h'), unit('ms', t('converter.units.ms'), 'm/s')])
const pressure = computed(() => [unit('hpa', t('converter.units.hpa'), 'hPa'), unit('mmhg', t('converter.units.mmhg'), 'mmHg')])
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-4 sm:gap-5">
    <p class="text-sm text-secondary">{{ t('converter.intro') }}</p>

    <!-- Coordenadas: ocupa todo el ancho (dos ejes, tres formas cada uno) -->
    <CardSection :title="t('converter.coordinates')" :subtitle="t('converter.coordinatesHint')" :icon="Globe">
      <div class="flex flex-col gap-3">
        <button type="button" class="btn-secondary self-start" :disabled="!gps.current" :title="gps.current ? undefined : t('converter.noPosition')" @click="useMyPosition">
          <Crosshair class="size-4" aria-hidden="true" />{{ t('converter.useMyPosition') }}
        </button>
        <p v-if="!gps.current" class="text-caption -mt-1">{{ t('converter.noPosition') }}</p>
        <div class="grid gap-3 md:grid-cols-2">
          <CoordinateAxis v-model="lat" axis="lat" />
          <CoordinateAxis v-model="lon" axis="lon" />
        </div>
        <div v-if="bothValid" class="readout items-center gap-2 p-3.5 text-center">
          <span class="readout-label">{{ t('converter.result') }}</span>
          <span class="readout-hero text-[1.35rem] sm:text-2xl">{{ summary }}</span>
          <div class="flex flex-wrap justify-center gap-2">
            <button type="button" class="btn-secondary h-9 px-3" @click="copy(summary)"><Copy class="size-4" aria-hidden="true" />{{ t('converter.copy') }}</button>
            <button type="button" class="btn-ghost h-9 px-3" @click="clearCoords"><Eraser class="size-4" aria-hidden="true" />{{ t('converter.clear') }}</button>
          </div>
        </div>
        <button v-else-if="lat != null || lon != null" type="button" class="btn-ghost h-9 self-start px-3" @click="clearCoords">
          <Eraser class="size-4" aria-hidden="true" />{{ t('converter.clear') }}
        </button>
      </div>
    </CardSection>

    <div class="grid gap-4 sm:gap-5 md:grid-cols-2">
      <CardSection :title="t('converter.depth')" :subtitle="t('converter.depthHint')" :icon="ArrowDownToLine">
        <UnitConverter group="depth" :units="depth" />
      </CardSection>

      <CardSection :title="t('converter.pressure')" :subtitle="t('converter.pressureHint')" :icon="Wind">
        <UnitConverter group="pressure" :units="pressure" />
      </CardSection>

      <CardSection :title="t('converter.speed')" :subtitle="t('converter.speedHint')" :icon="Gauge">
        <UnitConverter group="speed" :units="speed">
          <!-- Junto a los nudos: la fuerza Beaufort y su nombre -->
          <template #beside="{ unit, value }">
            <BeaufortBadge v-if="unit.id === 'kn' && value != null && value >= 0" :kn="value" />
          </template>
          <template #below="{ unit, value }">
            <p v-if="unit.id === 'kn' && value != null && value >= 0" class="text-xs text-ink-muted">
              {{ t('wind.beaufortN', { n: beaufortFromKnots(value) }) }} · {{ t(`wind.beaufort.${beaufortFromKnots(value)}`) }}
            </p>
          </template>
        </UnitConverter>
      </CardSection>

      <CardSection :title="t('converter.distance')" :subtitle="t('converter.distanceHint')" :icon="Ruler">
        <div class="flex flex-col gap-5">
          <UnitConverter group="distanceLong" :units="distanceLong" />
          <div class="border-t border-line pt-5">
            <UnitConverter group="distanceShort" :units="distanceShort" />
          </div>
        </div>
      </CardSection>
    </div>
  </div>
</template>
