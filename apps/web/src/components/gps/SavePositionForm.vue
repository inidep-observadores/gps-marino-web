<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MarkColor, MarkIcon } from '@gpsm/shared'
import MarkColorPicker from '@/components/marks/MarkColorPicker.vue'
import MarkIconPicker from '@/components/marks/MarkIconPicker.vue'
import ToggleRow from '@/components/ui/ToggleRow.vue'
import { useFormat } from '@/composables/useFormat'
import { waypointFromCapture } from '@/composables/usePositionLog'
import { useToastStore } from '@/stores/toast'
import type { CapturedPosition } from '@/stores/ui'
import { useWaypointsStore } from '@/stores/waypoints'

/**
 * "Registrar posición": guarda la posición capturada al tocar el botón (no la que llegue después),
 * con descripción, ícono y color. Valores iniciales como en Flutter: marcador verde, no visible en el mapa.
 * La edición completa (coordenadas, fecha, velocidad, rumbo) llega con la fase 2.
 */
const props = defineProps<{ captured: CapturedPosition }>()
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()
const f = useFormat()
const waypoints = useWaypointsStore()
const toast = useToastStore()

const description = ref('')
const icon = ref<MarkIcon>('locationDot')
const color = ref<MarkColor>('green')
const visible = ref(false)
const saving = ref(false)

async function save() {
  saving.value = true
  try {
    await waypoints.create(
      waypointFromCapture(props.captured, {
        description: description.value.trim(),
        icon: icon.value,
        color: color.value,
        visible: visible.value,
      }),
    )
    toast.push(t('savePosition.saved'), { tone: 'success' })
    emit('done')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="flex flex-col gap-5" @submit.prevent="save">
    <div class="readout gap-1">
      <span class="readout-label">{{ t('savePosition.capturedAt', { time: f.time(captured.sample.t) }) }}</span>
      <span class="numeric text-base">{{ f.lat(captured.sample.lat) }}</span>
      <span class="numeric text-base">{{ f.lon(captured.sample.lon) }}</span>
      <span class="readout-meta numeric">
        {{ f.speed(captured.speedKn) }} {{ t('units.kn') }} · {{ f.bearing(captured.courseDeg) }}
      </span>
    </div>

    <label class="field">
      <span class="field-label">{{ t('savePosition.description') }}</span>
      <input v-model="description" class="input" maxlength="500" :placeholder="t('savePosition.descriptionPlaceholder')" />
    </label>

    <div class="field">
      <span class="field-label">{{ t('savePosition.color') }}</span>
      <MarkColorPicker v-model="color" :label="t('savePosition.color')" />
    </div>

    <div class="field">
      <span class="field-label">{{ t('savePosition.icon') }}</span>
      <MarkIconPicker v-model="icon" :color="color" :label="t('savePosition.icon')" />
    </div>

    <ToggleRow v-model="visible" :label="t('savePosition.visible')" />

    <div class="grid grid-cols-2 gap-2.5">
      <button type="button" class="btn-secondary" @click="emit('done')">{{ t('common.cancel') }}</button>
      <button type="submit" class="btn-primary" :disabled="saving">{{ t('common.save') }}</button>
    </div>
  </form>
</template>
