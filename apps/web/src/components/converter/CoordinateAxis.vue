<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  COORD_LIMIT,
  coordForms,
  coordFromDecimal,
  coordFromDm,
  coordFromDms,
  coordInRange,
  parseNumber,
  type CoordAxis,
} from '@gpsm/shared'
import SegmentedControl, { type SegmentOption } from '@/components/ui/SegmentedControl.vue'

/**
 * Una coordenada (latitud o longitud) escrita de tres formas a la vez: grados decimales, grados y minutos decimales,
 * y grados, minutos y segundos. Se escribe en cualquiera y las demás se actualizan. El hemisferio se elige aparte.
 * `modelValue` es el valor en grados decimales con signo (sur y oeste negativos); `null` = vacío o inválido.
 */
const props = defineProps<{ axis: CoordAxis; modelValue: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const { t, locale } = useI18n()

type Row = 'dd' | 'dm' | 'dms'
const text = reactive({ dd: '', dmDeg: '', dmMin: '', dsDeg: '', dsMin: '', dsSec: '' })
const negative = ref(false)
const bad = ref<{ row: Row; reason: 'number' | 'range' } | null>(null)
let lastEmitted: number | null = props.modelValue

const num = (v: number, digits: number) => new Intl.NumberFormat(locale.value, { maximumFractionDigits: digits, useGrouping: false }).format(v)

/** Rellena las filas (menos la que se está escribiendo) con el valor. */
function fill(value: number, except?: Row) {
  const f = coordForms(value)
  if (except !== 'dd') text.dd = num(f.decimal, 5)
  if (except !== 'dm') {
    text.dmDeg = num(f.dm.deg, 0)
    text.dmMin = num(f.dm.min, 3)
  }
  if (except !== 'dms') {
    text.dsDeg = num(f.dms.deg, 0)
    text.dsMin = num(f.dms.min, 0)
    text.dsSec = num(f.dms.sec, 2)
  }
}
function clearRows(except?: Row) {
  if (except !== 'dd') text.dd = ''
  if (except !== 'dm') (text.dmDeg = ''), (text.dmMin = '')
  if (except !== 'dms') (text.dsDeg = ''), (text.dsMin = ''), (text.dsSec = '')
}

function publish(v: number | null) {
  lastEmitted = v
  emit('update:modelValue', v)
}

/** Valor nuevo de una fila: valida el rango, actualiza las otras filas y avisa. */
function apply(row: Row, value: number | null, invalidNumber: boolean) {
  if (value == null) {
    bad.value = invalidNumber ? { row, reason: 'number' } : null
    if (!invalidNumber) clearRows(row)
    publish(null)
    return
  }
  if (!coordInRange(props.axis, value)) {
    bad.value = { row, reason: 'range' }
    publish(null)
    return
  }
  bad.value = null
  negative.value = value < 0 || (value === 0 && negative.value)
  fill(value, row)
  publish(value)
}

/** Texto de una fila de minutos o segundos: número no negativo; vacío cuenta como 0 si hay otro campo escrito. */
const part = (s: string): number | null => (s.trim() === '' ? 0 : (() => { const v = parseNumber(s); return v != null && v >= 0 ? v : null })())

function onDd(value: string) {
  text.dd = value
  if (value.trim() === '') return apply('dd', null, false)
  const v = parseNumber(value)
  if (v == null) return apply('dd', null, true)
  // Un signo menos escrito a mano cambia el hemisferio.
  if (/^\s*-/.test(value)) negative.value = true
  else if (/^\s*\+/.test(value)) negative.value = false
  apply('dd', coordFromDecimal(v, negative.value), false)
}
function onDm(field: 'dmDeg' | 'dmMin', value: string) {
  text[field] = value
  if (text.dmDeg.trim() === '' && text.dmMin.trim() === '') return apply('dm', null, false)
  const d = part(text.dmDeg)
  const m = part(text.dmMin)
  if (d == null || m == null) return apply('dm', null, true)
  apply('dm', coordFromDm(d, m, negative.value), false)
}
function onDms(field: 'dsDeg' | 'dsMin' | 'dsSec', value: string) {
  text[field] = value
  if (!text.dsDeg.trim() && !text.dsMin.trim() && !text.dsSec.trim()) return apply('dms', null, false)
  const d = part(text.dsDeg)
  const m = part(text.dsMin)
  const s = part(text.dsSec)
  if (d == null || m == null || s == null) return apply('dms', null, true)
  apply('dms', coordFromDms(d, m, s, negative.value), false)
}

/** Cambio de hemisferio: invierte el signo del valor actual (si lo hay). */
function setNegative(neg: boolean) {
  negative.value = neg
  const v = props.modelValue
  if (v == null || v === 0) return
  const next = coordFromDecimal(Math.abs(v), neg)
  fill(next)
  publish(next)
}

// Valor puesto desde afuera ("Usar mi posición", borrar): se vuelve a escribir en todas las filas.
watch(
  () => props.modelValue,
  (v) => {
    if (v === lastEmitted) return
    lastEmitted = v
    bad.value = null
    if (v == null) {
      clearRows()
      return
    }
    negative.value = v < 0
    fill(v)
  },
)

const hemisphere = computed({
  get: () => (negative.value ? 'neg' : 'pos'),
  set: (v: 'pos' | 'neg') => setNegative(v === 'neg'),
})
const hemisphereOptions = computed<SegmentOption<'pos' | 'neg'>[]>(() =>
  props.axis === 'lat'
    ? [{ value: 'pos', label: t('converter.north') }, { value: 'neg', label: t('converter.south') }]
    : [{ value: 'pos', label: t('converter.east') }, { value: 'neg', label: t('units.west') }],
)
const error = computed(() => {
  if (!bad.value) return null
  return bad.value.reason === 'range' ? t('converter.outOfRange', { max: COORD_LIMIT[props.axis] }) : t('converter.notANumber')
})
const isBad = (row: Row) => bad.value?.row === row
const id = (s: string) => `coord-${props.axis}-${s}`
</script>

<template>
  <section class="flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/40 p-4">
    <div class="flex items-center justify-between gap-3">
      <h3 class="eyebrow">{{ axis === 'lat' ? t('gps.latitude') : t('gps.longitude') }}</h3>
      <SegmentedControl v-model="hemisphere" class="w-28! shrink-0" :options="hemisphereOptions" :label="t('waypointForm.hemisphere')" />
    </div>

    <div class="field">
      <label :for="id('dd')" class="field-label">{{ t('converter.decimalDegrees') }}</label>
      <div class="flex items-center gap-1.5">
        <input :id="id('dd')" class="input numeric min-w-0 flex-1" type="text" inputmode="decimal" autocomplete="off" placeholder="0" :value="text.dd" :aria-invalid="isBad('dd')" @input="onDd(($event.target as HTMLInputElement).value)" />
        <span class="numeric text-ink-subtle" aria-hidden="true">°</span>
      </div>
    </div>

    <div class="field">
      <span class="field-label">{{ t('converter.degreesMinutes') }}</span>
      <div class="flex items-center gap-1.5">
        <input :id="id('dm-deg')" class="input numeric w-[4.5rem] text-center" type="text" inputmode="numeric" autocomplete="off" placeholder="0" :aria-label="t('waypointForm.degrees')" :value="text.dmDeg" :aria-invalid="isBad('dm')" @input="onDm('dmDeg', ($event.target as HTMLInputElement).value)" />
        <span class="numeric text-ink-subtle" aria-hidden="true">°</span>
        <input :id="id('dm-min')" class="input numeric min-w-0 flex-1" type="text" inputmode="decimal" autocomplete="off" placeholder="0" :aria-label="t('waypointForm.minutes')" :value="text.dmMin" :aria-invalid="isBad('dm')" @input="onDm('dmMin', ($event.target as HTMLInputElement).value)" />
        <span class="numeric text-ink-subtle" aria-hidden="true">′</span>
      </div>
    </div>

    <div class="field">
      <span class="field-label">{{ t('converter.degreesMinutesSeconds') }}</span>
      <div class="flex items-center gap-1.5">
        <input :id="id('ds-deg')" class="input numeric w-[4.5rem] text-center" type="text" inputmode="numeric" autocomplete="off" placeholder="0" :aria-label="t('waypointForm.degrees')" :value="text.dsDeg" :aria-invalid="isBad('dms')" @input="onDms('dsDeg', ($event.target as HTMLInputElement).value)" />
        <span class="numeric text-ink-subtle" aria-hidden="true">°</span>
        <input :id="id('ds-min')" class="input numeric w-[4.25rem] text-center" type="text" inputmode="numeric" autocomplete="off" placeholder="0" :aria-label="t('waypointForm.minutes')" :value="text.dsMin" :aria-invalid="isBad('dms')" @input="onDms('dsMin', ($event.target as HTMLInputElement).value)" />
        <span class="numeric text-ink-subtle" aria-hidden="true">′</span>
        <input :id="id('ds-sec')" class="input numeric min-w-0 flex-1" type="text" inputmode="decimal" autocomplete="off" placeholder="0" :aria-label="t('converter.seconds')" :value="text.dsSec" :aria-invalid="isBad('dms')" @input="onDms('dsSec', ($event.target as HTMLInputElement).value)" />
        <span class="numeric text-ink-subtle" aria-hidden="true">″</span>
      </div>
    </div>

    <p v-if="error" class="text-xs text-stop">{{ error }}</p>
  </section>
</template>
