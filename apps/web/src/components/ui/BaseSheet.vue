<script setup lang="ts">
import { onMounted, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from '@lucide/vue'
import { CLOSE_GUARD_KEY, type CloseGuard } from './sheetGuard'

/**
 * Hoja modal sobre `<dialog>` nativo: foco atrapado, Escape y fondo inerte sin código extra.
 * En móvil se muestra como bottom sheet; desde `sm` como panel centrado (ver `.sheet` en style.css).
 * `size="xl"` es para contenido ancho.
 *
 * El contenido puede registrar un "guardia" (`useCloseGuard`) que decide si se puede cerrar cuando el usuario
 * toca la X, el fondo o Escape (p. ej. un formulario con cambios sin guardar). Cerrar desde el código
 * (`open = false` en el padre, después de guardar) no pasa por el guardia.
 */
const open = defineModel<boolean>('open', { required: true })
defineProps<{ title: string; size?: 'md' | 'xl' }>()

const { t } = useI18n()
const dialog = ref<HTMLDialogElement | null>(null)
let guard: CloseGuard | null = null
provide(CLOSE_GUARD_KEY, (g: CloseGuard | null) => (guard = g))

function sync(value: boolean) {
  const el = dialog.value
  if (!el) return
  if (value && !el.open) el.showModal()
  else if (!value && el.open) el.close()
}

watch(open, (v) => {
  if (!v) guard = null
  sync(v)
})
onMounted(() => sync(open.value))

/** Cierre pedido por el usuario: consulta al guardia (si hay). */
async function requestClose() {
  if (guard && !(await guard())) return
  open.value = false
}

/** Cerrar al tocar el fondo: el click cae sobre el propio <dialog>, fuera de su contenido. */
function onClick(e: MouseEvent) {
  if (e.target === dialog.value) void requestClose()
}
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet"
    :class="{ 'sheet-xl': size === 'xl' }"
    :aria-label="title"
    @cancel.prevent="requestClose"
    @close="open = false"
    @click="onClick"
  >
    <div class="sheet-grabber" aria-hidden="true"></div>
    <header class="sheet-header">
      <h2 class="sheet-title">{{ title }}</h2>
      <button type="button" class="icon-btn -mr-2" :aria-label="t('common.close')" @click="requestClose">
        <X class="size-5" />
      </button>
    </header>
    <div class="sheet-body">
      <slot />
    </div>
  </dialog>
</template>
