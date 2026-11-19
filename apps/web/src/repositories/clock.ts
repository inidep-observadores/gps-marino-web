/** Fuente de la hora actual (ms). Se inyecta para que los tests sean deterministas. */
export type Clock = () => number

export const systemClock: Clock = () => Date.now()
