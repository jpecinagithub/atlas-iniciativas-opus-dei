# Pendientes — Atlas de iniciativas · Opus Dei

Documento único de pendientes. Actualizado: 2026-11-11 (Fase 2 corregida tras la revisión independiente; pendiente de recertificación).

## Revisión de la Fase 2 (2026-11-11)
- [x] MapLibre GL JS actualizado a 6.17.0 (GHSA-jrc7-96c5-q579) con la URL del worker fijada; auditoría contrastada en OSV: 0 vulnerabilidades en el lockfile.
- [x] Recorrido funcional reproducible desde clon limpio (Playwright como devDependency, navegador administrado, sin rutas absolutas, servidor propio).
- [x] Historial atrás/adelante implementado (pushState/popstate) y cubierto en el recorrido: 21/21 PASS con capturas regeneradas.
- [ ] Recertificación de la Fase 2 por la revisión independiente. La Fase 3 no comienza hasta entonces.

## Decisiones
- [x] D1–D6 aprobadas y aplicadas. D1: Fuente 1/2 visibles en ficha aunque no haya coincidencia catalogada.
- [ ] **D7 provisional:** en Fase 6, comprobar primero base + usuario propios en el PostgreSQL existente antes de decidir otro contenedor. Servidor por reverificar. Ruta base ya configurable (`VITE_BASE_PATH`).

## Dependencias externas
- [ ] Clave **CARTO** (API key con restricción de dominio) si se adopta su mapa base. Sin ella: base local Natural Earth en oscuro, sin calles ni etiquetas de texto en el mapa.
- [ ] Proveedor + credencial de geocodificación con precisión `address` (por decidir). Resolución actual: `locality` con GeoNames (942 resueltas, 79 ambiguas, 356 sin coincidencia, 5 sin localidad).

## Datos
- [ ] 356 registros sin coincidencia, en gran parte por textos de localidad compuestos (barrio/ciudad, ciudad + provincia). Cualquier regla nueva para tratarlos debe revisarse antes de aplicarse.
- [ ] Completar la descarga del extracto GeoNames de Rusia (truncado en caché); hoy no afecta: RU-01 se resolvió en primera pasada.
- [ ] 102 Fuente 1 y 134 Fuente 2 con URL no catalogada: enlace conservado en ficha; relación catalogada solo con coincidencia comprobable (Fase 3/4).
- [ ] V32-102 y V32-103 sin URL/país/fecha en origen: se importan tal cual (Fase 3).

## Fases siguientes (no anticipar)
- [ ] Fase 3: PostgreSQL, API completa, importación transaccional e idempotente, catálogo de fuentes.
- [ ] Fase 4: visor web, fichas documentales completas, contexto de país, fuentes relacionadas.
- [ ] Fase 5: PWA, etiquetas/acabado del mapa (glifos), optimización del chunk cartográfico (~1,6 MB diferido).
- [ ] Fase 6: despliegue en Oracle (reverificar servidor; decisión D7).
