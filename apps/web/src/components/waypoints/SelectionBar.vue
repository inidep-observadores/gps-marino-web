<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { CheckCheck, Eye, EyeOff, Share2, Trash2, X } from '@lucide/vue'
import { useConfirm } from '@/composables/useConfirm'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'
import { useWaypointsStore } from '@/stores/waypoints'

/**
 * Barra de acciones de la selección múltiple. Fija abajo, sobre la barra de navegación en el teléfono
 * (al alcance del pulgar), con íconos grandes y etiqueta: se usa con guantes o con el barco moviéndose.
 */
const { t } = useI18n()
const store = useWaypointsStore()
const ui = useUiStore()
const toast = useToastStore()
const confirm = useConfirm()

async function remove() {
  const n = store.selected.size
  if (!(await confirm({ title: t('waypoints.deleteTitle', n), message: t('waypoints.deleteMessage'), confirmLabel: t('waypoints.delete'), tone: 'danger' })))
    return
  await store.remove([...store.selected])
  toast.push(t('waypoints.deleted', n), { tone: 'success' })
}

async function visible(v: boolean) {
  const n = store.selected.size
  await store.setVisible([...store.selected], v)
  toast.push(t(v ? 'waypoints.shownOnMap' : 'waypoints.hiddenOnMap', n), { tone: 'success' })
}
</script>

<template>
  <div class="selection-bar" role="toolbar" :aria-label="t('waypoints.selectionActions')">
    <div class="mx-auto flex w-full max-w-3xl items-center gap-1 px-2">
      <button type="button" class="icon-btn" :aria-label="t('waypoints.clearSelection')" :title="t('waypoints.clearSelection')" @click="store.clearSelection()">
        <X class="size-5" />
      </button>
      <span class="numeric min-w-0 flex-1 truncate text-sm font-semibold" aria-live="polite">{{ t('waypoints.selected', store.selected.size) }}</span>
      <button type="button" class="selection-action" @click="store.selectAll()">
        <CheckCheck class="size-5" aria-hidden="true" /><span>{{ t('waypoints.all') }}</span>
      </button>
      <button type="button" class="selection-action" @click="visible(true)">
        <Eye class="size-5" aria-hidden="true" /><span>{{ t('waypoints.show') }}</span>
      </button>
      <button type="button" class="selection-action" @click="visible(false)">
        <EyeOff class="size-5" aria-hidden="true" /><span>{{ t('waypoints.hide') }}</span>
      </button>
      <button type="button" class="selection-action" @click="ui.openExport([...store.selected])">
        <Share2 class="size-5" aria-hidden="true" /><span>{{ t('waypoints.export') }}</span>
      </button>
      <button type="button" class="selection-action text-stop" @click="remove">
        <Trash2 class="size-5" aria-hidden="true" /><span>{{ t('waypoints.delete') }}</span>
      </button>
    </div>
  </div>
</template>
