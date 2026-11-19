export type NotifyPermission = NotificationPermission | 'unsupported'

export function notificationPermission(): NotifyPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** Pide permiso para notificar (debe llamarse desde un gesto del usuario). */
export async function requestNotificationPermission(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/**
 * Notificación del sistema (vía service worker si está registrado: es lo que funciona en Android e iOS instalada)
 * con vibración. Devuelve `false` si no se pudo mostrar; quien llama muestra además un aviso en pantalla.
 */
export async function showSystemNotification(title: string, body: string, tag = 'arrival'): Promise<boolean> {
  try {
    navigator.vibrate?.([300, 150, 300])
  } catch {
    /* sin vibración */
  }
  if (notificationPermission() !== 'granted') return false
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body,
    tag,
    renotify: true,
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    vibrate: [300, 150, 300],
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, options)
      return true
    }
    new Notification(title, options)
    return true
  } catch {
    return false
  }
}
