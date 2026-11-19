<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Eye } from '@lucide/vue'
import { distanceNm, type Waypoint } from '@gpsm/shared'
import MarkGlyph from '@/components/marks/MarkGlyph.vue'
import { useFormat } from '@/composables/useFormat'
import { useLongPress } from '@/composables/useLongPress'
import { useGpsStore } from '@/stores/gps'
import { useWaypointsStore } from '@/stores/waypoints'

/**
 * Fila de la lista, como en Flutter: ícono (o casilla en modo selección) con indicador de "visible en el mapa",
 * fecha y hora, descripción y posición; a la derecha rumbo, velocidad y distancia desde la posición actual.
 * Toque: editar (o marcar en modo selección). Pulsación larga: entra en selección.
 */
const props = defineProps<{ waypoint: Waypoint }>()
const emit = defineEmits<{ open: [id: string] }>()

const { t } = useI18n()
const f = useFormat()
const gps = useGpsStore()
const store = useWaypointsStore()

const selected = computed(() => store.isSelected(props.waypoint.id))
const distance = computed(() => (gps.current ? distanceNm(gps.current, props.waypoint) : null))

const { handlers, consumeClick } = useLongPress(() => {
  if (!store.isSelected(props.waypoint.id)) store.toggle(props.waypoint.id)
})

function onClick() {
  if (consumeClick()) return
  if (store.selectMode) store.toggle(props.waypoint.id)
  else emit('open', props.waypoint.id)
}
</script>

<template>
  <button
    type="button"
    class="list-row wp-row items-start select-none"
    :aria-pressed="store.selectMode ? selected : undefined"
    :aria-selected="selected"
    v-bind="handlers"
    @click="onClick"
  >
    <span class="flex w-9 shrink-0 flex-col items-center gap-1.5 pt-0.5">
      <span
        v-if="store.selectMode"
        class="flex size-6 items-center justify-center rounded-md border-2 transition"
        :class="selected ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong text-transparent'"
        aria-hidden="true"
      >
        <Check class="size-4" />
      </span>
      <span v-else class="flex size-9 items-center justify-center rounded-xl bg-surface-2 text-base">
        <MarkGlyph :icon="waypoint.icon" :color="waypoint.color" />
      </span>
      <Eye v-if="waypoint.visible" class="size-3.5 text-ink-subtle" :aria-label="t('waypoints.onMap')" />
    </span>

    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="numeric text-xs text-ink-muted">{{ f.date(waypoint.recordedAt) }} {{ f.time(waypoint.recordedAt) }}</span>
      <span class="truncate text-sm font-medium" :class="{ 'text-ink-subtle italic': !waypoint.description }">
        {{ waypoint.description || t('destination.unnamed') }}
      </span>
      <!-- Latitud y longitud en líneas separadas (como en Flutter): en un teléfono no entran juntas. -->
      <span class="numeric flex flex-col text-xs leading-snug text-ink-subtle sm:flex-row sm:gap-2">
        <span>{{ f.lat(waypoint.lat) }}</span>
        <span>{{ f.lon(waypoint.lon) }}</span>
      </span>
    </span>

    <span class="numeric flex shrink-0 flex-col items-end gap-0.5 pt-0.5 text-xs text-ink-muted">
      <span>{{ f.bearing(waypoint.bearing) }}</span>
      <span>{{ f.speed(waypoint.speedKn) }} {{ t('units.kn') }}</span>
      <span v-if="distance != null" class="text-accent">{{ f.distance(distance) }} {{ t('units.nm') }}</span>
    </span>
  </button>
</template>
