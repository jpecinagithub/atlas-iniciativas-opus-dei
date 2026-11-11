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
  evidence: string | null;
  verificationState: string;
  activityStateRaw: string | null;
  activityState: string;
  consultedAt: string | null;
  source1: string | null;
  source2: string | null;
  doubleCheck: string | null;
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
