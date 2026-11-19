<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, CalendarDays, FileUp, ListChecks, MapPinned, Search, Shapes, ShieldAlert, Share2, Type } from '@lucide/vue'
import { BackupFormatError, groupByDay, parseMogJson, type WaypointOrder } from '@gpsm/shared'
import CardSection from '@/components/ui/CardSection.vue'
import SegmentedControl, { type SegmentOption } from '@/components/ui/SegmentedControl.vue'
import SelectionBar from '@/components/waypoints/SelectionBar.vue'
import WaypointRow from '@/components/waypoints/WaypointRow.vue'
import { readBackupText } from '@/services/files'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'
import { useWaypointsStore } from '@/stores/waypoints'

/**
 * Pestaña Ubicaciones (lista de waypoints de la app Flutter): búsqueda sin acentos, orden por fecha/nombre/ícono,
 * selección múltiple (botón o pulsación larga), exportar y restaurar copias.
 * Pensada para teléfonos modestos con miles de registros: se dibujan de a `PAGE` filas a medida que se baja.
 */
const PAGE = 150

const { t, d } = useI18n()
const store = useWaypointsStore()
const ui = useUiStore()
const toast = useToastStore()

const sortOptions = computed<SegmentOption<WaypointOrder>[]>(() => [
  { value: 'date', label: t('waypoints.byDate'), icon: CalendarDays },
  { value: 'name', label: t('waypoints.byName'), icon: Type },
  { value: 'icon', label: t('waypoints.byIcon'), icon: Shapes },
])

// Dibujo incremental: al acercarse al final de lo dibujado se suman PAGE filas más.
const limit = ref(PAGE)
watch([() => store.query, () => store.order, () => store.descending], () => (limit.value = PAGE))
const shown = computed(() => store.visibleList.slice(0, limit.value))
const groups = computed(() =>
  store.order === 'date' ? groupByDay(shown.value) : [{ day: '', items: shown.value }],
)
const sentinel = ref<HTMLElement | null>(null)
const io = new IntersectionObserver((entries) => {
  if (entries.some((e) => e.isIntersecting) && limit.value < store.visibleList.length) limit.value += PAGE
}, { rootMargin: '600px' })
watch(sentinel, (el, old) => {
  if (old) io.unobserve(old)
  if (el) io.observe(el)
})
onBeforeUnmount(() => io.disconnect())
// Al cambiar de pestaña no queda una selección "fantasma" con la barra de acciones encima de otra vista.
onDeactivated(() => store.clearSelection())

const dayLabel = (day: string) => {
  const [y, m, dd] = day.split('-').map(Number)
  return d(new Date(y!, m! - 1, dd!), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const lastBackup = computed(() => (store.lastBackupAt ? d(store.lastBackupAt, { dateStyle: 'medium' }) : null))

// Restaurar copia: el input queda oculto; sin `accept` porque en Android filtra mal los .json/.zip.
const fileInput = ref<HTMLInputElement | null>(null)
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const backup = parseMogJson(await readBackupText(file))
    if (!backup.records.length) {
      toast.push(t('restore.empty'), { tone: 'warning' })
      return
    }
    ui.openRestore(file.name, backup)
  } catch (err) {
    toast.push(t(err instanceof BackupFormatError ? 'restore.invalid' : 'restore.unreadable'), { tone: 'warning', timeoutMs: 6000 })
  }
}

function startSelection() {
  const first = store.visibleList[0]
  if (first) store.toggle(first.id)
}
</script>

<template>
  <div class="dashboard mx-auto max-w-3xl lg:max-w-none" :class="{ 'pb-20': store.selectMode }">
    <div class="dashboard-aside lg:sticky lg:top-20 lg:col-span-4 xl:col-span-4">
    <CardSection
      :title="t('waypoints.title')"
      :subtitle="store.loaded ? t('waypoints.count', store.items.length) : t('common.loading')"
      :icon="MapPinned"
    >
      <template #actions>
        <button
          v-if="store.items.length && !store.selectMode"
          type="button"
          class="icon-btn"
          :aria-label="t('waypoints.select')"
          :title="t('waypoints.select')"
          @click="startSelection"
        >
          <ListChecks class="size-[1.15rem]" />
        </button>
      </template>

      <div class="flex flex-col gap-3">
        <!-- Copias de seguridad: los datos viven solo en este teléfono -->
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="chip" :disabled="!store.items.length" @click="ui.openExport([], true)">
            <Share2 class="size-4" aria-hidden="true" />{{ t('waypoints.exportAll') }}
          </button>
          <button type="button" class="chip" @click="fileInput?.click()">
            <FileUp class="size-4" aria-hidden="true" />{{ t('waypoints.restore') }}
          </button>
          <input ref="fileInput" type="file" class="sr-only" tabindex="-1" aria-hidden="true" @change="onFile" />
        </div>
        <p v-if="store.backupDue" class="flex items-start gap-2 rounded-2xl bg-caution/10 px-3.5 py-2.5 text-sm" data-status="yellow">
          <ShieldAlert class="mt-0.5 size-4 shrink-0 text-status" aria-hidden="true" />
          <span>
            {{ lastBackup ? t('waypoints.backupOld', { date: lastBackup }) : t('waypoints.backupNever') }}
            <button type="button" class="font-semibold text-accent underline underline-offset-2" @click="ui.openExport([], true)">
              {{ t('waypoints.backupNow') }}
            </button>
          </span>
        </p>

        <template v-if="store.items.length">
          <label class="input-group">
            <Search class="input-icon" aria-hidden="true" />
            <input v-model="store.query" type="search" class="input pl-10" enterkeyhint="search" :placeholder="t('destination.search')" :aria-label="t('destination.search')" />
          </label>
          <div class="flex items-center gap-2">
            <SegmentedControl v-model="store.order" class="flex-1" :options="sortOptions" :label="t('waypoints.sortBy')" />
            <button
              type="button"
              class="icon-btn border border-line"
              :aria-label="store.descending ? t('waypoints.descending') : t('waypoints.ascending')"
              :title="store.descending ? t('waypoints.descending') : t('waypoints.ascending')"
              @click="store.descending = !store.descending"
            >
              <ArrowDownWideNarrow v-if="store.descending" class="size-5" />
              <ArrowUpNarrowWide v-else class="size-5" />
            </button>
          </div>
        </template>
      </div>
    </CardSection>
    </div>

    <div class="dashboard-main lg:col-span-8 xl:col-span-8">
    <div v-if="!store.loaded" class="flex flex-col gap-2" role="status" :aria-label="t('common.loading')">
      <div v-for="i in 4" :key="i" class="skeleton h-16"></div>
    </div>

    <div v-else-if="!store.items.length" class="card card-body flex flex-col items-center gap-2 py-10 text-center">
      <span class="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-ink-subtle">
        <MapPinned class="size-6" aria-hidden="true" />
      </span>
      <p class="font-medium">{{ t('waypoints.empty') }}</p>
      <p class="text-caption max-w-xs">{{ t('waypoints.emptyHint') }}</p>
    </div>

    <p v-else-if="!store.visibleList.length" class="card card-body text-center text-sm text-secondary">{{ t('destination.noResults') }}</p>

    <template v-else>
      <section v-for="g in groups" :key="g.day || 'all'" class="flex flex-col gap-2">
        <h3 v-if="g.day" class="eyebrow sticky top-16 z-10 -mx-1 bg-canvas/90 px-1 py-1.5 backdrop-blur short:top-13">{{ dayLabel(g.day) }}</h3>
        <ul class="list">
          <li v-for="w in g.items" :key="w.id">
            <WaypointRow :waypoint="w" @open="ui.openWaypoint" />
          </li>
        </ul>
      </section>
      <div ref="sentinel" class="h-px" aria-hidden="true"></div>
      <p v-if="shown.length < store.visibleList.length" class="text-caption text-center">{{ t('common.loading') }}</p>
    </template>
    </div>

    <SelectionBar v-if="store.selectMode" />
  </div>
</template>
