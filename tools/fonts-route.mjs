// Serves the Google Fonts request from local @fontsource copies so headless screenshots show
// the real typefaces (the sandbox cannot reach fonts.googleapis.com).
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../node_modules/@fontsource/', import.meta.url).pathname;
const sheets = [['hahmlet', [400, 700, 800]], ['gowun-batang', [400, 700]]];

export async function routeFonts(page) {
  if (!existsSync(root)) return;
  let css = '';
  for (const [pkg, weights] of sheets) {
    for (const w of weights) {
      const f = `${root}${pkg}/${w}.css`;
      if (existsSync(f)) css += readFileSync(f, 'utf8').replace(/url\(\.\/files\//g, `url(https://local-fonts.test/${pkg}/files/`);
    }
  }
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: css }));
  await page.route('https://local-fonts.test/**', (r) => {
    const p = new URL(r.request().url()).pathname;
    const file = root + p.slice(1);
    if (!existsSync(file)) return r.fulfill({ status: 404 });
    return r.fulfill({ contentType: p.endsWith('woff2') ? 'font/woff2' : 'font/woff', body: readFileSync(file) });
  });
}
