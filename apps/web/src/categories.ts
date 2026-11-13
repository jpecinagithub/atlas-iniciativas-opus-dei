// Presentación de categorías (Fase 8C): el sistema cromático vive en
// taxonomy.ts — las seis familias y las variaciones por categoría se
// definen SOLO allí. Este módulo conserva las etiquetas de
// destinatarios y reexporta el color para los consumidores históricos.
export { categoryColor } from './taxonomy';

export const RECIPIENT_LABELS: Record<string, string> = {
  femenino: 'Femenino',
  masculino: 'Masculino',
  mixto_programas_separados: 'Mixto / programas separados',
  no_consta: 'No consta',
  no_aplicable: 'No aplicable',
};
