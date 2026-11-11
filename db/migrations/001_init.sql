-- Atlas de iniciativas · Opus Dei — esquema inicial (Fase 3)
-- PostgreSQL sin PostGIS: la geometría de países vive en el GeoJSON
-- generado por el pipeline; aquí se guarda el bbox de encuadre.

CREATE TABLE IF NOT EXISTS import_runs (
  id          BIGSERIAL PRIMARY KEY,
  file_name   TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS countries (
  code               TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  continent          TEXT,
  circumscription    TEXT,
  presence_evidence  TEXT,
  main_source        TEXT,
  note               TEXT,
  declared_total     INTEGER,
  declared_breakdown JSONB,
  bbox               JSONB,
  row_hash           TEXT NOT NULL,
  import_run_id      BIGINT REFERENCES import_runs(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS initiatives (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  category            TEXT NOT NULL,
  sex_raw             TEXT,
  recipients          TEXT,
  country_code        TEXT REFERENCES countries(code),
  country_name        TEXT,
  continent           TEXT,
  region              TEXT,
  region_raw          TEXT,
  locality            TEXT,
  locality_raw        TEXT,
  address             TEXT,
  address_raw         TEXT,
  postal_code         TEXT,
  phone               TEXT,
  web                 TEXT,
  email               TEXT,
  entity              TEXT,
  entity_raw          TEXT,
  linkage_type        TEXT,
  evidence            TEXT,
  verification_state  TEXT,
  activity_state      TEXT,
  activity_state_raw  TEXT,
  consulted_at        TEXT,
  source1_url         TEXT,
  source2_url         TEXT,
  double_check        TEXT,
  search_text         TEXT,
  lat                 DOUBLE PRECISION,
  lng                 DOUBLE PRECISION,
  precision           TEXT,
  geocoding_provider  TEXT,
  geoname_id          BIGINT,
  geocoded_at         TEXT,
  query_used          TEXT,
  review_status       TEXT,
  row_hash            TEXT NOT NULL,
  import_run_id       BIGINT REFERENCES import_runs(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_initiatives_country ON initiatives(country_code);
CREATE INDEX IF NOT EXISTS idx_initiatives_category ON initiatives(category);

CREATE TABLE IF NOT EXISTS sources (
  id            TEXT PRIMARY KEY,
  domain        TEXT,
  title         TEXT,
  url           TEXT,
  country       TEXT,
  nature        TEXT,
  consulted_at  TEXT,
  notes         TEXT,
  row_hash      TEXT NOT NULL,
  import_run_id BIGINT REFERENCES import_runs(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sources_url ON sources(url);

-- Relación iniciativa ↔ fuente SOLO por coincidencia exacta de URL
-- comprobable. Si una URL aparece duplicada en el catálogo de fuentes,
-- la relación es ambigua y no se crea (se cuenta en el informe de
-- importación). El enlace (source1_url/source2_url) se conserva siempre
-- en la iniciativa aunque no haya relación catalogada.
CREATE TABLE IF NOT EXISTS initiative_sources (
  initiative_id TEXT NOT NULL REFERENCES initiatives(id),
  source_id     TEXT NOT NULL REFERENCES sources(id),
  role          TEXT NOT NULL CHECK (role IN ('fuente_1', 'fuente_2')),
  match_method  TEXT NOT NULL DEFAULT 'url_exact',
  PRIMARY KEY (initiative_id, role)
);
