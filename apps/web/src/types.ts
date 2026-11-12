export interface Initiative {
  id: string;
  name: string;
  category: string;
  sexRaw: string | null;
  recipients: string;
  country: string;
  countryCode: string;
  continent: string;
  region: string | null;
  regionRaw: string | null;
  locality: string | null;
  localityRaw: string | null;
  address: string | null;
  addressRaw: string | null;
  postalCode: string | null;
  phone: string | null;
  web: string | null;
  entity: string | null;
  entityRaw: string | null;
  linkageType: string | null;
  /** Solo en el detalle de la API (GET /api/initiatives/:id); el catálogo ligero no lo trae. */
  evidence?: string | null;
  verificationState: string;
  activityStateRaw: string | null;
  activityState: string;
  consultedAt: string | null;
  source1: string | null;
  source2: string | null;
  /** Solo en el detalle de la API (GET /api/initiatives/:id); el catálogo ligero no lo trae. */
  doubleCheck?: string | null;
  email: string | null;
  searchText: string;
  lat: number | null;
  lng: number | null;
  precision: 'address' | 'locality' | 'region' | 'country' | 'unknown';
  geocodingProvider: string | null;
  geonameId: number | null;
  geocodedAt: string | null;
  queryUsed: string | null;
  reviewStatus: string;
}

export interface SourceInfo {
  id: string;
  domain: string | null;
  title: string | null;
  url: string | null;
  country: string | null;
  nature: string | null;
  consultedAt: string | null;
  notes: string | null;
}

export interface CatalogedSource {
  role: 'fuente_1' | 'fuente_2';
  matchMethod: string;
  source: SourceInfo;
}

/** Ficha completa que sirve GET /api/initiatives/:id (Fases 3-4). */
export interface InitiativeDetail extends Initiative {
  evidence: string | null;
  doubleCheck: string | null;
  catalogedSources: CatalogedSource[];
}

export interface Country {
  name: string;
  code: string;
  continent: string;
  circumscription: string | null;
  presenceEvidence: string | null;
  mainSource: string | null;
  note: string | null;
  declaredTotal: number | null;
  declaredBreakdown: Record<string, number | null>;
  computedTotal: number;
  computedLocated: number;
  computedVerification: Record<string, number>;
  bbox: [number, number, number, number] | null;
}

export interface CatalogMeta {
  sourceFile: string;
  generatedAt: string;
  totalInitiatives: number;
  totalCountries: number;
  categories: string[];
  continents: string[];
  verificationStates: string[];
  located: number;
  geoStats: Record<string, number>;
  attribution: string;
  naturalEarthMissingCodes: string[];
}

export interface Catalog {
  meta: CatalogMeta;
  countries: Country[];
  initiatives: Initiative[];
}
