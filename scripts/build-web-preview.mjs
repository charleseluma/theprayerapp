// Builds one self-contained HTML file (web-preview/index.html) from `expo export --platform web`.
// JavaScript and audio are inlined so the preview works from any host, including a Claude artifact.
// Usage: npx expo export --platform web --output-dir dist && node scripts/build-web-preview.mjs
import { readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const jsDir = join(dist, '_expo/static/js/web');
const bundleFile = readdirSync(jsDir).find((f) => f.endsWith('.js'));
let js = readFileSync(join(jsDir, bundleFile), 'utf8');

// Swap every exported asset path ("/assets/...") for a data: URI.
const mime = { mp3: 'audio/mpeg', m4a: 'audio/mp4', png: 'image/png', jpg: 'image/jpeg', ttf: 'font/ttf' };
js = js.replace(/"(\/assets\/[^"]+)"/g, (match, path) => {
  const file = join(dist, path);
  try {
    statSync(file);
  } catch {
    return match;
  }
  const ext = path.split('.').pop().toLowerCase();
  return `"data:${mime[ext] ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}"`;
});
js = js.replace(/<\/script/gi, '<\\/script');

const html = `<title>The Prayer App</title>
<meta name="theme-color" content="#A8742F">
<style>
  :root { --bg: #F6F1E9; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #16140F; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg: #16140F; color-scheme: dark; }
  html, body { height: 100%; }
  body { overflow: hidden; background: var(--bg); }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<div id="root"></div>
<script>${js}</script>
`;

mkdirSync('web-preview', { recursive: true });
writeFileSync('web-preview/index.html', html);
console.log(`web-preview/index.html (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
