declare module 'polylabel' {
  /** Polo de inaccesibilidad (punto interior más alejado del borde) de un polígono `[anillo exterior, ...huecos]`. */
  export default function polylabel(
    polygon: number[][][],
    precision?: number,
    debug?: boolean,
  ): [number, number] & { distance: number }
}
