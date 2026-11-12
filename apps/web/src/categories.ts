// Sistema cromático de categorías (Fase 7B): familia contenida de tonos
// empolvados definida en la Fase 7A y validada sobre el mapa oscuro, el
// cristal y la ficha. El color nunca es el único canal: siempre va con
// punto + texto (y el nombre de la categoría en la propia interfaz).
// No son constantes de datos: las categorías presentes salen del catálogo;
// esto solo asigna presentación a las conocidas y un gris a cualquier otra.
export const CATEGORY_COLORS: Record<string, string> = {
  'Colegios': '#C9973F',
  'Centros de mujeres': '#B06A7E',
  'Centros de varones': '#6E8FB8',
  'Residencias universitarias': '#8A7BB8',
  'Universidades': '#C25E3A',
  'Casa de retiros': '#5F9070',
  'Asociaciones juveniles': '#4E9CA8',
  'Escuelas de formación Técnica': '#A67C44',
  'Iglesias': '#C7A94E',
  'Centros culturales': '#5B84AE',
  'Oficinas de Información': '#7D8CA3',
  'Centros Médicos': '#B8524F',
  'Centros de promoción social': '#4F7D5A',
  'Clubes juveniles': '#3FA08A',
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? '#94A3B8';
}

export const RECIPIENT_LABELS: Record<string, string> = {
  femenino: 'Femenino',
  masculino: 'Masculino',
  mixto_programas_separados: 'Mixto / programas separados',
  no_consta: 'No consta',
  no_aplicable: 'No aplicable',
};
