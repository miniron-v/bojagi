// Bundles src/ into single-file HTML:
//   dist/index.html    — standalone page (doctype, viewport) for GitHub Pages / local play
//   dist/artifact.html — body fragment for the claude.ai Artifact host (it supplies the skeleton)
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

const js = await build({
  entryPoints: [new URL('src/ui/main.js', root).pathname],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020', 'safari14'],
  write: false,
  legalComments: 'none',
});
const code = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = (await build({
  entryPoints: [new URL('src/ui/style.css', root).pathname],
  minify: true,
  write: false,
  loader: { '.css': 'css' },
})).outputFiles[0].text;

const template = await read('src/index.html');
const fragment = template.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => code);
const split = fragment.indexOf('<div id="app">');
const headPart = fragment.slice(0, split);
const bodyPart = fragment.slice(split);
const full = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
${headPart}</head>
<body>
${bodyPart}
</body>
</html>
`;
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/artifact.html', root), fragment);
await writeFile(new URL('dist/index.html', root), full);
console.log(`built: js ${(code.length / 1024).toFixed(1)}KB, css ${(css.length / 1024).toFixed(1)}KB`);
