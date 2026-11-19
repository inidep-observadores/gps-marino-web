<script setup lang="ts">
import { onMounted, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { Trash2, TriangleAlert } from '@lucide/vue'

/**
 * Diálogo de confirmación centrado, sobre `<dialog>` nativo (foco atrapado, Escape y fondo inerte).
 * Por defecto el foco queda en "Cancelar": confirmar una acción destructiva exige un gesto deliberado.
 * `tone="danger"` usa el color de alerta; `icon` cambia el ícono.
 */
const props = withDefaults(
  defineProps<{
    title: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'danger' | 'default'
    icon?: Component
  }>(),
  { tone: 'default' },
)
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: []; cancel: [] }>()

const { t } = useI18n()
const dialog = ref<HTMLDialogElement | null>(null)
/** Evita avisar dos veces (confirmar y luego el evento `close`). */
let answered = false

function sync(value: boolean) {
  const el = dialog.value
  if (!el) return
  if (value && !el.open) {
    answered = false
    el.showModal()
  } else if (!value && el.open) el.close()
}
watch(open, sync)
onMounted(() => sync(open.value))

function confirm() {
  answered = true
  emit('confirm')
  open.value = false
}
function cancel() {
  if (!answered) emit('cancel')
  answered = true
  open.value = false
}
function onClick(e: MouseEvent) {
  if (e.target === dialog.value) cancel()
}

const DefaultIcon = (): Component => (props.tone === 'danger' ? Trash2 : TriangleAlert)
</script>

<template>
  <dialog
    ref="dialog"
    class="dialog-center"
    :aria-label="title"
    :aria-describedby="message ? 'confirm-message' : undefined"
    @close="cancel"
    @cancel.prevent="cancel"
    @click="onClick"
  >
    <div class="flex flex-col items-center gap-4 px-6 pt-7 pb-6 text-center" :data-status="tone === 'danger' ? 'red' : 'yellow'">
      <span class="flex size-14 items-center justify-center rounded-2xl bg-status/12 text-status">
        <component :is="icon ?? DefaultIcon()" class="size-6" aria-hidden="true" />
      </span>
      <div class="flex flex-col gap-1.5">
        <h2 class="display text-2xl text-balance">{{ title }}</h2>
        <p v-if="message" id="confirm-message" class="text-sm leading-relaxed text-secondary">{{ message }}</p>
      </div>
      <div class="mt-1 grid w-full grid-cols-2 gap-2.5">
        <button type="button" class="btn-secondary" autofocus @click="cancel">{{ cancelLabel ?? t('common.cancel') }}</button>
        <button type="button" :class="tone === 'danger' ? 'btn-danger' : 'btn-primary'" @click="confirm">
          {{ confirmLabel ?? t('common.confirm') }}
        </button>
      </div>
    </div>
  </dialog>
</template>
