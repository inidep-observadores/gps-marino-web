<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ListPlus, Navigation, Trash2 } from '@lucide/vue'
import { DEFAULT_MARK_ICON, type WaypointInput } from '@gpsm/shared'
import MarkColorPicker from '@/components/marks/MarkColorPicker.vue'
import MarkIconPicker from '@/components/marks/MarkIconPicker.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import ToggleRow from '@/components/ui/ToggleRow.vue'
import { useCloseGuard } from '@/components/ui/sheetGuard'
import { useConfirm } from '@/composables/useConfirm'
import { isDirty, parseWaypointForm, toFormValues, type FormField, type WaypointFormValues } from '@/logic/waypointForm'
import { useNavigationStore } from '@/stores/navigation'
import { useToastStore } from '@/stores/toast'
import type { WaypointEditTarget } from '@/stores/ui'
import { useWaypointsStore } from '@/stores/waypoints'

/**
 * Alta y edición de una ubicación, con todos los campos de la app Flutter (`waypoint_edit_page.dart`).
 * Nueva: llega con valores iniciales (posición del GPS o del cursor del mapa, ver `usePositionLog`).
 * Al cerrar con cambios sin guardar pregunta antes (X, fondo o Escape).
 */
const props = defineProps<{ target: WaypointEditTarget }>()
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()
const waypoints = useWaypointsStore()
const nav = useNavigationStore()
const toast = useToastStore()
const confirm = useConfirm()

const existing = computed(() => (props.target.kind === 'edit' ? waypoints.byId(props.target.id) : null))

function initialInput(): WaypointInput {
  if (props.target.kind === 'new') return props.target.input
  const w = existing.value
  if (!w) return { description: '', recordedAt: Date.now(), lat: 0, lon: 0, speedKn: 0, bearing: 0, icon: DEFAULT_MARK_ICON, color: 'system', visible: false }
  return w
}

const start = initialInput()
const initial = toFormValues(start)
const form = reactive<WaypointFormValues>({ ...initial })
const errors = ref<Partial<Record<FormField, string>>>({})
const saving = ref(false)
const root = ref<HTMLFormElement | null>(null)

const dirty = () => isDirty(initial, form)

useCloseGuard(async () => {
  if (!dirty()) return true
  return confirm({ title: t('waypointForm.unsavedTitle'), message: t('waypointForm.unsavedMessage'), confirmLabel: t('waypointForm.discard'), tone: 'danger' })
})

const hemiLat = computed({ get: () => (form.latSouth ? 'S' : 'N'), set: (v: string) => (form.latSouth = v === 'S') })
const hemiLon = computed({ get: () => (form.lonWest ? 'W' : 'E'), set: (v: string) => (form.lonWest = v === 'W') })
const latOptions = [
  { value: 'N', label: 'N' },
  { value: 'S', label: 'S' },
]
const lonOptions = computed(() => [
  { value: 'E', label: 'E' },
  { value: 'W', label: t('units.west') },
])

async function save() {
  const parsed = parseWaypointForm(form, start.recordedAt)
  errors.value = Object.fromEntries(Object.entries(parsed.errors).map(([k, code]) => [k, t(`waypointForm.errors.${code}`)]))
  if (!parsed.input) {
    await nextTick()
    root.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  saving.value = true
  try {
    if (props.target.kind === 'edit') await waypoints.update(props.target.id, parsed.input)
    else await waypoints.create(parsed.input)
    toast.push(t('waypointForm.saved'), { tone: 'success' })
    emit('done')
  } finally {
    saving.value = false
  }
}

const name = computed(() => form.description.trim() || t('destination.unnamed'))

function point() {
  const w = existing.value!
  return { name: name.value, lat: w.lat, lon: w.lon, waypointId: w.id }
}

function navigateHere() {
  nav.setTarget(point())
  toast.push(t('destination.targetSet', { name: name.value }), { tone: 'success' })
  emit('done')
}

function appendToRoute() {
  nav.append(point())
  toast.push(t('destination.added', { name: name.value }), { tone: 'success' })
}

async function remove() {
  if (!existing.value) return
  if (!(await confirm({ title: t('waypointForm.deleteTitle'), message: t('waypointForm.deleteMessage', { name: name.value }), confirmLabel: t('waypoints.delete'), tone: 'danger' })))
    return
  await waypoints.remove([existing.value.id])
  toast.push(t('waypoints.deleted', 1), { tone: 'success' })
  emit('done')
}

const err = (f: FormField) => errors.value[f]
</script>

<template>
  <form ref="root" class="flex flex-col gap-5" novalidate @submit.prevent="save">
    <!-- Acciones de una ubicación existente -->
    <div v-if="existing" class="grid grid-cols-2 gap-2">
      <button type="button" class="btn-secondary" @click="navigateHere">
        <Navigation class="size-4 text-accent" aria-hidden="true" />{{ t('destination.setTarget') }}
      </button>
      <button type="button" class="btn-secondary" @click="appendToRoute">
        <ListPlus class="size-4" aria-hidden="true" />{{ t('destination.append') }}
      </button>
    </div>

    <label class="field">
      <span class="field-label">{{ t('savePosition.description') }}</span>
      <input v-model="form.description" class="input" maxlength="500" enterkeyhint="done" :placeholder="t('savePosition.descriptionPlaceholder')" />
    </label>

    <!-- Latitud y longitud en grados, minutos y hemisferio -->
    <fieldset class="flex flex-col gap-3">
      <legend class="field-label mb-1.5">{{ t('waypointForm.position') }}</legend>
      <div v-for="axis in (['lat', 'lon'] as const)" :key="axis" class="flex flex-col gap-1.5">
        <span class="text-caption">{{ axis === 'lat' ? t('gps.latitude') : t('gps.longitude') }}</span>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1">
            <span class="sr-only">{{ t('waypointForm.degrees') }}</span>
            <input
              v-model="form[`${axis}Deg`]"
              class="input numeric w-[4.5rem] text-center"
              inputmode="numeric"
              :maxlength="3"
              :aria-invalid="!!err(`${axis}Deg`)"
            />
            <span class="numeric text-ink-subtle" aria-hidden="true">°</span>
          </label>
          <label class="flex min-w-0 flex-1 items-center gap-1">
            <span class="sr-only">{{ t('waypointForm.minutes') }}</span>
            <input v-model="form[`${axis}Min`]" class="input numeric min-w-0 text-center" inputmode="decimal" :aria-invalid="!!err(`${axis}Min`)" />
            <span class="numeric text-ink-subtle" aria-hidden="true">'</span>
          </label>
          <SegmentedControl
            v-if="axis === 'lat'"
            v-model="hemiLat"
            class="w-24! shrink-0"
            :options="latOptions"
            :label="t('waypointForm.hemisphere')"
          />
          <SegmentedControl v-else v-model="hemiLon" class="w-24! shrink-0" :options="lonOptions" :label="t('waypointForm.hemisphere')" />
        </div>
        <p v-if="err(`${axis}Deg`) || err(`${axis}Min`)" class="text-xs text-stop">{{ err(`${axis}Deg`) ?? err(`${axis}Min`) }}</p>
      </div>
    </fieldset>

    <div class="grid grid-cols-2 gap-3">
      <label class="field">
        <span class="field-label">{{ t('gps.date') }}</span>
        <input v-model="form.date" type="date" class="input numeric" :aria-invalid="!!err('date')" />
        <span v-if="err('date')" class="text-xs text-stop">{{ err('date') }}</span>
      </label>
      <label class="field">
        <span class="field-label">{{ t('gps.time') }}</span>
        <input v-model="form.time" type="time" step="1" class="input numeric" :aria-invalid="!!err('time')" />
        <span v-if="err('time')" class="text-xs text-stop">{{ err('time') }}</span>
      </label>
      <label class="field">
        <span class="field-label">{{ t('gps.speed') }} ({{ t('units.kn') }})</span>
        <input v-model="form.speed" class="input numeric" inputmode="decimal" :aria-invalid="!!err('speed')" />
        <span v-if="err('speed')" class="text-xs text-stop">{{ err('speed') }}</span>
      </label>
      <label class="field">
        <span class="field-label">{{ t('gps.bearing') }} (°)</span>
        <input v-model="form.bearing" class="input numeric" inputmode="numeric" :aria-invalid="!!err('bearing')" />
        <span v-if="err('bearing')" class="text-xs text-stop">{{ err('bearing') }}</span>
      </label>
    </div>

    <div class="field">
      <span class="field-label">{{ t('savePosition.color') }}</span>
      <MarkColorPicker v-model="form.color" :label="t('savePosition.color')" />
    </div>

    <div class="field">
      <span class="field-label">{{ t('savePosition.icon') }}</span>
      <MarkIconPicker v-model="form.icon" :color="form.color" :label="t('savePosition.icon')" />
    </div>

    <ToggleRow v-model="form.visible" :label="t('savePosition.visible')" />

    <button v-if="existing" type="button" class="btn-ghost self-start text-stop" @click="remove">
      <Trash2 class="size-4" aria-hidden="true" />{{ t('waypoints.delete') }}
    </button>

    <!-- Botones siempre a mano en un formulario largo (teléfono) -->
    <div class="sticky -bottom-5 -mx-5 mt-1 grid grid-cols-2 gap-2.5 border-t border-line bg-surface px-5 pt-3 pb-1">
      <button type="button" class="btn-secondary" @click="emit('done')">{{ t('common.cancel') }}</button>
      <button type="submit" class="btn-primary" :disabled="saving">{{ t('common.save') }}</button>
    </div>
  </form>
</template>
