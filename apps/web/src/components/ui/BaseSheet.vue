<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from '@lucide/vue'

/**
 * Hoja modal sobre `<dialog>` nativo: foco atrapado, Escape y fondo inerte sin código extra.
 * En móvil se muestra como bottom sheet; desde `sm` como panel centrado (ver `.sheet` en style.css).
 * `size="xl"` es para contenido ancho (el pronóstico completo de un spot): en pantallas grandes ocupa casi todo el alto.
 */
const open = defineModel<boolean>('open', { required: true })
defineProps<{ title: string; size?: 'md' | 'xl' }>()

const { t } = useI18n()
const dialog = ref<HTMLDialogElement | null>(null)

function sync(value: boolean) {
  const el = dialog.value
  if (!el) return
  if (value && !el.open) el.showModal()
  else if (!value && el.open) el.close()
}

watch(open, sync)
onMounted(() => sync(open.value))

/** Cerrar al tocar el fondo: el click cae sobre el propio <dialog>, fuera de su contenido. */
function onClick(e: MouseEvent) {
  if (e.target === dialog.value) open.value = false
}
</script>

<template>
  <dialog ref="dialog" class="sheet" :class="{ 'sheet-xl': size === 'xl' }" :aria-label="title" @close="open = false" @click="onClick">
    <div class="sheet-grabber" aria-hidden="true"></div>
    <header class="sheet-header">
      <h2 class="sheet-title">{{ title }}</h2>
      <button type="button" class="icon-btn -mr-2" :aria-label="t('common.close')" @click="open = false">
        <X class="size-5" />
      </button>
    </header>
    <div class="sheet-body">
      <slot />
    </div>
  </dialog>
</template>
