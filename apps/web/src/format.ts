/** Formato numérico es-ES con punto de miles, independiente del ICU del navegador. */
export function fmt(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
