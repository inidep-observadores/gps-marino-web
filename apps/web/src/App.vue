<script setup lang="ts">
import { computed } from 'vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppNav from '@/components/layout/AppNav.vue'
import AppSheets from '@/components/layout/AppSheets.vue'
import ConnectionBanner from '@/components/layout/ConnectionBanner.vue'
import { useTheme } from '@/composables/useTheme'
import { useUiStore, type ViewId } from '@/stores/ui'
import GpsView from '@/views/GpsView.vue'
import MapView from '@/views/MapView.vue'
import WaypointsView from '@/views/WaypointsView.vue'

useTheme()

const ui = useUiStore()
const VIEWS = { gps: GpsView, waypoints: WaypointsView, map: MapView } satisfies Record<ViewId, unknown>
const current = computed(() => VIEWS[ui.view])
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <AppHeader />
    <ConnectionBanner />
    <main class="app-container flex-1 pt-4 sm:pt-6">
      <KeepAlive>
        <component :is="current" />
      </KeepAlive>
    </main>
    <AppFooter />
    <AppNav variant="bar" />
    <AppSheets />
  </div>
</template>
