<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Copy, Eraser } from '@lucide/vue'
import { convertAll, parseNumber, type ConversionGroupId } from '@gpsm/shared'
import { useCopy } from '@/composables/useCopy'

/**
 * Conversor de un grupo de unidades: se escribe el valor en cualquiera de los campos y los demás se calculan en el acto.
 * Acepta coma o punto decimal; los resultados salen con el separador del idioma. Cada campo tiene su botón de copiar.
 */
const props = defineProps<{
  group: ConversionGroupId
  units: { id: string; label: string; symbol: string }[]
}>()

const { t, locale } = useI18n()
const copy = useCopy()

const fields = reactive<Record<string, string>>({})
const invalid = ref<string | null>(null)

/** Resultado con 2 decimales como máximo (sin ceros de relleno): se lee de un vistazo. */
function show(v: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2, useGrouping: false }).format(v)
}

function onInput(id: string, text: string) {
  fields[id] = text
  if (text.trim() === '') {
    invalid.value = null
    for (const u of props.units) if (u.id !== id) fields[u.id] = ''
    return
  }
  const v = parseNumber(text)
  if (v == null) {
    invalid.value = id
    return
  }
  invalid.value = null
  const all = convertAll(props.group, id, v)
  for (const u of props.units) if (u.id !== id) fields[u.id] = show(all[u.id]!)
}

/** Valor numérico de cada campo (`null` si está vacío o no es un número): lo usan las ranuras para mostrar datos extra. */
const values = computed(() => Object.fromEntries(props.units.map((u) => [u.id, parseNumber(fields[u.id] ?? '')])) as Record<string, number | null>)

const hasValue = computed(() => props.units.some((u) => (fields[u.id] ?? '') !== ''))
function clear() {
  for (const u of props.units) fields[u.id] = ''
  invalid.value = null
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-for="u in units" :key="u.id" class="field">
      <label :for="`conv-${group}-${u.id}`" class="field-label flex items-baseline justify-between gap-2">
        <span>{{ u.label }}</span>
        <span class="numeric text-ink-subtle">{{ u.symbol }}</span>
      </label>
      <div class="flex items-center gap-2">
        <input
          :id="`conv-${group}-${u.id}`"
          class="input numeric min-w-0 flex-1"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          :value="fields[u.id] ?? ''"
          :aria-invalid="invalid === u.id"
          :placeholder="'0'"
          @input="onInput(u.id, ($event.target as HTMLInputElement).value)"
        />
        <!-- Dato extra al lado del valor (p. ej. la fuerza Beaufort junto a los nudos) -->
        <slot name="beside" :unit="u" :value="values[u.id]" />
        <button
          type="button"
          class="icon-btn border border-line"
          :disabled="!fields[u.id]"
          :aria-label="t('converter.copyValue', { unit: u.label })"
          :title="t('converter.copyValue', { unit: u.label })"
          @click="copy(fields[u.id]!)"
        >
          <Copy class="size-4" />
        </button>
      </div>
      <p v-if="invalid === u.id" class="text-xs text-stop">{{ t('converter.notANumber') }}</p>
      <slot name="below" :unit="u" :value="values[u.id]" />
    </div>
    <button v-if="hasValue" type="button" class="btn-ghost h-9 self-start px-3" @click="clear">
      <Eraser class="size-4" aria-hidden="true" />{{ t('converter.clear') }}
    </button>
  </div>
</template>
