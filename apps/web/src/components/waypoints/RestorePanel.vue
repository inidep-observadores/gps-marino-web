<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CopyPlus, Replace, TriangleAlert } from '@lucide/vue'
import { newRecordsForMerge, type ParsedBackup } from '@gpsm/shared'
import { useConfirm } from '@/composables/useConfirm'
import { useToastStore } from '@/stores/toast'
import { useWaypointsStore } from '@/stores/waypoints'

/**
 * Restaurar una copia (de esta app o de la app Flutter). La app original siempre borraba todo antes de
 * importar; aquí se elige: combinar (agrega solo lo que no está) o reemplazar (con confirmación).
 */
const props = defineProps<{ fileName: string; backup: ParsedBackup }>()
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()
const store = useWaypointsStore()
const toast = useToastStore()
const confirm = useConfirm()
const busy = ref(false)

const total = computed(() => props.backup.records.length)
const newOnes = computed(() => newRecordsForMerge(store.items, props.backup.records).length)

async function run(mode: 'merge' | 'replace') {
  if (
    mode === 'replace' &&
    store.items.length &&
    !(await confirm({
      title: t('restore.replaceTitle'),
      message: t('restore.replaceMessage', { current: store.items.length, incoming: total.value }),
      confirmLabel: t('restore.replace'),
      tone: 'danger',
    }))
  )
    return
  busy.value = true
  try {
    const n = await store.restore(props.backup.records, mode)
    toast.push(t('restore.done', n), { tone: 'success' })
    emit('done')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="readout gap-1.5">
      <span class="readout-label">{{ fileName }}</span>
      <span class="text-sm">{{ t('restore.found', total) }}</span>
      <span v-if="backup.skipped.length" class="flex items-center gap-1.5 text-xs text-caution">
        <TriangleAlert class="size-3.5" aria-hidden="true" />{{ t('restore.skipped', backup.skipped.length) }}
      </span>
    </div>

    <button type="button" class="flex items-start gap-3 rounded-2xl border border-line p-3.5 text-left transition hover:border-accent disabled:opacity-50" :disabled="busy || !newOnes" @click="run('merge')">
      <CopyPlus class="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
      <span class="flex flex-col gap-0.5">
        <span class="text-sm font-semibold">{{ t('restore.merge') }}</span>
        <span class="text-caption">{{ newOnes ? t('restore.mergeHint', newOnes) : t('restore.nothingNew') }}</span>
      </span>
    </button>

    <button type="button" class="flex items-start gap-3 rounded-2xl border border-line p-3.5 text-left transition hover:border-stop disabled:opacity-50" :disabled="busy || !total" @click="run('replace')">
      <Replace class="mt-0.5 size-5 shrink-0 text-stop" aria-hidden="true" />
      <span class="flex flex-col gap-0.5">
        <span class="text-sm font-semibold">{{ t('restore.replace') }}</span>
        <span class="text-caption">{{ t('restore.replaceHint', store.items.length) }}</span>
      </span>
    </button>

    <button type="button" class="btn-ghost" @click="emit('done')">{{ t('common.cancel') }}</button>
  </div>
</template>
