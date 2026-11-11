# Pendientes — Atlas de iniciativas · Opus Dei

Documento único de pendientes. Actualizado: 2026-11-11 (Fase 2 CERTIFICADA; Fase 3 entregada para revisión).

## Revisión de la Fase 2 (2026-11-11) — CERTIFICADA
- [x] MapLibre GL JS actualizado a 6.17.0 (GHSA-jrc7-96c5-q579) con la URL del worker fijada; auditoría contrastada en OSV: 0 vulnerabilidades en el lockfile.
- [x] Recorrido funcional reproducible desde clon limpio (Playwright como devDependency, navegador administrado, sin rutas absolutas, servidor propio).
- [x] Historial atrás/adelante implementado (pushState/popstate) y cubierto en el recorrido: 21/21 PASS con capturas regeneradas.
- [x] SwiftShader ya no se fuerza en el recorrido (en Windows rompía WebGL): es opt-in con `ATLAS_FORCE_SWIFTSHADER=1`. Reverificado desde copia limpia sin variables especiales: 21/21 PASS.
- [x] Fase 2 certificada por la revisión independiente sobre clon de main (e9a9d2a) en Windows.

## Fase 3 (2026-11-11) — entregada para revisión
- [x] Esquema PostgreSQL (migraciones 001-002), importador transaccional e idempotente con informe de altas/cambios/ausentes sin borrado.
- [x] Catálogo de fuentes importado (2.626) y relaciones solo por URL exacta: 2.164 (3 ambiguas por URL duplicada, no creadas).
- [x] API Fastify completa y web leyendo de la API; humo 13/13 y recorrido 21/21.
- [x] Bloqueo de integridad corregido: `sourceSha256` en los artefactos y verificación previa en el importador (aborta sin crear corrida si no coincide); prueba reproducible `npm run test:integrity` 6/6.
- [ ] Certificación de la Fase 3 por la revisión. La Fase 4 no comienza hasta entonces.

## Decisiones
- [x] D1–D6 aprobadas y aplicadas. D1: Fuente 1/2 visibles en ficha aunque no haya coincidencia catalogada.
- [ ] **D7 provisional:** en Fase 6, comprobar primero base + usuario propios en el PostgreSQL existente antes de decidir otro contenedor. Servidor por reverificar. Ruta base ya configurable (`VITE_BASE_PATH`).

## Dependencias externas
- [ ] Clave **CARTO** (API key con restricción de dominio) si se adopta su mapa base. Sin ella: base local Natural Earth en oscuro, sin calles ni etiquetas de texto en el mapa.
- [ ] Proveedor + credencial de geocodificación con precisión `address` (por decidir). Resolución actual: `locality` con GeoNames (942 resueltas, 79 ambiguas, 356 sin coincidencia, 5 sin localidad).

## Datos
- [ ] 356 registros sin coincidencia, en gran parte por textos de localidad compuestos (barrio/ciudad, ciudad + provincia). Cualquier regla nueva para tratarlos debe revisarse antes de aplicarse.
- [ ] Completar la descarga del extracto GeoNames de Rusia (truncado en caché); hoy no afecta: RU-01 se resolvió en primera pasada.
- [ ] 102 Fuente 1 y 134 Fuente 2 con URL no catalogada: enlace conservado en ficha; relación catalogada solo con coincidencia exacta de URL — hecho en la Fase 3 (2.164 relaciones; 3 ambiguas por URL duplicada).
- [ ] V32-102 y V32-103 sin URL/país/fecha en origen: se importan tal cual (Fase 3).

## Fases siguientes (no anticipar)
- [ ] Fase 4: visor web, fichas documentales completas (evidencia y doble comprobación ya viajan en el detalle de la API), contexto de país, fuentes relacionadas en la ficha.
- [ ] Fase 5: PWA, etiquetas/acabado del mapa (glifos), optimización del chunk cartográfico (~1,6 MB diferido).
- [ ] Fase 6: despliegue en Oracle (reverificar servidor; decisión D7).
