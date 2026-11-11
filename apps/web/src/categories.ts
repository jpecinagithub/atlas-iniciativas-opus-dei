// Un color consistente por categoría (14), siempre acompañado de texto.
// No son constantes de datos: las categorías presentes salen del catálogo;
// esto solo asigna presentación a las conocidas y un gris a cualquier otra.
export const CATEGORY_COLORS: Record<string, string> = {
  'Colegios': '#f5a623',
  'Centros de mujeres': '#ec6fa5',
  'Centros de varones': '#4f9cf9',
  'Residencias universitarias': '#9d7bea',
  'Casa de retiros': '#3ec98f',
  'Universidades': '#ef6461',
  'Escuelas de formación Técnica': '#fb8c3c',
  'Asociaciones juveniles': '#38bdd3',
  'Centros culturales': '#b5cc18',
  'Oficinas de Información': '#94a3b8',
  'Centros Médicos': '#2dd4bf',
  'Iglesias': '#facc15',
  'Centros de promoción social': '#e879f9',
  'Clubes juveniles': '#4ade80',
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? '#cbd5e1';
}

export const RECIPIENT_LABELS: Record<string, string> = {
  femenino: 'Femenino',
  masculino: 'Masculino',
  mixto_programas_separados: 'Mixto / programas separados',
  no_consta: 'No consta',
  no_aplicable: 'No aplicable',
};
