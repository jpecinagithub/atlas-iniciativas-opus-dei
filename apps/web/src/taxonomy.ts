/**
 * Taxonomía visible del Atlas (Fase 8C): las 14 categorías canónicas
 * del dato se presentan agrupadas en SEIS familias comprensibles.
 *
 * Este módulo es el ÚNICO lugar que define familia, categorías
 * miembro, color de familia, variaciones por categoría, orden,
 * etiqueta y descripción. La selección real sigue siendo el conjunto
 * de categorías canónicas (store, URL e historial no cambian): las
 * familias son solo una capa de presentación. Ningún componente debe
 * duplicar este mapeo.
 *
 * El color nunca es el único canal: cada familia y categoría se
 * muestra siempre con su nombre en texto.
 */
export interface Family {
  /** Clave estable de la familia (presentación; nunca se persiste). */
  id: string;
  /** Etiqueta visible de la familia. */
  label: string;
  /** Descripción breve para el panel de filtros. */
  description: string;
  /** Color principal de la familia (mapa, filtros, chips, fichas). */
  color: string;
  /** Categorías canónicas miembro, en orden de presentación. */
  categories: readonly string[];
  /** Variación moderada del color de familia por categoría. */
  categoryColors: Readonly<Record<string, string>>;
}

export const FAMILIES: readonly Family[] = [
  {
    id: 'educacion',
    label: 'Educación',
    description: 'Colegios, universidades y formación técnica',
    color: '#D9A13B',
    categories: ['Colegios', 'Universidades', 'Escuelas de formación Técnica'],
    categoryColors: {
      'Colegios': '#D9A13B',
      'Universidades': '#C08A2D',
      'Escuelas de formación Técnica': '#E5BC60',
    },
  },
  {
    id: 'centros-residencias',
    label: 'Centros y residencias',
    description: 'Centros de mujeres y de varones, centros culturales y residencias',
    color: '#6E8FB8',
    categories: ['Centros de mujeres', 'Centros de varones', 'Centros culturales', 'Residencias universitarias'],
    categoryColors: {
      'Centros de mujeres': '#83A8CC',
      'Centros de varones': '#5B84AE',
      'Centros culturales': '#9AB8D8',
      'Residencias universitarias': '#6E8FB8',
    },
  },
  {
    id: 'juventud',
    label: 'Juventud',
    description: 'Asociaciones y clubes juveniles',
    color: '#35B5AC',
    categories: ['Asociaciones juveniles', 'Clubes juveniles'],
    categoryColors: {
      'Asociaciones juveniles': '#35B5AC',
      'Clubes juveniles': '#63C7BE',
    },
  },
  {
    id: 'accion-social-salud',
    label: 'Acción social y salud',
    description: 'Promoción social y centros médicos',
    color: '#55A868',
    categories: ['Centros de promoción social', 'Centros Médicos'],
    categoryColors: {
      'Centros de promoción social': '#55A868',
      'Centros Médicos': '#7BC47F',
    },
  },
  {
    id: 'espiritualidad',
    label: 'Espiritualidad y convivencia',
    description: 'Casas de retiros e iglesias',
    color: '#C7A94E',
    categories: ['Casa de retiros', 'Iglesias'],
    categoryColors: {
      'Casa de retiros': '#BFA05A',
      'Iglesias': '#D6BE6E',
    },
  },
  {
    id: 'informacion',
    label: 'Información institucional',
    description: 'Oficinas de información',
    color: '#8494AB',
    categories: ['Oficinas de Información'],
    categoryColors: {
      'Oficinas de Información': '#8494AB',
    },
  },
];

/** Familia de cada categoría canónica (las 14, exactamente una vez). */
export const CATEGORY_FAMILY: Readonly<Record<string, Family>> = Object.fromEntries(
  FAMILIES.flatMap((f) => f.categories.map((c) => [c, f] as const)),
);

export function familyOf(category: string): Family | undefined {
  return CATEGORY_FAMILY[category];
}

/** Color principal de una familia por su clave. */
export function familyColor(familyId: string): string {
  return FAMILIES.find((f) => f.id === familyId)?.color ?? '#94A3B8';
}

/**
 * Color de una categoría: la variación moderada del color de su
 * familia (se percibe del mismo grupo cromático). Gris para cualquier
 * categoría desconocida (el dato manda; esto solo presenta).
 */
export function categoryColor(category: string): string {
  const fam = CATEGORY_FAMILY[category];
  return fam?.categoryColors[category] ?? fam?.color ?? '#94A3B8';
}

/** Índice de familia (0–5) para las propiedades del mapa; −1 si no consta. */
export function familyIndex(category: string): number {
  const fam = CATEGORY_FAMILY[category];
  return fam ? FAMILIES.indexOf(fam) : -1;
}
