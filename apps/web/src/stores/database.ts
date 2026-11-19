import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { openDatabase, type AppDatabase } from '@/db/client'
import type { DbInfo } from '@/db/protocol'
import { createLayerRepository, type LayerRepository } from '@/repositories/layers'
import { createRouteRepository, createSettingsRepository, type RouteRepository, type SettingsRepository } from '@/repositories/settings'
import { createWaypointRepository, type WaypointRepository } from '@/repositories/waypoints'

export interface Repositories {
  waypoints: WaypointRepository
  layers: LayerRepository
  settings: SettingsRepository
  route: RouteRepository
}

export function createRepositories(db: AppDatabase): Repositories {
  return {
    waypoints: createWaypointRepository(db),
    layers: createLayerRepository(db),
    settings: createSettingsRepository(db),
    route: createRouteRepository(db),
  }
}

/**
 * Base local abierta y sus repositorios. Los stores de dominio esperan `ready()` antes de leer.
 * En la etapa 2, `open(userId)` cambia de archivo de base al iniciar o cerrar sesión.
 */
export const useDatabaseStore = defineStore('database', () => {
  const status = ref<'idle' | 'opening' | 'ready' | 'error'>('idle')
  const info = ref<DbInfo | null>(null)
  const error = ref<string | null>(null)
  // shallowRef: los repositorios son objetos con funciones, no datos reactivos.
  const repos = shallowRef<Repositories | null>(null)

  let pending: Promise<Repositories> | null = null

  function open(name = 'anon'): Promise<Repositories> {
    status.value = 'opening'
    error.value = null
    pending = openDatabase(name)
      .then(({ db, info: i }) => {
        info.value = i
        repos.value = createRepositories(db)
        status.value = 'ready'
        return repos.value
      })
      .catch((e: unknown) => {
        status.value = 'error'
        error.value = e instanceof Error ? e.message : String(e)
        throw e
      })
    return pending
  }

  /** Repositorios listos para usar (abre la base anónima si todavía no se abrió ninguna). */
  function ready(): Promise<Repositories> {
    return pending ?? open()
  }

  const persistent = computed(() => info.value?.storage === 'opfs')

  return { status, info, error, repos, persistent, open, ready }
})
