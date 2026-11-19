import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Waypoint, WaypointInput } from '@gpsm/shared'
import { useDatabaseStore } from './database'

/** Ubicaciones guardadas (lista en memoria sincronizada con SQLite). La fase 2 suma edición, orden y selección. */
export const useWaypointsStore = defineStore('waypoints', () => {
  const database = useDatabaseStore()
  const items = ref<Waypoint[]>([])
  const loaded = ref(false)

  async function load() {
    items.value = await (await database.ready()).waypoints.list()
    loaded.value = true
  }

  async function create(input: WaypointInput): Promise<Waypoint> {
    const w = await (await database.ready()).waypoints.create(input)
    items.value = [w, ...items.value].sort((a, b) => b.recordedAt - a.recordedAt)
    return w
  }

  return { items, loaded, load, create }
})
