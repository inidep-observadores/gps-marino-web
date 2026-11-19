import type { GpsStatus } from '@/stores/gps'
import type { Status } from '@/types'

/** Color del semáforo para cada estado del GPS (siempre se acompaña con texto). */
export const GPS_STATUS_COLOR: Record<GpsStatus, Status> = {
  inactive: 'none',
  searching: 'yellow',
  fixed: 'green',
  stale: 'yellow',
  denied: 'red',
  unavailable: 'red',
  unsupported: 'red',
}
