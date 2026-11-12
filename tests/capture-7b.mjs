// Capturas de entrega de la Fase 7B (no forma parte de la batería):
// escritorio (mundo, país, iniciativa, documentación desplegada, visor)
// y móvil (mundo colapsado, resultados, iniciativa) contra el preview
// local de producción. Salida: docs/fase-7b/.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'fase-7b');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.ATLAS_BASE ?? 'http://localhost:4173/';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: 'load' });
await page.getByText('1.382 iniciativas').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(6500);
await page.screenshot({ path: join(OUT, 'despues-mundo.png') });

await page.getByRole('button', { name: /Explorar por país/ }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /^España/ }).first().click();
await page.waitForTimeout(2600);
// Vista de país aprobada: tarjeta del país + tira, sin el inventario abierto
await page.getByRole('button', { name: /países y categorías/ }).click();
await page.evaluate(() => { const col = document.querySelector('div[class*="w-[344px]"]'); if (col) col.scrollTop = 0; });
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, 'despues-pais.png') });
// Para filtrar hay que reabrir el panel de exploración
await page.getByRole('button', { name: /Categorías/ }).first().click();
await page.waitForTimeout(600);

await page.getByRole('checkbox', { name: /Colegios/ }).check();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /Colegio Tajamar/ }).first().click();
await page.getByRole('heading', { name: 'Colegio Tajamar' }).waitFor({ timeout: 10000 });
await page.getByRole('heading', { name: 'Evidencia de vinculación' }).waitFor({ timeout: 10000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: join(OUT, 'despues-iniciativa.png') });

// Documentación desplegada: la ficha ya nace con la sección 03 abierta;
// se captura el bloque documental acercando la vista a la tarjeta.
const article = page.getByRole('article');
await article.evaluate((el) => {
  const section = [...el.querySelectorAll('section')].find((s) => s.getAttribute('aria-label') === 'Evidencia y fuentes');
  section?.scrollIntoView({ block: 'start' });
});
await page.waitForTimeout(700);
await page.screenshot({ path: join(OUT, 'despues-documentacion.png') });

await page.getByRole('button', { name: 'Ver en el visor' }).first().click();
await page.getByRole('dialog').waitFor({ timeout: 10000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, 'despues-visor.png') });
await page.getByRole('button', { name: 'Cerrar visor' }).click();
await page.close();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
await mobile.goto(BASE, { waitUntil: 'load' });
await mobile.locator('text=1.382 iniciativas').locator('visible=true').first().waitFor({ timeout: 30000 });
await mobile.waitForTimeout(6000);
await mobile.screenshot({ path: join(OUT, 'despues-movil-mundo.png') });
await mobile.getByRole('tab', { name: 'resultados' }).click();
await mobile.waitForTimeout(900);
await mobile.screenshot({ path: join(OUT, 'despues-movil-resultados.png') });
await mobile.getByRole('button', { name: /Colegio Tajamar|Colegio/ }).first().click().catch(() => undefined);
await mobile.waitForTimeout(900);
await mobile.screenshot({ path: join(OUT, 'despues-movil-iniciativa.png') });
await mobile.close();

await browser.close();
console.log('Capturas de la Fase 7B en', OUT);
