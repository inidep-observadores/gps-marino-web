<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bell, Route } from '@lucide/vue'
import ToggleRow from '@/components/ui/ToggleRow.vue'
import { notificationPermission, requestNotificationPermission, type NotifyPermission } from '@/services/notify'
import { useNavigationStore } from '@/stores/navigation'

/** Configuración de rutas (como "Configuración de Rutas" de la app Flutter) + permiso de notificaciones. */
const { t } = useI18n()
const nav = useNavigationStore()
const permission = ref<NotifyPermission>(notificationPermission())

const notifyArrival = computed({
  get: () => nav.arrival.notifyArrival,
  set: (v: boolean) => {
    void nav.updateArrival({ notifyArrival: v })
    // Al activar el aviso es buen momento para pedir el permiso (hay un gesto del usuario).
    if (v) void askPermission()
  },
})
const notifyAllPoints = computed({
  get: () => nav.arrival.notifyAllPoints,
  set: (v: boolean) => void nav.updateArrival({ notifyAllPoints: v }),
})

function onDistance(e: Event) {
  const v = Number((e.target as HTMLInputElement).value.replace(',', '.'))
  if (Number.isFinite(v) && v > 0 && v <= 50) void nav.updateArrival({ arrivalDistanceNm: v })
}

async function askPermission() {
  permission.value = await requestNotificationPermission()
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <h3 class="eyebrow flex items-center gap-1.5"><Route class="size-3.5" aria-hidden="true" />{{ t('settings.routes') }}</h3>
    <ToggleRow v-model="notifyArrival" :label="t('settings.notifyArrival')" />
    <label class="field">
      <span class="field-label">{{ t('settings.arrivalDistance') }}</span>
      <input
        class="input numeric w-32"
        type="number"
        inputmode="decimal"
        min="0.05"
        max="50"
        step="0.05"
        :value="nav.arrival.arrivalDistanceNm"
        :disabled="!nav.arrival.notifyArrival"
        @change="onDistance"
      />
    </label>
    <ToggleRow
      v-model="notifyAllPoints"
      :label="t('settings.notifyAllPoints')"
      :hint="t('settings.notifyAllPointsHint')"
      :disabled="!nav.arrival.notifyArrival"
    />

    <div class="flex items-start gap-2.5 rounded-2xl border border-line bg-surface-2/60 p-3.5">
      <Bell class="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium">{{ t('settings.notifySystem') }}</span>
        <p v-if="permission === 'granted'" class="text-caption">{{ t('settings.notifyGranted') }}</p>
        <p v-else-if="permission === 'denied'" class="text-caption">{{ t('settings.notifyDenied') }}</p>
        <p v-else-if="permission === 'unsupported'" class="text-caption">{{ t('settings.notifyUnsupported') }}</p>
        <button v-else type="button" class="btn-secondary h-9 self-start" @click="askPermission()">{{ t('settings.notifyAllow') }}</button>
      </div>
    </div>
  </section>
</template>
