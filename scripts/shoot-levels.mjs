// Screenshots a level from a few vantage points and reports its render budget.
// Usage: node scripts/shoot-levels.mjs <levelNum> [more levels...]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const levels = process.argv.slice(2).map(Number);
if (!levels.length) levels.push(10, 14);

const outDir = path.resolve('perf-results/levels');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});

const report = [];

for (const level of levels) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('text=ИГРАТЬ', { timeout: 60000 });
  await page.click('text=ИГРАТЬ');
  // The god cheat unlocks every level, then pick the requested one from the grid.
  await page.keyboard.type('god', { delay: 40 });
  await page.waitForTimeout(600);
  // Card corner label is `0${lvl<10?'0'+lvl:lvl}` (e.g. 010) and, unlike the big centre
  // label, does not change once the level is completed by the cheat.
  const cardLabel = `0${level < 10 ? `0${level}` : level}`;
  await page.click(`text=${cardLabel}`, { timeout: 60000 });
  await page.waitForFunction(() => !!window.__engine, null, { timeout: 300000 });
  await page.waitForFunction(() => window.__engine.levelTimeSec > 0.6, null, { timeout: 300000 });

  // Spawn room, then walk the camera forward through the level for a few vantage points.
  const shots = [
    { tag: 'spawn', dz: 0, yaw: 0 },
    { tag: 'room2', dz: -55, yaw: 0 },
    { tag: 'room3', dz: -110, yaw: 0.5 },
  ];
  for (const s of shots) {
    await page.evaluate(
      ({ dz, yaw }) => {
        const e = window.__engine;
        const spawn = e.levelData.playerSpawn;
        e.player.position.set(spawn.x, spawn.y + 1.2, spawn.z + dz);
        e.player.velocity.set(0, 0, 0);
        e.player.yaw = yaw;
        e.player.pitch = -0.02;
        e.player.camera.position.copy(e.player.position);
        e.player.camera.rotation.set(e.player.pitch, e.player.yaw, 0, 'YXZ');
      },
      { dz: s.dz, yaw: s.yaw }
    );
    await page.waitForTimeout(2200);
    await page.screenshot({ path: path.join(outDir, `lvl${level}-${s.tag}.png`) });
  }

  const info = await page.evaluate(() => {
    const e = window.__engine;
    const i = e.renderer.info;
    let meshes = 0;
    let lights = 0;
    e.levelData.scene.traverse((o) => {
      if (o.isMesh) meshes++;
      if (o.isLight) lights++;
    });
    return {
      biome: e.levelData.biomeName,
      calls: i.render.calls,
      triangles: i.render.triangles,
      programs: i.programs.length,
      geometries: i.memory.geometries,
      textures: i.memory.textures,
      sceneMeshes: meshes,
      sceneLights: lights,
      enemies: e.enemies.enemies.length,
    };
  });
  report.push({ level, info, errors: errors.slice(0, 6) });
  console.error(`lvl ${level}: ${info.biome} | calls ${info.calls} | meshes ${info.sceneMeshes} | lights ${info.sceneLights}`);
  await page.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
