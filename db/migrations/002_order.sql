-- Orden original del archivo (posición en el Excel / artefacto generado).
-- La API sirve las filas en este orden: la interfaz no debe reordenar el
-- directorio respecto a su fuente.
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS ord INTEGER;
ALTER TABLE countries   ADD COLUMN IF NOT EXISTS ord INTEGER;
ALTER TABLE sources     ADD COLUMN IF NOT EXISTS ord INTEGER;
