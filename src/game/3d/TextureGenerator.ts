import * as THREE from 'three';

export class TextureGenerator {
  private static canvasCache: Map<string, THREE.CanvasTexture> = new Map();

  // Helper to create canvas
  private static createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    return { canvas, ctx };
  }

  // 1. Chapter 1: Asphalt with Lava / Ember Cracks
  public static getAsphaltLavaTexture(): THREE.CanvasTexture {
    const cacheKey = 'asphalt_lava';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const { canvas, ctx } = this.createCanvas(512, 512);

    // Dark asphalt base
    ctx.fillStyle = '#181412';
    ctx.fillRect(0, 0, 512, 512);

    // Asphalt noise
    for (let i = 0; i < 20000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const gray = Math.floor(20 + Math.random() * 30);
      ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Concrete slab lines
    ctx.strokeStyle = '#0d0b0a';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, 256, 256);
    ctx.strokeRect(256, 0, 256, 256);
    ctx.strokeRect(0, 256, 256, 256);
    ctx.strokeRect(256, 256, 256, 256);

    // Glowing Lava Cracks
    ctx.shadowColor = '#ff3300';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#ff5500';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(80, 120);
    ctx.lineTo(150, 180);
    ctx.lineTo(220, 256);
    ctx.stroke();

    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(80, 120);
    ctx.lineTo(150, 180);
    ctx.stroke();

    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    this.canvasCache.set(cacheKey, texture);
    return texture;
  }

  // 2. Chapter 1 Walls: Dark Concrete with Cyber Poster / Russian Warning
  public static getCityWallTexture(): THREE.CanvasTexture {
    const cacheKey = 'city_wall';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const { canvas, ctx } = this.createCanvas(512, 512);

    // Dark concrete brick layout
    ctx.fillStyle = '#221a18';
    ctx.fillRect(0, 0, 512, 512);

    // Brick pattern
    ctx.strokeStyle = '#120d0b';
    ctx.lineWidth = 3;
    const bh = 32;
    const bw = 64;

    for (let y = 0; y < 512; y += bh) {
      const offsetX = (y / bh) % 2 === 0 ? 0 : bw / 2;
      for (let x = -bw; x < 512 + bw; x += bw) {
        ctx.strokeRect(x + offsetX, y, bw, bh);
      }
    }

    // Graffiti / Russian Neon Sign on wall
    ctx.font = '900 24px monospace';
    ctx.fillStyle = '#C41E3A';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 8;
    ctx.fillText('ДОМАНИЯ // ЗОНА 01', 40, 120);
    ctx.fillText('СЕКТОР ГНЕЗДА', 40, 280);

    // Hazard Stripes box
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(40, 320, 200, 10);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 2);
    this.canvasCache.set(cacheKey, texture);
    return texture;
  }

  // 3. Chapter 2: Subway Station Tiles & Tracks
  public static getSubwayTileTexture(): THREE.CanvasTexture {
    const cacheKey = 'subway_tile';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const { canvas, ctx } = this.createCanvas(512, 512);

    ctx.fillStyle = '#0a1622';
    ctx.fillRect(0, 0, 512, 512);

    // Tile grid
    ctx.strokeStyle = '#050c14';
    ctx.lineWidth = 4;
    const size = 32;
    for (let y = 0; y < 512; y += size) {
      for (let x = 0; x < 512; x += size) {
        ctx.strokeRect(x, y, size, size);
      }
    }

    // Cyan glowing conduit lines
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#00aaff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.stroke();

    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 4);
    this.canvasCache.set(cacheKey, texture);
    return texture;
  }

  // 4. Chapter 2 Floor: Subway Track Concrete with Rails
  public static getSubwayFloorTexture(): THREE.CanvasTexture {
    const cacheKey = 'subway_floor';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const { canvas, ctx } = this.createCanvas(512, 512);

    ctx.fillStyle = '#0f1820';
    ctx.fillRect(0, 0, 512, 512);

    // Yellow warning tactile edge
    ctx.fillStyle = '#eab308';
    ctx.fillRect(0, 0, 512, 40);
    ctx.fillRect(0, 472, 512, 40);

    // Steel Rails along center
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 150, 512, 12);
    ctx.fillRect(0, 350, 512, 12);

    // Wooden Sleepers
    ctx.fillStyle = '#221812';
    for (let x = 0; x < 512; x += 40) {
      ctx.fillRect(x, 120, 16, 270);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    this.canvasCache.set(cacheKey, texture);
    return texture;
  }

  // 5. Chapter 3: Dark Mine Rock Walls with Glowing Sulfur Ore
  public static getMineRockTexture(): THREE.CanvasTexture {
    const cacheKey = 'mine_rock';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const { canvas, ctx } = this.createCanvas(512, 512);

    ctx.fillStyle = '#141210';
    ctx.fillRect(0, 0, 512, 512);

    // Rock noise
    for (let i = 0; i < 15000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const v = Math.floor(10 + Math.random() * 30);
      ctx.fillStyle = `rgb(${v + 10},${v + 5},${v})`;
      ctx.fillRect(x, y, 3, 3);
    }

    // Glowing Amber Crystal veins
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffcc00';

    for (let c = 0; c < 12; c++) {
      const cx = Math.random() * 450 + 30;
      const cy = Math.random() * 450 + 30;
      ctx.beginPath();
      ctx.arc(cx, cy, 6 + Math.random() * 8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 3);
    this.canvasCache.set(cacheKey, texture);
    return texture;
  }

  // 6. Chapter 4: Obsidian Demon Runes & Lava
  public static getObsidianRuneTexture(): THREE.CanvasTexture {
    const cacheKey = 'obsidian_rune';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const { canvas, ctx } = this.createCanvas(512, 512);

    // Black obsidian
    ctx.fillStyle = '#0a0202';
    ctx.fillRect(0, 0, 512, 512);

    // Hexagonal stone block seams
    ctx.strokeStyle = '#1a0505';
    ctx.lineWidth = 4;
    for (let y = 0; y < 512; y += 64) {
      ctx.strokeRect(0, y, 512, 64);
    }

    // Demonic Glowing Runes
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#ff2200';
    ctx.lineWidth = 3;

    // Pentagram / Rune geometric lines
    ctx.beginPath();
    ctx.arc(256, 256, 120, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(256, 136);
    ctx.lineTo(200, 320);
    ctx.lineTo(340, 200);
    ctx.lineTo(172, 200);
    ctx.lineTo(312, 320);
    ctx.closePath();
    ctx.stroke();

    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    this.canvasCache.set(cacheKey, texture);
    return texture;
  }

  // 7. Secret Level 17: White Void Mirror Grid
  public static getWhiteVoidTexture(): THREE.CanvasTexture {
    const cacheKey = 'white_void';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const { canvas, ctx } = this.createCanvas(512, 512);

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 512, 512);

    // Cyan Neon Grid
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#00cccc';
    ctx.lineWidth = 2;

    const step = 64;
    for (let i = 0; i <= 512; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Glowing Node Points
    ctx.fillStyle = '#00ffff';
    for (let y = 0; y <= 512; y += step) {
      for (let x = 0; x <= 512; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    this.canvasCache.set(cacheKey, texture);
    return texture;
  }

  // 8. Sci-Fi Metallic Weapon / Robot Armor Texture
  public static getMetalArmorTexture(): THREE.CanvasTexture {
    const cacheKey = 'metal_armor';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const { canvas, ctx } = this.createCanvas(256, 256);

    ctx.fillStyle = '#262626';
    ctx.fillRect(0, 0, 256, 256);

    // Panel borders
    ctx.strokeStyle = '#121212';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 110, 110);
    ctx.strokeRect(130, 10, 110, 110);
    ctx.strokeRect(10, 130, 110, 110);
    ctx.strokeRect(130, 130, 110, 110);

    // Rivets
    ctx.fillStyle = '#888888';
    const rivets = [[15, 15], [115, 15], [15, 115], [115, 115], [135, 15], [235, 15]];
    for (const [rx, ry] of rivets) {
      ctx.beginPath();
      ctx.arc(rx, ry, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.canvasCache.set(cacheKey, texture);
    return texture;
  }
}
