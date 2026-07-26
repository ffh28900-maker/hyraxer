// Quick smoke test: load level, verify the sim runs, no console errors, screenshot.
// Usage: node scripts/smoke.mjs <label> [levelNum] [--combat]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const label = process.argv[2] || 'smoke';
const levelNum = Number(process.argv[3] || 1);
const combat = process.argv.includes('--combat');
const outDir = path.resolve('perf-results');
fs.mkdirSync(outDir, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('text=ИГРАТЬ', { timeout: 60000 });
  await page.click('text=ИГРАТЬ');
  await page.waitForSelector(`text=#${levelNum}`, { timeout: 60000 });
  await page.click(`text=#${levelNum}`);
  await page.waitForFunction(() => !!window.__engine, null, { timeout: 300000 });
  await page.waitForFunction(() => window.__engine.levelTimeSec > 0.5, null, { timeout: 300000 });
} catch (err) {
  await page.screenshot({ path: path.join(outDir, `${label}-fail.png`) }).catch(() => {});
  console.log(JSON.stringify({ label, failedAt: String(err), errors }, null, 2));
  await browser.close();
  process.exit(1);
}

if (combat) {
  await page.evaluate(() => {
    const e = window.__engine;
    e.player.moveInput.forward = true;
    e.isPrimaryMouseDown = true;
  });
  await page.waitForFunction(() => window.__engine.levelTimeSec > 3.0, null, { timeout: 300000 });
  await page.evaluate(() => {
    const e = window.__engine;
    e.player.moveInput.forward = false;
    e.isPrimaryMouseDown = false;
  });
}

const state = await page.evaluate(() => {
  const e = window.__engine;
  const info = e.renderer.info;
  return {
    levelTime: e.levelTimeSec,
    playerY: e.player.position.y,
    playerZ: e.player.position.z,
    enemies: e.enemies.enemies.length,
    calls: info.render.calls,
    triangles: info.render.triangles,
    programs: info.programs.length,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
  };
});
await page.screenshot({ path: path.join(outDir, `${label}.png`) });
await browser.close();

console.log(JSON.stringify({ label, state, errors: errors.slice(0, 10) }, null, 2));
if (errors.length > 0) process.exit(1);
