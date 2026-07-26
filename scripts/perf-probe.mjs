// Headless performance probe for the game (dev server must be running on :3000).
// Usage: node scripts/perf-probe.mjs <label> [levelNum]
// Writes JSON results to perf-results/<label>.json and screenshots next to it.
//
// NOTE: headless SwiftShader GPU timings are NOT representative of real GPUs.
// Comparable metrics across runs: frame-delta stats, draw calls, program count,
// geometry/texture memory counts (leak detection).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const label = process.argv[2] || 'run';
const levelNum = Number(process.argv[3] || 1);
const outDir = path.resolve('perf-results');
fs.mkdirSync(outDir, { recursive: true });

const consoleErrors = [];
const pageErrors = [];

function stats(deltas) {
  const s = [...deltas].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  const pick = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return {
    frames: s.length,
    avgMs: +(sum / s.length).toFixed(3),
    p50: +pick(0.5).toFixed(3),
    p95: +pick(0.95).toFixed(3),
    p99: +pick(0.99).toFixed(3),
    maxMs: +s[s.length - 1].toFixed(3),
  };
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(String(err)));

const step = (msg) => console.error(`[probe ${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
const t0 = Date.now();

await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('text=ИГРАТЬ', { timeout: 60000 });
await page.screenshot({ path: path.join(outDir, `${label}-menu.png`) });
step('menu ready');

await page.click('text=ИГРАТЬ');
await page.waitForSelector(`text=#${levelNum}`, { timeout: 30000 });
step('level select ready');
await page.click(`text=#${levelNum}`);
step('level clicked');

// Wait for the engine to exist and the first frames to render (level gen + shader prewarm).
await page.waitForFunction(() => !!window.__engine, null, { timeout: 300000 });
step('engine exists');
await page.waitForFunction(() => window.__engine.levelTimeSec > 0.2, null, { timeout: 300000 });
step('simulation running');
await page.waitForTimeout(2000);

// Sample N frame deltas via rAF; optionally drive inputs each frame.
const sample = (mode, frames) =>
  page.evaluate(
    ({ mode, frames }) =>
      new Promise((resolve) => {
        const e = window.__engine;
        const deltas = [];
        let last = performance.now();
        if (mode === 'combat') {
          e.player.moveInput.forward = true;
          e.isPrimaryMouseDown = true;
        }
        const tick = (now) => {
          deltas.push(now - last);
          last = now;
          if (mode === 'combat') {
            e.player.mouseDelta.x += 4; // continuous look-around
          }
          if (deltas.length >= frames) {
            if (mode === 'combat') {
              e.player.moveInput.forward = false;
              e.isPrimaryMouseDown = false;
            }
            resolve(deltas.slice(1));
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { mode, frames }
  );

const rendererInfo = () =>
  page.evaluate(() => {
    const info = window.__engine.renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs.length,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  });

const idle = stats(await sample('idle', 300));
step(`idle sampled: avg ${idle.avgMs}ms`);
const infoIdle = await rendererInfo();
const combat = stats(await sample('combat', 300));
step(`combat sampled: avg ${combat.avgMs}ms`);
const infoCombat = await rendererInfo();
await page.screenshot({ path: path.join(outDir, `${label}-level.png`) });

// Leak probe: weapon switches + grapple presses, then compare memory counts.
const memBefore = await rendererInfo();
await page.evaluate(async () => {
  const e = window.__engine;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const weapons = ['peacemaker', 'trembler', 'punisher'];
  for (let i = 0; i < 10; i++) {
    e.switchWeapon(weapons[i % 3]);
    await sleep(60);
  }
  e.switchWeapon('peacemaker');
  for (let i = 0; i < 10; i++) {
    e.handleGrapple();
    await sleep(150);
  }
});
await page.waitForTimeout(1500);
const memAfterGadgets = await rendererInfo();
step('gadget leak probe done');

// Restart probe: R restarts the level (fresh engine); repeat 2x, then compare counts.
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => { window.__engine.levelTimeSec = 0; });
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.__engine && window.__engine.levelTimeSec > 0.2, null, { timeout: 300000 });
  step(`restart ${i + 1} done`);
}
await page.waitForTimeout(2000);
const memAfterRestarts = await rendererInfo();

const result = {
  label,
  levelNum,
  date: new Date().toISOString(),
  idle,
  infoIdle,
  combat,
  infoCombat,
  leakProbe: { memBefore, memAfterGadgets, memAfterRestarts },
  consoleErrors: consoleErrors.slice(0, 20),
  pageErrors: pageErrors.slice(0, 20),
};

fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
