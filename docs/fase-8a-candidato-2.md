# Fase 8A — Verificación del v15-candidato-2 (2026-11-12)

Jon envió una segunda versión del candidato
(`Directorio_Opus_Dei_MUNDIAL_v15-2.xlsx`, 2.231.585 bytes,
SHA-256 `28938f7051195b35cb7f603b064a77496759d99eb0d3dc2f5fa17c23c3673c54`),
copiada sin cambios a
`data/source/Directorio_Opus_Dei_MUNDIAL_v15-candidato-2.xlsx`,
declarando dos operaciones: (1) eliminar las cuatro columnas
nuevas que no aportan valor (Nombre alternativo, Categorías
adicionales, Web específica, Google Maps) y (2) eliminar la
categoría «Otros» y sus dos registros.

## Resultado de la verificación

### 1. Columnas: CONFIRMADO

El Directorio del candidato-2 tiene las **23 columnas del
v14, con nombres y orden idénticos**. Las cuatro columnas
nuevas han desaparecido. Consecuencia directa: **el
bloqueante técnico principal de la 8A desaparece** — el
generador vuelve a leer cada campo en su posición correcta
con la estructura actual. Quedan solo las aserciones con las
cifras del v14 (1.382/70), que la 8B debe convertir en la
versión explícita del directorio, y la decisión sobre qué
hacer con el contenido que esas columnas llevaban (ya no
existe en el fichero: se descarta con el candidato).

### 2. «Otros»: NO aplicado en este fichero

`ES-294` (Fundación Brafa — Escuela deportiva) y `PH-064`
(Theological Centrum) **siguen presentes y siguen
categorizados como «Otros»**. La comparación celda a celda
del Directorio entre candidato-1 y candidato-2 (las 23
columnas comunes × 1.377 registros) da **cero diferencias**:
entre ambos ficheros solo cambia la estructura de columnas.
La eliminación de los dos registros no llegó a este archivo
(posible causa: guardado de otra copia o edición no
volcada); no se ha aplicado ninguna corrección por nuestra
parte, a la espera del fichero corregido.

Si los dos registros se eliminan, el efecto previsto sobre
la migración es: 1.377 → **1.375 registros**; de los dos,
solo ES-294 tenía punto en el v14 (PH-064 no), por lo que
«con punto» pasaría de 936 a **935** en la proyección de
la 8A.

### 3. El resto de la auditoría 8A sigue vigente, sin cambios

Al ser los datos idénticos a los del candidato-1, todas las
demás conclusiones del informe
`docs/fase-8a-comparativa-v14-v15.md` se mantienen tal cual:
5 bajas documentadas (con la desaparición de República
Dominicana), 251 modificados, contrastados 16 → 48,
AU-08 como único que pierde punto, Sexo en texto libre
(17 valores, 23 registros), deriva de Fuente 2 sin URL
exacta (sin coincidencia 134 → 174) y la discrepancia
heredada de Puerto Rico en la hoja Países.

## Estado de las decisiones tras el candidato-2

- ✅ Resuelta por el propio fichero: las 4 columnas nuevas
  (descartadas) y, con ellas, el bloqueante posicional.
- ⏳ Pendiente de reenvío: la eliminación de «Otros» y sus
  dos registros.
- ⏳ Siguen abiertas: confirmación de la desaparición de
  República Dominicana, Sexo (lista cerrada + nota o texto
  libre), Fuente 2 sin URL exacta, corrección manual de
  AU-08 y el «Confirmado» suelto de PR-06.

La Fase 8B sigue sin iniciarse.
