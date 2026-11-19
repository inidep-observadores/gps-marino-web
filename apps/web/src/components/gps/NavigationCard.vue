<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Clock, Compass, Flag, ListPlus, MapPinned, Milestone, Navigation, Route, Ruler, X } from '@lucide/vue'
import CardSection from '@/components/ui/CardSection.vue'
import ReadoutTile from '@/components/ui/ReadoutTile.vue'
import { useFormat } from '@/composables/useFormat'
import { useRouteActions } from '@/composables/useRouteActions'
import { useGpsStore } from '@/stores/gps'
import { useNavigationStore } from '@/stores/navigation'
import { useUiStore } from '@/stores/ui'

/**
 * Navegación hacia el destino o la ruta activa, como la pestaña GPS de la app Flutter:
 * - un solo destino: destino, distancia, rumbo al destino y ETA;
 * - varios puntos: próximo punto (distancia y rumbo del tramo) y destino final (distancia total y ETA).
 */
const { t } = useI18n()
const f = useFormat()
const gps = useGpsStore()
const nav = useNavigationStore()
const ui = useUiStore()
const { cancelRoute } = useRouteActions()

const hasFix = computed(() => !!gps.current)
const multi = computed(() => nav.route.length > 1)

/** ETA: hora; si no es hoy, fecha y hora. */
const etaText = computed(() => {
  const ms = nav.eta
  if (ms == null) return '--:--'
  return new Date(ms).toDateString() === new Date().toDateString() ? f.time(ms) : f.dateTime(ms)
})

const cancelTarget = cancelRoute
</script>

<template>
  <CardSection :title="t('navigation.title')" :subtitle="nav.route.length ? t('navigation.points', nav.route.length) : undefined" :icon="Navigation">
    <template #actions>
      <button v-if="nav.route.length" type="button" class="btn-ghost h-9 px-3" @click="ui.open('destination')">
        <ListPlus class="size-4" aria-hidden="true" />{{ t('navigation.addPoint') }}
      </button>
    </template>

    <div v-if="!nav.route.length" class="flex flex-col items-center gap-3 py-6 text-center">
      <span class="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-ink-subtle">
        <Flag class="size-6" aria-hidden="true" />
      </span>
      <p class="font-medium">{{ t('navigation.noTarget') }}</p>
      <p class="text-caption max-w-xs">{{ t('navigation.noTargetHint') }}</p>
      <button type="button" class="btn-primary mt-1" @click="ui.open('destination')">
        <MapPinned class="size-4" aria-hidden="true" />{{ t('navigation.chooseTarget') }}
      </button>
    </div>

    <div v-else class="flex flex-col gap-4">
      <!-- Un solo destino -->
      <template v-if="!multi && nav.next">
        <div class="flex flex-col gap-1">
          <span class="eyebrow">{{ t('navigation.target') }}</span>
          <span class="display truncate text-2xl">{{ nav.next.name }}</span>
        </div>
        <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <ReadoutTile :label="t('navigation.distance')" :value="f.distance(nav.nextLeg?.distanceNm)" :unit="t('units.nm')" :icon="Ruler" />
          <ReadoutTile :label="t('navigation.bearingTo')" :value="f.bearing(nav.nextLeg?.bearingDeg)" :icon="Compass" />
          <ReadoutTile class="col-span-2 sm:col-span-1" :label="t('navigation.eta')" :value="etaText" :icon="Clock" />
        </div>
      </template>

      <!-- Ruta con varios puntos -->
      <template v-else-if="nav.next && nav.final">
        <div class="flex flex-col gap-2.5">
          <div class="flex flex-col gap-1">
            <span class="eyebrow">{{ t('navigation.nextPoint') }}</span>
            <span class="display truncate text-2xl">{{ nav.next.name }}</span>
          </div>
          <div class="grid grid-cols-2 gap-2.5">
            <ReadoutTile :label="t('navigation.distance')" :value="f.distance(nav.nextLeg?.distanceNm)" :unit="t('units.nm')" :icon="Ruler" />
            <ReadoutTile :label="t('navigation.legBearing')" :value="f.bearing(nav.nextLeg?.bearingDeg)" :icon="Compass" />
          </div>
        </div>
        <div class="flex flex-col gap-2.5 border-t border-line pt-4">
          <div class="flex flex-col gap-1">
            <span class="eyebrow">{{ t('navigation.finalTarget') }}</span>
            <span class="truncate text-lg font-semibold">{{ nav.final.name }}</span>
          </div>
          <div class="grid grid-cols-2 gap-2.5">
            <ReadoutTile :label="t('navigation.totalDistance')" :value="f.distance(nav.totalNm)" :unit="t('units.nm')" :icon="Milestone" />
            <ReadoutTile :label="t('navigation.eta')" :value="etaText" :icon="Clock" />
          </div>
        </div>
      </template>

      <p v-if="!hasFix" class="text-caption">{{ t('navigation.needsFix') }}</p>

      <!-- Puntos de la ruta -->
      <div v-if="multi" class="flex flex-col gap-2">
        <h3 class="eyebrow flex items-center gap-1.5"><Route class="size-3.5" aria-hidden="true" />{{ t('navigation.route') }}</h3>
        <ol class="list">
          <li v-for="(p, i) in nav.route" :key="`${i}-${p.lat}-${p.lon}`" class="flex items-center gap-3 py-2 pr-2 pl-4">
            <span class="numeric flex size-6 shrink-0 items-center justify-center rounded-full text-xs" :class="i === 0 ? 'bg-accent text-accent-ink' : 'bg-surface-3 text-ink-muted'">{{ i + 1 }}</span>
            <span class="min-w-0 flex-1 truncate text-sm" :class="{ 'font-semibold': i === 0 }">{{ p.name }}</span>
            <span v-if="nav.legs[i]" class="numeric shrink-0 text-xs text-ink-subtle">
              {{ f.distance(nav.legs[i]!.distanceNm) }} {{ t('units.nm') }} · {{ f.bearing(nav.legs[i]!.bearingDeg) }}
            </span>
            <button type="button" class="icon-btn size-8" :aria-label="t('navigation.removePoint', { name: p.name })" @click="nav.removeAt(i)">
              <X class="size-4" />
            </button>
          </li>
        </ol>
        <p class="text-caption">{{ t('navigation.autoAdvance') }}</p>
      </div>

      <button type="button" class="btn-ghost self-start text-stop" @click="cancelTarget()">
        <X class="size-4" aria-hidden="true" />{{ t('navigation.cancelTarget') }}
      </button>
    </div>
  </CardSection>
</template>
