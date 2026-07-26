// Screenshots each enemy type in the secret bestiary gallery (level 99), where every mob
// stands still on a pedestal. Usage: node scripts/shoot-mobs.mjs [type ...]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const angleDeg = Number(process.env.ANGLE || 0); // 0 = front, 90 = right side, 180 = behind
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const types = wanted.length
  ? wanted
  : ['doman_miner', 'doman_dynamiter', 'doman_archer', 'imp_doman', 'winged_doman', 'skeleton_doman'];

const outDir = path.resolve('perf-results/mobs');
fs.mkdirSync(outDir, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('text=ИГРАТЬ', { timeout: 60000 });
await page.click('text=ИГРАТЬ');
await page.waitForSelector('text=СЕКРЕТНАЯ ВЫСТАВКА', { timeout: 60000 });
await page.click('text=СЕКРЕТНАЯ ВЫСТАВКА');
await page.waitForFunction(() => !!window.__engine, null, { timeout: 300000 });
await page.waitForFunction(() => window.__engine.levelTimeSec > 0.5, null, { timeout: 300000 });
console.error('gallery loaded');

const present = await page.evaluate(() => window.__engine.enemies.enemies.map((e) => e.type));
console.error('types in gallery:', JSON.stringify(present));

for (const type of types) {
  // Park the camera a few metres in front of the mob, at chest height, looking at it.
  const placed = await page.evaluate(
    ({ type, angleDeg }) => {
      const e = window.__engine;
      const enemy = e.enemies.enemies.find((x) => x.type === type);
      if (!enemy) return false;
      const p = enemy.position;
      const rad = (angleDeg * Math.PI) / 180;
      const dist = 3.4;
      e.player.position.set(p.x + Math.sin(rad) * dist, p.y + 1.5, p.z + Math.cos(rad) * dist);
      e.player.velocity.set(0, 0, 0);
      e.player.yaw = -rad;
      e.player.pitch = -0.16;
      e.player.camera.position.copy(e.player.position);
      e.player.camera.rotation.set(e.player.pitch, e.player.yaw, 0, 'YXZ');
      return true;
    },
    { type, angleDeg }
  );
  if (!placed) {
    console.error(`SKIP ${type}: not in gallery`);
    continue;
  }
  // Let a few frames render with the camera in place (and the mob turn to face us).
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, `${type}${angleDeg ? '-' + angleDeg : ''}.png`) });
  console.error(`shot ${type}`);
}

const info = await page.evaluate(() => {
  const i = window.__engine.renderer.info;
  return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries };
});
await browser.close();
console.log(JSON.stringify({ info, errors: errors.slice(0, 8) }, null, 2));
