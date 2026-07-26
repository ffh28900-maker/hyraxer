// Builds a single self-contained HTML file of the game (runs from file://).
// Usage: node scripts/build-standalone.mjs  ->  saviour-of-domania.html
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

execSync('npx vite build --config vite.standalone.config.ts', { stdio: 'inherit' });

const dist = path.resolve('dist-standalone');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

// Inline the JS module
html = html.replace(/<script type="module"[^>]*src="\/(assets\/[^"]+\.js)"[^>]*><\/script>/, (_, src) => {
  const js = fs.readFileSync(path.join(dist, src), 'utf8');
  return `<script type="module">${js}</script>`;
});

// Inline the stylesheet
html = html.replace(/<link rel="stylesheet"[^>]*href="\/(assets\/[^"]+\.css)"[^>]*>/, (_, href) => {
  const css = fs.readFileSync(path.join(dist, href), 'utf8');
  return `<style>${css}</style>`;
});

if (html.includes('src="/assets/') || html.includes('href="/assets/')) {
  throw new Error('Un-inlined asset reference remains in the HTML');
}

const out = path.resolve('saviour-of-domania.html');
fs.writeFileSync(out, html);
console.log(`Wrote ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
