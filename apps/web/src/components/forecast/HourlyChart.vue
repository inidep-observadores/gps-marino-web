<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { niceScale, type PointHour } from '@gpsm/shared'
import { useI18n } from 'vue-i18n'

/**
 * Gráfico horario en SVG a mano (sin librería, como los de Drone Forecast): una o varias líneas contra el tiempo, con
 * una escala "agradable", líneas guía horizontales (y bandas de color opcionales), separadores de día, marca de "ahora"
 * y un cursor vertical que el usuario mueve con el dedo para elegir la hora (compartido entre gráficos con `v-model`).
 * Se dibuja al ancho real del contenedor para que el texto se lea nítido.
 */
export interface ChartLine {
  name: string
  /** Token CSS del color (`--ds-accent`...). */
  color: string
  value: (h: PointHour) => number | null
  dashed?: boolean
  /** Rellena el área bajo la línea. */
  area?: boolean
}
export interface ChartBand {
  from: number
  to: number
  /** Token CSS del color. */
  color: string
}

const props = defineProps<{
  hours: readonly PointHour[]
  lines: ChartLine[]
  unit: string
  nowMs: number
  /** Valor mínimo del máximo del eje (para que un viento de 3 kn no se vea como un temporal). */
  minMax?: number
  bands?: ChartBand[]
  label: string
}>()
const selected = defineModel<number | null>('selected', { default: null })

const { locale } = useI18n()
const root = ref<HTMLDivElement | null>(null)
const width = ref(320)
const HEIGHT = 168
const M = { top: 10, right: 8, bottom: 24, left: 34 }
let ro: ResizeObserver | null = null
onMounted(() => {
  width.value = root.value?.clientWidth || 320
  ro = new ResizeObserver(() => (width.value = root.value?.clientWidth || width.value))
  if (root.value) ro.observe(root.value)
})
onBeforeUnmount(() => ro?.disconnect())

const t0 = computed(() => props.hours[0]?.t ?? 0)
const t1 = computed(() => props.hours[props.hours.length - 1]?.t ?? 1)
const plotW = computed(() => Math.max(10, width.value - M.left - M.right))
const plotH = HEIGHT - M.top - M.bottom
const x = (t: number) => M.left + ((t - t0.value) / Math.max(1, t1.value - t0.value)) * plotW.value

const scale = computed(() => {
  let max = props.minMax ?? 0
  for (const l of props.lines) for (const h of props.hours) max = Math.max(max, l.value(h) ?? 0)
  return niceScale(max)
})
const y = (v: number) => M.top + plotH - (v / scale.value.max) * plotH
const ticks = computed(() => {
  const out: number[] = []
  for (let v = 0; v <= scale.value.max + 1e-9; v += scale.value.step) out.push(Number(v.toFixed(6)))
  return out
})

/** Segmentos continuos (se corta donde hay datos nulos). */
function pathOf(l: ChartLine, area = false): string {
  const segs: string[] = []
  let run: [number, number][] = []
  const flush = () => {
    if (run.length > 1) {
      const d = run.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')
      segs.push(area ? `${d}L${run[run.length - 1]![0].toFixed(1)},${y(0)}L${run[0]![0].toFixed(1)},${y(0)}Z` : d)
    }
    run = []
  }
  for (const h of props.hours) {
    const v = l.value(h)
    if (v == null) flush()
    else run.push([x(h.t), y(v)])
  }
  flush()
  return segs.join('')
}

const dayMarks = computed(() => {
  const out: { x: number; label: string }[] = []
  let last = ''
  for (const h of props.hours) {
    const d = new Date(h.t)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (key !== last) {
      last = key
      out.push({ x: x(h.t), label: new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(d).replace('.', '') })
    }
  }
  return out
})

const nowX = computed(() => (props.nowMs >= t0.value && props.nowMs <= t1.value ? x(props.nowMs) : null))
const selX = computed(() => (selected.value != null ? x(selected.value) : null))

function pick(e: PointerEvent) {
  const r = (e.currentTarget as SVGElement).getBoundingClientRect()
  const px = e.clientX - r.left
  const t = t0.value + ((px - M.left) / plotW.value) * (t1.value - t0.value)
  let best = props.hours[0]
  for (const h of props.hours) if (best && Math.abs(h.t - t) < Math.abs(best.t - t)) best = h
  if (best) selected.value = best.t
}
</script>

<template>
  <div ref="root" class="w-full select-none">
    <svg :width="width" :height="HEIGHT" role="img" :aria-label="label" class="touch-pan-y" @pointerdown="pick" @pointermove="(e) => e.buttons && pick(e)">
      <!-- Bandas de color (p. ej. intensidad del viento) -->
      <rect
        v-for="(b, i) in bands"
        :key="i"
        :x="M.left"
        :y="y(Math.min(b.to, scale.max))"
        :width="plotW"
        :height="Math.max(0, y(b.from) - y(Math.min(b.to, scale.max)))"
        :style="{ fill: `var(${b.color})` }"
        opacity="0.09"
      />
      <!-- Líneas guía y eje vertical -->
      <g class="text-[10px]" fill="var(--ds-ink-subtle)" font-family="var(--font-mono)">
        <g v-for="v in ticks" :key="v">
          <line :x1="M.left" :x2="width - M.right" :y1="y(v)" :y2="y(v)" stroke="var(--ds-line)" stroke-width="1" />
          <text :x="M.left - 5" :y="y(v) + 3.5" text-anchor="end">{{ v }}</text>
        </g>
        <text :x="M.left - 5" :y="M.top - 1" text-anchor="end" font-size="9">{{ unit }}</text>
      </g>
      <!-- Días -->
      <g font-size="10" fill="var(--ds-ink-muted)" font-family="var(--font-sans)">
        <g v-for="(d, i) in dayMarks" :key="i">
          <line :x1="d.x" :x2="d.x" :y1="M.top" :y2="HEIGHT - M.bottom" stroke="var(--ds-line-strong)" stroke-dasharray="2 3" />
          <text :x="d.x + 3" :y="HEIGHT - 8" class="capitalize">{{ d.label }}</text>
        </g>
      </g>
      <!-- Ahora -->
      <line v-if="nowX != null" :x1="nowX" :x2="nowX" :y1="M.top" :y2="HEIGHT - M.bottom" stroke="var(--ds-accent)" stroke-width="1.5" opacity="0.6" />
      <!-- Series -->
      <template v-for="l in lines" :key="l.name">
        <path v-if="l.area" :d="pathOf(l, true)" :style="{ fill: `var(${l.color})` }" opacity="0.16" />
        <path
          :d="pathOf(l)"
          fill="none"
          :style="{ stroke: `var(${l.color})` }"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          :stroke-dasharray="l.dashed ? '5 4' : undefined"
        />
      </template>
      <!-- Cursor de la hora elegida -->
      <g v-if="selX != null">
        <line :x1="selX" :x2="selX" :y1="M.top" :y2="HEIGHT - M.bottom" stroke="var(--ds-ink)" stroke-width="1.2" />
        <template v-for="l in lines" :key="`dot-${l.name}`">
          <circle
            v-for="h in hours.filter((q) => q.t === selected)"
            :key="h.t"
            :cx="selX"
            :cy="l.value(h) == null ? -10 : y(l.value(h)!)"
            r="4"
            :style="{ stroke: `var(${l.color})` }"
            fill="var(--ds-surface)"
            stroke-width="2"
          />
        </template>
      </g>
    </svg>
  </div>
</template>
