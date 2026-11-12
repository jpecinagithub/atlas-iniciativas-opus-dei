/**
 * Normalización de URLs externas del directorio.
 *
 * Los campos de enlace del Excel no son URLs garantizadas: de 6.205
 * valores externos, 85 no traen esquema — dominios desnudos
 * («www.paloblanco.org»), algunos con comillas tipográficas finales
 * («www.tahilan.org”») y hasta textos documentales completos en campos
 * de fuente (BR-10, CL-16). Usar el valor tal cual como href o como src
 * de un iframe convertiría un dominio desnudo en una ruta INTERNA de la
 * app y un texto en un enlace roto.
 *
 * Regla única para toda la app (enlaces externos):
 * - Se recortan espacios y comillas (tipográficas o rectas) finales.
 * - Con esquema: solo se admiten http: y https: (javascript:, data: y
 *   demás se rechazan).
 * - Sin esquema: solo si es un dominio reconocible (con su ruta
 *   opcional, sin espacios) se le antepone https://.
 * - Cualquier otra cosa devuelve null: el valor original se sigue
 *   mostrando como texto, pero no se crea enlace con él.
 */
const TRAILING_JUNK = /[\s"'“”‘’]+$/;
const BARE_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:[/?#]\S*)?$/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function normalizeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(TRAILING_JUNK, '');
  if (!cleaned) return null;
  if (HAS_SCHEME.test(cleaned)) {
    try {
      const url = new URL(cleaned);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }
  if (/\s/.test(cleaned) || !BARE_DOMAIN.test(cleaned)) return null;
  try {
    return new URL(`https://${cleaned}`).href;
  } catch {
    return null;
  }
}
