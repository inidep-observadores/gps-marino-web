import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import {
  DEFAULT_LIST_OPTIONS,
  newRecordsForMerge,
  sortWaypoints,
  type ParsedBackupRecord,
  type Waypoint,
  type WaypointInput,
  type WaypointOrder,
} from '@gpsm/shared'
import { i18n } from '@/i18n'
import { useDatabaseStore } from './database'

const LIST_KEY = 'waypoints.list'
const BACKUP_KEY = 'backup.lastAt'
/** Días sin copia de seguridad a partir de los cuales se sugiere hacer una. */
export const BACKUP_REMINDER_DAYS = 7

/**
 * Ubicaciones guardadas: lista en memoria sincronizada con SQLite, orden/búsqueda y selección múltiple.
 * La lista se reemplaza entera en cada cambio (`shallowRef`): con miles de ubicaciones, la reactividad
 * profunda es cara en teléfonos modestos.
 */
export const useWaypointsStore = defineStore('waypoints', () => {
  const database = useDatabaseStore()
  const items = shallowRef<Waypoint[]>([])
  const loaded = ref(false)

  const order = ref<WaypointOrder>(DEFAULT_LIST_OPTIONS.order)
  const descending = ref(DEFAULT_LIST_OPTIONS.descending)
  const query = ref('')
  const selected = ref<Set<string>>(new Set())
  const lastBackupAt = ref<number | null>(null)

  const repo = async () => (await database.ready()).waypoints

  async function load() {
    const repos = await database.ready()
    items.value = await repos.waypoints.list()
    const prefs = await repos.settings.get<{ order?: WaypointOrder; descending?: boolean }>(LIST_KEY, {})
    order.value = prefs.order ?? order.value
    descending.value = prefs.descending ?? descending.value
    lastBackupAt.value = await repos.settings.get<number | null>(BACKUP_KEY, null)
    loaded.value = true
  }

  watch([order, descending], async () => {
    if (loaded.value) await (await database.ready()).settings.set(LIST_KEY, { order: order.value, descending: descending.value })
  })

  const visibleList = computed(() =>
    sortWaypoints(items.value, {
      order: order.value,
      descending: descending.value,
      query: query.value,
      locale: i18n.global.locale.value,
      iconLabel: (icon) => i18n.global.t(`marks.icons.${icon}`),
    }),
  )

  const byId = (id: string) => items.value.find((w) => w.id === id) ?? null

  async function reload() {
    items.value = await (await repo()).list()
    // La selección no puede apuntar a ubicaciones que ya no existen.
    const alive = new Set(items.value.map((w) => w.id))
    selected.value = new Set([...selected.value].filter((id) => alive.has(id)))
  }

  async function create(input: WaypointInput): Promise<Waypoint> {
    const w = await (await repo()).create(input)
    items.value = [w, ...items.value]
    return w
  }

  async function update(id: string, patch: Partial<WaypointInput>) {
    const w = await (await repo()).update(id, patch)
    if (w) items.value = items.value.map((x) => (x.id === id ? w : x))
    return w
  }

  async function remove(ids: string[]) {
    await (await repo()).remove(ids)
    await reload()
  }

  async function setVisible(ids: string[], visible: boolean) {
    await (await repo()).setVisible(ids, visible)
    await reload()
  }

  /** Restaurar una copia: `merge` agrega solo lo que no está; `replace` da de baja todo lo actual antes. */
  async function restore(records: ParsedBackupRecord[], mode: 'merge' | 'replace'): Promise<number> {
    const toAdd = mode === 'merge' ? newRecordsForMerge(items.value, records) : records
    const n = await (await repo()).importMany(
      toAdd.map((r) => ({ input: r.input, id: r.uuid })),
      { replace: mode === 'replace' },
    )
    await reload()
    return n
  }

  async function markBackup() {
    lastBackupAt.value = Date.now()
    await (await database.ready()).settings.set(BACKUP_KEY, lastBackupAt.value)
  }

  const backupDue = computed(
    () =>
      items.value.length > 0 &&
      (lastBackupAt.value == null || Date.now() - lastBackupAt.value > BACKUP_REMINDER_DAYS * 86_400_000),
  )

  // Selección múltiple
  const selectMode = computed(() => selected.value.size > 0)
  const isSelected = (id: string) => selected.value.has(id)
  function toggle(id: string) {
    const next = new Set(selected.value)
    if (!next.delete(id)) next.add(id)
    selected.value = next
  }
  const selectAll = () => (selected.value = new Set(visibleList.value.map((w) => w.id)))
  const clearSelection = () => (selected.value = new Set())
  const selectedList = computed(() => items.value.filter((w) => selected.value.has(w.id)))

  return {
    items,
    loaded,
    order,
    descending,
    query,
    visibleList,
    selected,
    selectMode,
    selectedList,
    lastBackupAt,
    backupDue,
    load,
    byId,
    create,
    update,
    remove,
    setVisible,
    restore,
    markBackup,
    isSelected,
    toggle,
    selectAll,
    clearSelection,
  }
})
