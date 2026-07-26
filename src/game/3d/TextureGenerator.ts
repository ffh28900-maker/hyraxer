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

  // Optimized Texture Finalizer - Enforces Mipmapping, High Anisotropy & Color Space
  private static finalizeTexture(
    canvas: HTMLCanvasElement,
    cacheKey: string,
    options: {
      repeatX?: number;
      repeatY?: number;
      isColorMap?: boolean;
      anisotropy?: number;
      wrapS?: THREE.Wrapping;
      wrapT?: THREE.Wrapping;
    } = {}
  ): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = options.wrapS ?? THREE.RepeatWrapping;
    texture.wrapT = options.wrapT ?? THREE.RepeatWrapping;
    if (options.repeatX !== undefined || options.repeatY !== undefined) {
      texture.repeat.set(options.repeatX ?? 1, options.repeatY ?? 1);
    }
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = options.anisotropy ?? 8;
    texture.colorSpace = (options.isColorMap ?? true) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.needsUpdate = true;
    this.canvasCache.set(cacheKey, texture);
    return texture;
  }

  /** Reverse lookup so level teardown never disposes a shared generated texture. */
  private static textureSet: Set<THREE.Texture> | null = null;
  private static textureSetSize = -1;

  /**
   * True when the texture is one of the shared procedurally generated ones.
   *
   * These are cached across levels (generating them is expensive - that generation cost was
   * a large part of the load freeze), so per-level disposal must skip them.
   */
  public static isCachedTexture(texture: THREE.Texture): boolean {
    if (this.textureSet === null || this.textureSetSize !== this.canvasCache.size) {
      this.textureSet = new Set(this.canvasCache.values());
      this.textureSetSize = this.canvasCache.size;
    }
    return this.textureSet.has(texture as THREE.CanvasTexture);
  }

  // Cached grain tiles, keyed by monochrome flag. Built once, reused by every texture.
  private static noiseTileCache: Map<string, HTMLCanvasElement> = new Map();

  private static readonly NOISE_TILE_SIZE = 512;

  /**
   * Builds a 512x512 tile of full-range random grain centred on mid-grey (128).
   * Composited with the 'overlay' blend mode, mid-grey is a no-op while lighter/darker
   * pixels lighten/darken the base - i.e. exactly the signed +/- noise the old
   * per-pixel loop produced, but executed by the compositor instead of JS.
   */
  private static getNoiseTile(isMonochrome: boolean): HTMLCanvasElement {
    const key = isMonochrome ? 'mono' : 'rgb';
    const cached = this.noiseTileCache.get(key);
    if (cached) return cached;

    const size = this.NOISE_TILE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Built from scratch via createImageData - no getImageData readback, so no
    // canvas->CPU synchronisation stall.
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      const v = (Math.random() * 255) | 0;
      data[i] = v;
      data[i + 1] = isMonochrome ? v : (Math.random() * 255) | 0;
      data[i + 2] = isMonochrome ? v : (Math.random() * 255) | 0;
      data[i + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    this.noiseTileCache.set(key, canvas);
    return canvas;
  }

  /**
   * Film-grain overlay. Visually equivalent to the previous per-pixel implementation
   * (same +/- amplitude, same grain frequency at 1:1 tile scale) but tiles a cached
   * noise pattern through the 2D compositor rather than looping over every pixel in JS.
   *
   * The old version ran getImageData + a read-modify-write loop + putImageData on every
   * texture - roughly 20M pixels across the 31 generators, all synchronous on the main
   * thread. That was the bulk of the level-load freeze.
   */
  private static addFastNoiseOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    intensity: number = 0.08,
    isMonochrome: boolean = true
  ) {
    const tile = this.getNoiseTile(isMonochrome);
    const pattern = ctx.createPattern(tile, 'repeat');
    if (!pattern) return;

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    // Overlay against full-range noise modulates by roughly +/-(alpha/2); the old loop
    // modulated by +/-(intensity/2). Matching alpha to intensity preserves amplitude.
    ctx.globalAlpha = Math.min(1, Math.max(0, intensity));

    // Random sub-tile offset so repeats of the 512px grain never line up between textures.
    const offX = -Math.floor(Math.random() * this.NOISE_TILE_SIZE);
    const offY = -Math.floor(Math.random() * this.NOISE_TILE_SIZE);
    ctx.translate(offX, offY);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width - offX, height - offY);

    ctx.restore();
  }

  // ==========================================
  // HYPER-REALISTIC ABANDONED LAB FLOOR
  // ==========================================
  public static getAbandonedLabFloorTexture(): THREE.CanvasTexture {
    const cacheKey = 'abandoned_lab_floor_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // 1. Clinical White/Cyan Laboratory Floor Tile Base
    ctx.fillStyle = '#0a0f1d'; // Dark foundation
    ctx.fillRect(0, 0, size, size);

    // Grid of laboratory vinyl/ceramic tiles with bevels and wear
    const tileSize = 128;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#020617';

    for (let y = 0; y < size; y += tileSize) {
      for (let x = 0; x < size; x += tileSize) {
        // Variation in tile shade (stained, discolored clinical tiles)
        const shade = Math.floor(190 + Math.random() * 45);
        const blueTint = Math.floor(shade + Math.random() * 20);
        ctx.fillStyle = `rgb(${shade - 45}, ${shade - 25}, ${blueTint})`;
        ctx.fillRect(x, y, tileSize, tileSize);
        ctx.strokeRect(x, y, tileSize, tileSize);

        // Double Tile bevel / glossy specular edge highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.strokeRect(x + 3, y + 3, tileSize - 6, tileSize - 6);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.strokeRect(x + 6, y + 6, tileSize - 12, tileSize - 12);
        ctx.strokeStyle = '#020617';

        // High-frequency surface scuffs and scratches on individual tiles
        for (let s = 0; s < 10; s++) {
          ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.15)' : 'rgba(15, 23, 42, 0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const sx = x + 6 + Math.random() * (tileSize - 12);
          const sy = y + 6 + Math.random() * (tileSize - 12);
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + (Math.random() - 0.5) * 20, sy + (Math.random() - 0.5) * 20);
          ctx.stroke();
        }

        // Grime accumulation in tile corners
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.fillRect(x + 1, y + 1, 10, 10);
        ctx.fillRect(x + tileSize - 11, y + 1, 10, 10);
        ctx.fillRect(x + 1, y + tileSize - 11, 10, 10);
        ctx.fillRect(x + tileSize - 11, y + tileSize - 11, 10, 10);
      }
    }

    // 2. Yellow & Black Industrial Hazard Warning Borders & Biohazard Decals
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, size, 24);
    ctx.fillRect(0, size - 24, size, 24);
    ctx.fillStyle = '#0f172a';
    for (let h = -size; h < size * 2; h += 32) {
      ctx.beginPath();
      ctx.moveTo(h, 0); ctx.lineTo(h + 16, 0);
      ctx.lineTo(h - 16, 24); ctx.lineTo(h - 32, 24);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(h, size - 24); ctx.lineTo(h + 16, size - 24);
      ctx.lineTo(h - 16, size); ctx.lineTo(h - 32, size);
      ctx.fill();
    }

    // Biohazard floor emblem stencil
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-0.2);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.beginPath(); ctx.arc(0, 0, 90, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0f1d';
    ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
    for (let a = 0; a < 3; a++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath(); ctx.arc(0, -45, 32, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // 3. Deep Tile Fractures & Shattered Concrete Pit Exposures
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3;
    const crackSeeds = [
      { x: 200, y: 350 }, { x: 700, y: 250 }, { x: 500, y: 750 }, { x: 850, y: 800 }
    ];

    for (const seed of crackSeeds) {
      // Exposed rough concrete pit beneath broken tile
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(seed.x, seed.y, 45 + Math.random() * 35, 0, Math.PI * 2);
      ctx.fill();

      // Aggregate gravel bits in concrete pit
      for (let g = 0; g < 30; g++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#334155' : '#0f172a';
        ctx.fillRect(seed.x + (Math.random() - 0.5) * 70, seed.y + (Math.random() - 0.5) * 70, 3, 3);
      }

      // Spiderweb fractures in surrounding tiles
      for (let c = 0; c < 8; c++) {
        let cx = seed.x;
        let cy = seed.y;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const angle = (c / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        cx += Math.cos(angle) * (60 + Math.random() * 80);
        cy += Math.sin(angle) * (60 + Math.random() * 80);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }
    }

    // 4. Toxic Bioluminescent Green Sludge Spills ("Биохимические лужи")
    const slimeSpills = [
      { x: 350, y: 450, rx: 110, ry: 75 },
      { x: 720, y: 680, rx: 130, ry: 90 },
      { x: 220, y: 820, rx: 80, ry: 60 }
    ];

    for (const s of slimeSpills) {
      // Outer acid burn corrosion
      ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.rx + 25, s.ry + 25, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // Thick toxic glowing slime body
      const slimeGrad = ctx.createRadialGradient(s.x, s.y, 10, s.x, s.y, s.rx);
      slimeGrad.addColorStop(0, '#bbf7d0'); // Intense glowing lime center
      slimeGrad.addColorStop(0.35, '#22c55e'); // Radioactive green
      slimeGrad.addColorStop(0.75, '#15803d'); // Deep sludge
      slimeGrad.addColorStop(1, 'rgba(20, 83, 45, 0.85)');

      ctx.fillStyle = slimeGrad;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.rx, s.ry, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Glowing biohazard bubbles & foam
      ctx.fillStyle = '#fef08a';
      for (let b = 0; b < 12; b++) {
        const bx = s.x + (Math.random() - 0.5) * s.rx * 1.4;
        const by = s.y + (Math.random() - 0.5) * s.ry * 1.4;
        const br = 2 + Math.random() * 6;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 5. Bloody Hand Drag Trails & Blood Splatters
    ctx.fillStyle = 'rgba(153, 27, 27, 0.85)';
    ctx.beginPath();
    ctx.ellipse(600, 300, 60, 40, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Bloody footprints & hand marks
    for (let fp = 0; fp < 6; fp++) {
      const fpx = 600 + fp * 30;
      const fpy = 300 + fp * 40 + (Math.random() - 0.5) * 15;
      ctx.fillStyle = 'rgba(127, 29, 29, 0.7)';
      ctx.fillRect(fpx, fpy, 14, 22);
      // Toes
      for (let t = 0; t < 5; t++) {
        ctx.fillRect(fpx + t * 3, fpy - 4, 2, 3);
      }
    }

    // Drag trail
    ctx.strokeStyle = 'rgba(127, 29, 29, 0.7)';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(600, 300);
    ctx.lineTo(820, 480);
    ctx.stroke();

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 4, repeatY: 4, isColorMap: true, anisotropy: 8 });
  }

  // Lab Floor Bump Texture
  public static getAbandonedLabFloorBumpTexture(): THREE.CanvasTexture {
    const cacheKey = 'abandoned_lab_floor_bump_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    // Deep grout lines between tiles
    const tileSize = 128;
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#101010';
    for (let y = 0; y < size; y += tileSize) {
      for (let x = 0; x < size; x += tileSize) {
        ctx.strokeRect(x, y, tileSize, tileSize);
      }
    }

    // Raised slime pools (brighter height in bump map)
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.ellipse(350, 450, 110, 75, 0.2, 0, Math.PI * 2);
    ctx.ellipse(720, 680, 130, 90, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Deep broken tile pits (dark sunken height)
    ctx.fillStyle = '#050505';
    for (const seed of [{ x: 200, y: 350 }, { x: 700, y: 250 }, { x: 500, y: 750 }, { x: 850, y: 800 }]) {
      ctx.beginPath();
      ctx.arc(seed.x, seed.y, 45, 0, Math.PI * 2);
      ctx.fill();
    }

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 4, repeatY: 4, isColorMap: false, anisotropy: 8 });
  }

  // ==========================================
  // HYPER-REALISTIC ABANDONED LAB WALLS
  // ==========================================
  public static getAbandonedLabWallTexture(): THREE.CanvasTexture {
    const cacheKey = 'abandoned_lab_wall_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // 1. Dual-Tone Containment Wall Layout:
    // Lower half: Grime-covered White/Cyan Laboratory Tiles with grout
    // Upper half: Heavy Brushed Stainless Steel / Reinforced Titanium Panels
    ctx.fillStyle = '#1e293b'; // Steel upper base
    ctx.fillRect(0, 0, size, size / 2);

    ctx.fillStyle = '#f1f5f9'; // Tile lower base
    ctx.fillRect(0, size / 2, size, size / 2);

    // Lower Tiles Grid
    const tileSize = 64;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    for (let y = size / 2; y < size; y += tileSize) {
      for (let x = 0; x < size; x += tileSize) {
        ctx.fillStyle = Math.random() > 0.25 ? '#e2e8f0' : '#cbd5e1';
        ctx.fillRect(x, y, tileSize, tileSize);
        ctx.strokeRect(x, y, tileSize, tileSize);
      }
    }

    // Upper Heavy Metal Panels & Rivets
    const panelW = 256;
    const panelH = 256;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 5;

    for (let y = 0; y < size / 2; y += panelH) {
      for (let x = 0; x < size; x += panelW) {
        // Brushed steel metallic gradient
        const metalGrad = ctx.createLinearGradient(x, y, x + panelW, y + panelH);
        metalGrad.addColorStop(0, '#334155');
        metalGrad.addColorStop(0.5, '#64748b');
        metalGrad.addColorStop(1, '#1e293b');
        ctx.fillStyle = metalGrad;
        ctx.fillRect(x, y, panelW, panelH);
        ctx.strokeRect(x, y, panelW, panelH);

        // Steel panel surface brushed noise lines
        for (let b = 0; b < 20; b++) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 1;
          const py = y + Math.random() * panelH;
          ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + panelW, py); ctx.stroke();
        }

        // Heavy steel rivets around panel edges
        ctx.fillStyle = '#cbd5e1';
        for (let rx = x + 16; rx < x + panelW; rx += 32) {
          ctx.beginPath(); ctx.arc(rx, y + 12, 4, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(rx, y + panelH - 12, 4, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // Heavy Metal Seam trim bar with yellow hazard stripe
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, size / 2 - 12, size, 24);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, size / 2 - 4, size, 8);

    // 2. SHATTERED BIOHAZARD CONTAINMENT OBSERVATION WINDOW
    const winX = 256;
    const winY = 80;
    const winW = 512;
    const winH = 320;

    // Window frame
    ctx.fillStyle = '#020617';
    ctx.fillRect(winX - 16, winY - 16, winW + 32, winH + 32);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(winX - 8, winY - 8, winW + 16, winH + 16);

    // Dark interior containment cell behind window
    ctx.fillStyle = '#030712';
    ctx.fillRect(winX, winY, winW, winH);

    // Glowing Green Alien Specimen Tank inside cell!
    const tankGrad = ctx.createRadialGradient(winX + winW / 2, winY + winH / 2, 20, winX + winW / 2, winY + winH / 2, 180);
    tankGrad.addColorStop(0, 'rgba(34, 197, 94, 0.85)');
    tankGrad.addColorStop(0.6, 'rgba(21, 128, 61, 0.5)');
    tankGrad.addColorStop(1, 'rgba(3, 7, 18, 0)');
    ctx.fillStyle = tankGrad;
    ctx.fillRect(winX, winY, winW, winH);

    // Alien Mutagen Silhouette inside tank
    ctx.fillStyle = '#022c22';
    ctx.beginPath();
    ctx.ellipse(winX + winW / 2, winY + winH / 2 + 10, 45, 70, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glowing red eyes of specimen
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(winX + winW / 2 - 15, winY + winH / 2 - 25, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(winX + winW / 2 + 15, winY + winH / 2 - 25, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Shattered Reinforced Glass Cracks across window
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.9)';
    ctx.lineWidth = 3;
    const impactX = winX + 320;
    const impactY = winY + 160;

    ctx.beginPath();
    for (let g = 0; g < 12; g++) {
      const angle = (g / 12) * Math.PI * 2;
      ctx.moveTo(impactX, impactY);
      ctx.lineTo(impactX + Math.cos(angle) * 220, impactY + Math.sin(angle) * 220);
    }
    ctx.stroke();

    // Concentric glass fracture rings
    for (let r = 30; r < 200; r += 40) {
      ctx.beginPath();
      ctx.arc(impactX, impactY, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Glowing Biohazard Sign Stencil
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(40, 60, 180, 140);
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 4;
    ctx.strokeRect(44, 64, 172, 132);

    // Biohazard Symbol Icon
    ctx.fillStyle = '#fef08a';
    ctx.beginPath(); ctx.arc(130, 110, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath(); ctx.arc(130, 110, 12, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 14px monospace';
    ctx.fillText('BIOHAZARD', 82, 160);
    ctx.font = '700 10px monospace';
    ctx.fillText('MUTAGEN LEVEL 4', 66, 180);

    // 4. Chemical Acid Corrosion Running down lower tiles
    ctx.fillStyle = 'rgba(22, 163, 74, 0.7)';
    ctx.beginPath();
    ctx.moveTo(winX + 100, winY + winH);
    ctx.lineTo(winX + 140, winY + winH);
    ctx.lineTo(winX + 150, size);
    ctx.lineTo(winX + 90, size);
    ctx.closePath();
    ctx.fill();

    // Bloody handprint on lower white tiles
    ctx.fillStyle = 'rgba(185, 28, 28, 0.9)';
    ctx.beginPath();
    ctx.arc(880, 680, 18, 0, Math.PI * 2); ctx.fill();
    for (let f = 0; f < 5; f++) {
      ctx.fillRect(865 + f * 7, 630 + f * 2, 5, 35);
    }

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 2, repeatY: 1, isColorMap: true, anisotropy: 8 });
  }

  // Lab Wall Bump Map
  public static getAbandonedLabWallBumpTexture(): THREE.CanvasTexture {
    const cacheKey = 'abandoned_lab_wall_bump_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    // Panel & tile seams
    ctx.strokeStyle = '#101010';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, size, size / 2);
    ctx.strokeRect(0, size / 2, size, size / 2);

    // Window frame protrusion
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(240, 64, 544, 352);
    ctx.fillStyle = '#050505';
    ctx.fillRect(256, 80, 512, 320);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 2, repeatY: 1, isColorMap: false, anisotropy: 8 });
  }

  // ==========================================
  // HYPER-REALISTIC ABANDONED LAB CEILING (ULTRA 2048 HD)
  // ==========================================
  public static getAbandonedLabCeilingTexture(): THREE.CanvasTexture {
    const cacheKey = 'abandoned_lab_ceiling_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    // PERF: 1024 real pixels is plenty for a texture tiled 4x4 across the ceiling; 2048
    // cost ~22 MB of VRAM (with mipmaps) for detail nobody can resolve. The art below is
    // authored in 2048-space, so keep `size` as the layout coordinate space and scale the
    // context down onto a 1024 canvas.
    const size = 2048;
    const canvasSize = 1024;
    const { canvas, ctx } = this.createCanvas(canvasSize, canvasSize);
    ctx.scale(canvasSize / size, canvasSize / size);

    // Dark void background behind missing ceiling tiles
    ctx.fillStyle = '#020408';
    ctx.fillRect(0, 0, size, size);

    // Exposed metallic ventilation ducts & thick electrical cable bundles in void
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(200, 0, 240, size); // Main Air Duct 1
    ctx.fillRect(0, 1200, size, 280); // Main Air Duct 2

    // Duct rivets
    ctx.fillStyle = '#64748b';
    for (let dy = 0; dy < size; dy += 64) {
      ctx.fillRect(210, dy, 12, 12);
      ctx.fillRect(410, dy, 12, 12);
    }

    // Dangling electrical cables
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(600, 0); ctx.quadraticCurveTo(800, 800, 1000, size);
    ctx.stroke();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(1400, 0); ctx.quadraticCurveTo(1200, 1000, 1600, size);
    ctx.stroke();

    // Metallic Drop Ceiling Grid (Suspended Acoustic Tile Frames)
    const gridSize = 512;
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 24;

    for (let y = 0; y < size; y += gridSize) {
      for (let x = 0; x < size; x += gridSize) {
        ctx.strokeRect(x, y, gridSize, gridSize);

        // Render acoustic ceiling tile ONLY if not broken/missing!
        // (~35% of tiles missing to expose dark pipes/wires above)
        if ((x + y) % 3 !== 0) {
          // Acoustic stippled tile texture
          ctx.fillStyle = '#334155';
          ctx.fillRect(x + 12, y + 12, gridSize - 24, gridSize - 24);

          // Pitted sound-absorption dots
          ctx.fillStyle = '#1e293b';
          for (let p = 0; p < 80; p++) {
            ctx.fillRect(x + 24 + Math.random() * (gridSize - 48), y + 24 + Math.random() * (gridSize - 48), 6, 6);
          }

          // Mold & water stain rings on tiles
          if (Math.random() > 0.35) {
            ctx.fillStyle = 'rgba(120, 53, 15, 0.35)';
            ctx.beginPath();
            ctx.arc(x + gridSize / 2, y + gridSize / 2, 80 + Math.random() * 60, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // Fluorescent Light Tube Fixtures (crooked & broken)
    const lightLocs = [{ x: 512, y: 512 }, { x: 1536, y: 1536 }];
    for (const l of lightLocs) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(l.x - 160, l.y - 60, 320, 120);

      // Fluorescent tube with electric glow
      ctx.fillStyle = '#fef08a';
      ctx.shadowColor = '#facc15'; ctx.shadowBlur = 30;
      ctx.fillRect(l.x - 140, l.y - 20, 280, 40);
      ctx.shadowBlur = 0;
    }

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 4, repeatY: 4, isColorMap: true, anisotropy: 8 });
  }

  // ==========================================
  // HYPER-REALISTIC ASPHALT WITH POTHOLES & DEFECTS
  // ==========================================
  public static getSubwayTileTexture(): THREE.CanvasTexture {
    const cacheKey = 'subway_tile_hd_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // 1. Base Cement Mortar / Grout Layer
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size, size);

    // 2. Main Glazed Ceramic Subway Tiles (Staggered Brick-Bond Layout)
    const tileW = 64;
    const tileH = 32;
    const grout = 3;
    const ceramicWallHeight = 720;

    const tileShades = [
      '#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8',
      '#e0f2fe', '#bae6fd', '#dbeafe', '#f0f9ff'
    ];

    ctx.strokeStyle = '#020617';
    ctx.lineWidth = grout;

    for (let y = 0; y < ceramicWallHeight; y += tileH) {
      const offsetX = (Math.floor(y / tileH) % 2 === 0) ? 0 : tileW / 2;
      for (let x = -tileW; x < size + tileW; x += tileW) {
        const tx = x + offsetX;
        const ty = y;

        // Skip tile if broken / missing (~3% chance)
        const isBroken = Math.random() < 0.03;
        if (isBroken) {
          // Exposed rough mortar bedding behind broken tile
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(tx + 1, ty + 1, tileW - 2, tileH - 2);
          for (let m = 0; m < 8; m++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#334155' : '#0f172a';
            ctx.fillRect(
              tx + 4 + Math.random() * (tileW - 8),
              ty + 4 + Math.random() * (tileH - 8),
              3, 3
            );
          }
          ctx.strokeRect(tx, ty, tileW, tileH);
          continue;
        }

        // Glazed ceramic tile fill with subtle shade variation
        const shadeIndex = Math.floor(Math.abs(Math.sin(tx * 12.3 + ty * 45.7) * tileShades.length));
        ctx.fillStyle = tileShades[shadeIndex];
        ctx.fillRect(tx, ty, tileW, tileH);

        // 3D Bevelled Specular Highlights & Shadows
        // Top & Left glossy highlight edge
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.fillRect(tx + 1, ty + 1, tileW - 2, 2);
        ctx.fillRect(tx + 1, ty + 1, 2, tileH - 2);

        // Bottom & Right bevel shadow edge
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.fillRect(tx + 1, ty + tileH - 3, tileW - 2, 2);
        ctx.fillRect(tx + tileW - 3, ty + 1, 2, tileH - 2);

        // Individual tile surface scuffs & craquelure fine cracks
        if (Math.random() > 0.6) {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const cx = tx + 4 + Math.random() * (tileW - 8);
          const cy = ty + 4 + Math.random() * (tileH - 8);
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (Math.random() - 0.5) * 14, cy + (Math.random() - 0.5) * 14);
          ctx.stroke();
        }

        ctx.strokeStyle = '#020617';
        ctx.lineWidth = grout;
        ctx.strokeRect(tx, ty, tileW, tileH);
      }
    }

    // 3. Lower Metro Wainscoting: Dark Slate/Granite Base Tiles (720px to 1024px)
    const slateTileSize = 64;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, ceramicWallHeight, size, size - ceramicWallHeight);

    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4;
    for (let y = ceramicWallHeight; y < size; y += slateTileSize) {
      for (let x = 0; x < size; x += slateTileSize) {
        ctx.fillStyle = Math.random() > 0.3 ? '#1e293b' : '#0f172a';
        ctx.fillRect(x, y, slateTileSize, slateTileSize);

        // Slate bevel
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(x + 1, y + 1, slateTileSize - 2, 2);
        ctx.fillRect(x + 1, y + 1, 2, slateTileSize - 2);

        ctx.strokeRect(x, y, slateTileSize, slateTileSize);
      }
    }

    // Heavy Polished Granite Trim Rail separating ceramic tiles from slate
    const railY = ceramicWallHeight - 12;
    const railH = 24;
    const railGrad = ctx.createLinearGradient(0, railY, 0, railY + railH);
    railGrad.addColorStop(0, '#64748b');
    railGrad.addColorStop(0.3, '#f1f5f9');
    railGrad.addColorStop(0.7, '#334155');
    railGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = railGrad;
    ctx.fillRect(0, railY, size, railH);

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, railY, size, 2);
    ctx.fillRect(0, railY + railH - 2, size, 2);

    // 4. Middle Cobalt Blue & Gold Metro Line Mosaic Trim Band (y = 320 to 360)
    const mosaicY = 320;
    const mosaicH = 40;
    ctx.fillStyle = '#0369a1';
    ctx.fillRect(0, mosaicY, size, mosaicH);

    const mTileSize = 10;
    for (let my = mosaicY; my < mosaicY + mosaicH; my += mTileSize) {
      for (let mx = 0; mx < size; mx += mTileSize) {
        const isGold = (mx + my) % 30 === 0 || my === mosaicY || my === mosaicY + mosaicH - mTileSize;
        ctx.fillStyle = isGold ? '#f59e0b' : (Math.random() > 0.5 ? '#0284c7' : '#0369a1');
        ctx.fillRect(mx + 1, my + 1, mTileSize - 2, mTileSize - 2);
      }
    }
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, mosaicY, size, 2);
    ctx.fillRect(0, mosaicY + mosaicH - 2, size, 2);

    // 5. Classic Metro Station Enamel Plaque & Warning Stencil
    // Russian Metro Plaque: "СТАНЦИЯ ДОМАНИЯ // ЛИНИЯ 2"
    const plaqueX = 256;
    const plaqueY = 130;
    const plaqueW = 512;
    const plaqueH = 100;

    // Outer enamel frame
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(plaqueX - 8, plaqueY - 8, plaqueW + 16, plaqueH + 16);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(plaqueX - 4, plaqueY - 4, plaqueW + 8, plaqueH + 8);

    // Deep Cobalt Enamel Body
    const enamelGrad = ctx.createLinearGradient(plaqueX, plaqueY, plaqueX, plaqueY + plaqueH);
    enamelGrad.addColorStop(0, '#0369a1');
    enamelGrad.addColorStop(0.5, '#0284c7');
    enamelGrad.addColorStop(1, '#075985');
    ctx.fillStyle = enamelGrad;
    ctx.fillRect(plaqueX, plaqueY, plaqueW, plaqueH);

    // Enamel Gloss Reflection
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(plaqueX, plaqueY);
    ctx.lineTo(plaqueX + plaqueW, plaqueY);
    ctx.lineTo(plaqueX + plaqueW - 60, plaqueY + 35);
    ctx.lineTo(plaqueX, plaqueY + 35);
    ctx.closePath();
    ctx.fill();

    // Plaque Typography
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('СТАНЦИЯ МЕТРО «ДОМАНИЯ»', plaqueX + plaqueW / 2, plaqueY + 45);
    ctx.font = '700 16px monospace';
    ctx.fillStyle = '#fef08a';
    ctx.fillText('СЕКТОР 2 // ЛИНИЯ КАТАКОМБ', plaqueX + plaqueW / 2, plaqueY + 75);
    ctx.textAlign = 'left';

    // Safety Stencil: "НЕ ПРИСЛОНЯТЬСЯ"
    ctx.fillStyle = 'rgba(220, 38, 38, 0.8)';
    ctx.font = '900 18px monospace';
    ctx.fillText('⚠️ НЕ ПРИСЛОНЯТЬСЯ // DANGER', 80, 680);

    // 6. Water Drips, Grime Accumulation & High-Voltage Cables
    // Water drip runoff lines
    for (let d = 0; d < 12; d++) {
      const dx = 50 + d * 80 + Math.random() * 30;
      const dripGrad = ctx.createLinearGradient(dx, 0, dx, 500);
      dripGrad.addColorStop(0, 'rgba(15, 23, 42, 0.6)');
      dripGrad.addColorStop(0.5, 'rgba(30, 41, 59, 0.3)');
      dripGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = dripGrad;
      ctx.fillRect(dx, 0, 4 + Math.random() * 6, 300 + Math.random() * 250);
    }

    // High-Voltage Cable Conduit across top of wall
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 40, size, 14);
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 43, size, 8);

    // Conduit mounting brackets
    for (let bx = 32; bx < size; bx += 128) {
      ctx.fillStyle = '#020617';
      ctx.fillRect(bx - 4, 34, 16, 26);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(bx, 36, 8, 22);
    }

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 4, repeatY: 2, isColorMap: true, anisotropy: 8 });
  }

  // Metro Tile Bump Map for realistic 3D depth
  public static getSubwayTileBumpTexture(): THREE.CanvasTexture {
    const cacheKey = 'subway_tile_bump_hd_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // Neutral base height
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    const tileW = 64;
    const tileH = 32;
    const ceramicWallHeight = 720;

    // Deep grout lines (dark) & Raised tile faces (bright)
    ctx.strokeStyle = '#101010';
    ctx.lineWidth = 4;

    for (let y = 0; y < ceramicWallHeight; y += tileH) {
      const offsetX = (Math.floor(y / tileH) % 2 === 0) ? 0 : tileW / 2;
      for (let x = -tileW; x < size + tileW; x += tileW) {
        const tx = x + offsetX;
        const ty = y;

        ctx.fillStyle = '#d0d0d0';
        ctx.fillRect(tx + 2, ty + 2, tileW - 4, tileH - 4);
        ctx.strokeRect(tx, ty, tileW, tileH);
      }
    }

    // Raised Granite Wainscoting
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(0, ceramicWallHeight, size, size - ceramicWallHeight);

    // Raised Granite Rail
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, ceramicWallHeight - 12, size, 24);

    // Raised Plaque Frame
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(256 - 8, 130 - 8, 512 + 16, 100 + 16);

    // Raised Cable Conduit
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 36, size, 22);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 4, repeatY: 2, isColorMap: false, anisotropy: 8 });
  }

  // 4. Chapter 2 Floor: High-Detail Metro Station Granite Floor Slabs with Tactile Warning Strips & Drainage
  public static getSubwayFloorTexture(): THREE.CanvasTexture {
    const cacheKey = 'subway_floor_hd_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // 1. Dark Concrete / Mortar Base
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size, size);

    // 2. Heavy Polished Granite Floor Slabs (128x128 grid)
    const tileSize = 128;
    const grout = 3;

    const graniteShades = [
      '#1e293b', '#334155', '#111827', '#1f2937', '#0f172a',
      '#1e1b18', '#2d2a26', '#1c1917', '#27272a'
    ];

    for (let y = 0; y < size; y += tileSize) {
      for (let x = 0; x < size; x += tileSize) {
        // Skip some slots for steel drain grates (at x=256 and x=768)
        if (x === 256 && (y === 256 || y === 768)) {
          // Cast iron drain grate frame
          ctx.fillStyle = '#020617';
          ctx.fillRect(x, y, tileSize, tileSize);

          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x + 4, y + 4, tileSize - 8, tileSize - 8);

          // Grate bars
          ctx.fillStyle = '#475569';
          for (let gx = x + 8; gx < x + tileSize - 8; gx += 12) {
            ctx.fillRect(gx, y + 6, 6, tileSize - 12);
            ctx.fillStyle = '#020617';
            ctx.fillRect(gx + 6, y + 6, 6, tileSize - 12);
            ctx.fillStyle = '#475569';
          }
          continue;
        }

        // Granite slab fill
        const shadeIndex = Math.floor(Math.abs(Math.sin(x * 37.1 + y * 91.3) * graniteShades.length));
        ctx.fillStyle = graniteShades[shadeIndex];
        ctx.fillRect(x, y, tileSize, tileSize);

        // Granite speckled mineral grains (quartz & feldspar specks)
        for (let g = 0; g < 24; g++) {
          const gx = x + Math.random() * tileSize;
          const gy = y + Math.random() * tileSize;
          const gSize = 1 + Math.random() * 3;
          ctx.fillStyle = Math.random() > 0.4 ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.35)';
          ctx.fillRect(gx, gy, gSize, gSize);
        }

        // Slab bevel highlights (polished stone edge)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(x + 1, y + 1, tileSize - 2, 2);
        ctx.fillRect(x + 1, y + 1, 2, tileSize - 2);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(x + 1, y + tileSize - 3, tileSize - 2, 2);
        ctx.fillRect(x + tileSize - 3, y + 1, 2, tileSize - 2);

        // Grout line
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = grout;
        ctx.strokeRect(x, y, tileSize, tileSize);
      }
    }

    // 3. Tactile Safety Paving Bands (Yellow Truncated Dome Tiles for Platform Edges)
    const tactileRows = [128, 768];
    tactileRows.forEach((ty) => {
      ctx.fillStyle = '#ca8a04'; // Deep mustard yellow
      ctx.fillRect(0, ty, size, 128);

      // Tactile grid tiles (64x64)
      for (let tx = 0; tx < size; tx += 64) {
        for (let tSubY = ty; tSubY < ty + 128; tSubY += 64) {
          ctx.strokeStyle = '#854d0e';
          ctx.lineWidth = 2;
          ctx.strokeRect(tx, tSubY, 64, 64);

          // Grid of raised tactile dots (4x4 dots per 64x64 tile)
          for (let dx = tx + 8; dx < tx + 64; dx += 16) {
            for (let dy = tSubY + 8; dy < tSubY + 64; dy += 16) {
              // Dot shadow
              ctx.fillStyle = '#713f12';
              ctx.beginPath();
              ctx.arc(dx + 1, dy + 1, 4, 0, Math.PI * 2);
              ctx.fill();

              // Dot face
              ctx.fillStyle = '#fef08a';
              ctx.beginPath();
              ctx.arc(dx, dy, 3.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      // Safety boundary white painted line
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(0, ty, size, 6);
      ctx.fillRect(0, ty + 122, size, 6);
    });

    // 4. Metro Track Rail Bed Strip Accent (Simulated recessed track groove) at y = 480..544
    const trackY = 480;
    const trackH = 64;
    ctx.fillStyle = '#090d16'; // Deep track pit floor
    ctx.fillRect(0, trackY, size, trackH);

    // Wooden ties / sleepers
    for (let wx = 0; wx < size; wx += 48) {
      ctx.fillStyle = '#261b14';
      ctx.fillRect(wx, trackY + 4, 20, trackH - 8);

      // Steel tie plate & bolts
      ctx.fillStyle = '#475569';
      ctx.fillRect(wx + 3, trackY + 12, 14, 10);
      ctx.fillRect(wx + 3, trackY + trackH - 22, 14, 10);
    }

    // Steel rails
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, trackY + 14, size, 6);
    ctx.fillRect(0, trackY + trackH - 20, size, 6);

    ctx.fillStyle = '#f8fafc'; // Rail top specular reflection line
    ctx.fillRect(0, trackY + 15, size, 2);
    ctx.fillRect(0, trackY + trackH - 19, size, 2);

    // 5. Environmental Wear: Water Puddles, Dirt Grime, Scuffs
    for (let p = 0; p < 8; p++) {
      const px = Math.random() * size;
      const py = Math.random() * size;
      const rx = 20 + Math.random() * 40;
      const ry = 10 + Math.random() * 20;

      ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 4, repeatY: 4, isColorMap: true, anisotropy: 8 });
  }

  // Metro Floor Bump Map
  public static getSubwayFloorBumpTexture(): THREE.CanvasTexture {
    const cacheKey = 'subway_floor_bump_hd_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // Base neutral height
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    const tileSize = 128;

    // Raised Granite Slabs
    for (let y = 0; y < size; y += tileSize) {
      for (let x = 0; x < size; x += tileSize) {
        if (x === 256 && (y === 256 || y === 768)) {
          // Recessed drain slots
          ctx.fillStyle = '#202020';
          ctx.fillRect(x, y, tileSize, tileSize);

          ctx.fillStyle = '#d0d0d0';
          for (let gx = x + 8; gx < x + tileSize - 8; gx += 12) {
            ctx.fillRect(gx, y + 6, 6, tileSize - 12);
          }
          continue;
        }

        ctx.fillStyle = '#b0b0b0';
        ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

        ctx.strokeStyle = '#101010';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, tileSize, tileSize);
      }
    }

    // Raised Tactile Domes on Yellow Bands
    [128, 768].forEach((ty) => {
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(0, ty, size, 128);

      for (let tx = 0; tx < size; tx += 64) {
        for (let tSubY = ty; tSubY < ty + 128; tSubY += 64) {
          for (let dx = tx + 8; dx < tx + 64; dx += 16) {
            for (let dy = tSubY + 8; dy < tSubY + 64; dy += 16) {
              ctx.fillStyle = '#ffffff'; // Maximum height relief for bumps
              ctx.beginPath();
              ctx.arc(dx, dy, 3.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    });

    // Recessed Track Pit & Steel Rails
    const trackY = 480;
    const trackH = 64;
    ctx.fillStyle = '#303030';
    ctx.fillRect(0, trackY, size, trackH);

    // Raised rails
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, trackY + 14, size, 6);
    ctx.fillRect(0, trackY + trackH - 20, size, 6);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 4, repeatY: 4, isColorMap: false, anisotropy: 8 });
  }

  // Metro Train Hull Exterior Texture (Brushed stainless steel, speed stripe, rivets, stencil logos, graffiti & rust)
  public static getSubwayTrainHullTexture(): THREE.CanvasTexture {
    const cacheKey = 'subway_train_hull_hd_v1';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // 1. Brushed Stainless Steel Metal Base
    const metalGrad = ctx.createLinearGradient(0, 0, 0, size);
    metalGrad.addColorStop(0, '#1e293b');
    metalGrad.addColorStop(0.3, '#334155');
    metalGrad.addColorStop(0.6, '#475569');
    metalGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = metalGrad;
    ctx.fillRect(0, 0, size, size);

    // Horizontal metal panel streaks / brushed grain
    for (let y = 0; y < size; y += 4) {
      const grainColor = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.06)';
      ctx.fillStyle = grainColor;
      ctx.fillRect(0, y, size, 2);
    }

    // 2. Corrugated Steel Rib Panels (Horizontal Ridges)
    for (let cy = 120; cy < 450; cy += 24) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(0, cy, size, 4);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(0, cy + 4, size, 12);
    }

    // 3. Iconic Metro Speed Stripes (Cobalt Blue with Gold Hazard Trim)
    const stripeY = 480;
    const stripeH = 140;

    // Gold Hazard Trim Lines
    ctx.fillStyle = '#ca8a04';
    ctx.fillRect(0, stripeY - 8, size, stripeH + 16);

    // Blue Line Core
    const blueGrad = ctx.createLinearGradient(0, stripeY, 0, stripeY + stripeH);
    blueGrad.addColorStop(0, '#0284c7');
    blueGrad.addColorStop(0.5, '#0369a1');
    blueGrad.addColorStop(1, '#075985');
    ctx.fillStyle = blueGrad;
    ctx.fillRect(0, stripeY, size, stripeH);

    // White Divider Stripe
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, stripeY + 20, size, 8);

    // 4. Panel Seams & Rivets
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3;

    // Vertical Panel Seams every 256px
    for (let px = 0; px <= size; px += 256) {
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, size);
      ctx.stroke();

      // Rivets along seam
      for (let ry = 16; ry < size; ry += 32) {
        ctx.fillStyle = '#020617';
        ctx.fillRect(px - 3, ry - 3, 6, 6);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(px - 2, ry - 2, 4, 4);
      }
    }

    // 5. Stencil Art, Metro Logotypes & Technical Warnings
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 32px monospace';
    ctx.fillText('ВАГОН № 8402-М', 60, 400);

    ctx.font = '700 20px monospace';
    ctx.fillStyle = '#fef08a';
    ctx.fillText('ЛИНИЯ 4 // СЕКТОР КАТАКОМБ', 60, 440);

    ctx.fillStyle = '#ef4444';
    ctx.font = '900 18px sans-serif';
    ctx.fillText('⚠️ ОПАСНО 750V // HIGH VOLTAGE', 620, 430);

    // 6. Underground Cyberpunk Graffiti Tags
    ctx.font = '900 italic 56px sans-serif';
    ctx.fillStyle = '#f43f5e';
    ctx.shadowColor = '#fb7185';
    ctx.shadowBlur = 12;
    ctx.fillText('CYBER', 120, 720);

    ctx.font = '900 48px sans-serif';
    ctx.fillStyle = '#06b6d4';
    ctx.shadowColor = '#67e8f9';
    ctx.shadowBlur = 10;
    ctx.fillText('V O I D', 580, 780);

    ctx.shadowBlur = 0;

    // Spray Paint Drips
    ctx.fillStyle = '#f43f5e';
    for (let d = 0; d < 6; d++) {
      ctx.fillRect(150 + d * 30, 730, 3, 15 + Math.random() * 25);
    }

    // 7. Rust Stains, Grease & Dirt
    for (let r = 0; r < 12; r++) {
      const rx = Math.random() * size;
      const ry = Math.random() * size;
      const rw = 20 + Math.random() * 50;
      const rh = 15 + Math.random() * 40;

      const rustGrad = ctx.createRadialGradient(rx, ry, 2, rx, ry, rw);
      rustGrad.addColorStop(0, 'rgba(120, 53, 15, 0.6)');
      rustGrad.addColorStop(0.6, 'rgba(154, 52, 18, 0.3)');
      rustGrad.addColorStop(1, 'rgba(120, 53, 15, 0)');
      ctx.fillStyle = rustGrad;
      ctx.beginPath();
      ctx.ellipse(rx, ry, rw, rh, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bottom Dirt / Grease Accumulation
    const dirtGrad = ctx.createLinearGradient(0, size - 200, 0, size);
    dirtGrad.addColorStop(0, 'rgba(2, 6, 23, 0)');
    dirtGrad.addColorStop(1, 'rgba(2, 6, 23, 0.85)');
    ctx.fillStyle = dirtGrad;
    ctx.fillRect(0, size - 200, size, 200);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 2, repeatY: 1, isColorMap: true, anisotropy: 8 });
  }

  // Metro Train Hull Bump Texture
  public static getSubwayTrainHullBumpTexture(): THREE.CanvasTexture {
    const cacheKey = 'subway_train_hull_bump_hd_v1';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // Base height
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    // Corrugated Steel Ribs
    for (let cy = 120; cy < 450; cy += 24) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, cy, size, 6);
      ctx.fillStyle = '#202020';
      ctx.fillRect(0, cy + 6, size, 6);
    }

    // Panel Seams & Rivets
    ctx.strokeStyle = '#101010';
    ctx.lineWidth = 4;
    for (let px = 0; px <= size; px += 256) {
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, size);
      ctx.stroke();

      for (let ry = 16; ry < size; ry += 32) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, ry, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Speed Stripe Border Bump
    const stripeY = 480;
    const stripeH = 140;
    ctx.fillStyle = '#a0a0a0';
    ctx.fillRect(0, stripeY - 8, size, stripeH + 16);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 2, repeatY: 1, isColorMap: false, anisotropy: 8 });
  }
  public static getMineRockTexture(): THREE.CanvasTexture {
    const cacheKey = 'mine_rock';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const { canvas, ctx } = this.createCanvas(512, 512);

    ctx.fillStyle = '#141210';
    ctx.fillRect(0, 0, 512, 512);

    // Rock noise
    this.addFastNoiseOverlay(ctx, 512, 512, 0.12, false);

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

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 6, repeatY: 3, isColorMap: true, anisotropy: 8 });
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

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 2, repeatY: 2, isColorMap: true, anisotropy: 8 });
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

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 8, repeatY: 8, isColorMap: true, anisotropy: 8 });
  }

  // 8. Sci-Fi Metallic Weapon / Robot Armor Texture
  public static getMetalArmorTexture(): THREE.CanvasTexture {
    const cacheKey = 'metal_armor';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const { canvas, ctx } = this.createCanvas(512, 512);

    // Brushed titanium steel background
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#3a3f47');
    grad.addColorStop(0.5, '#282c34');
    grad.addColorStop(1, '#1e2228');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Brushed metal scratches
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 20 + Math.random() * 30, y + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }

    // Heavy Panel borders
    ctx.strokeStyle = '#0f1115';
    ctx.lineWidth = 5;
    ctx.strokeRect(16, 16, 230, 230);
    ctx.strokeRect(266, 16, 230, 230);
    ctx.strokeRect(16, 266, 230, 230);
    ctx.strokeRect(266, 266, 230, 230);

    // Silver Rivets with specular highlights
    const rivets = [
      [24, 24], [238, 24], [24, 238], [238, 238],
      [274, 24], [488, 24], [274, 238], [488, 238],
      [24, 274], [238, 274], [24, 488], [238, 488],
      [274, 274], [488, 274], [274, 488], [488, 488]
    ];
    for (const [rx, ry] of rivets) {
      ctx.fillStyle = '#111318';
      ctx.beginPath();
      ctx.arc(rx, ry, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#9ca3af';
      ctx.beginPath();
      ctx.arc(rx - 1, ry - 1, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(rx - 2, ry - 2, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    return this.finalizeTexture(canvas, cacheKey, { isColorMap: true, anisotropy: 8 });
  }

  // 9. Realistic Hyrax Fur Texture (Multi-layer dense organic fur)
  public static getBossRoboTexture(): THREE.CanvasTexture {
    const cacheKey = 'boss_robo_armor_v1';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // 1. Dark Metallic Titanium Foundation
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size, size);

    // Fine brushed metal micro-texture noise
    this.addFastNoiseOverlay(ctx, size, size, 0.08, false);

    // 2. Carbon Fiber Crosshatch Panels (Center & Side Modules)
    const panelSize = 256;
    for (let py = 0; py < size; py += panelSize) {
      for (let px = 0; px < size; px += panelSize) {
        if ((px + py) % 512 === 0) {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(px + 8, py + 8, panelSize - 16, panelSize - 16);

          // Diagonal Carbon Weave
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
          ctx.lineWidth = 2;
          for (let i = -panelSize; i < panelSize * 2; i += 8) {
            ctx.beginPath();
            ctx.moveTo(px + i, py);
            ctx.lineTo(px + i + panelSize, py + panelSize);
            ctx.stroke();
          }
        }
      }
    }

    // 3. Yellow & Black Hazard Caution Borders on Armor Plates
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, size, 32);
    ctx.fillRect(0, size - 32, size, 32);
    ctx.fillStyle = '#0f172a';
    for (let h = -size; h < size * 2; h += 40) {
      ctx.beginPath();
      ctx.moveTo(h, 0); ctx.lineTo(h + 20, 0);
      ctx.lineTo(h - 20, 32); ctx.lineTo(h - 40, 32);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(h, size - 32); ctx.lineTo(h + 20, size - 32);
      ctx.lineTo(h - 20, size); ctx.lineTo(h - 40, size);
      ctx.fill();
    }

    // 4. Glowing Neon Cyan & Red Cyber Conduits / Circuit Traces
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 4;

    const tracePoints = [
      [{ x: 64, y: 128 }, { x: 300, y: 128 }, { x: 400, y: 228 }, { x: 400, y: 500 }],
      [{ x: 960, y: 128 }, { x: 720, y: 128 }, { x: 620, y: 228 }, { x: 620, y: 500 }],
      [{ x: 128, y: 900 }, { x: 350, y: 900 }, { x: 500, y: 750 }],
      [{ x: 896, y: 900 }, { x: 670, y: 900 }, { x: 520, y: 750 }]
    ];

    for (const path of tracePoints) {
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.stroke();
    }

    // Glowing Power Nodes
    ctx.fillStyle = '#00ffff';
    for (const pt of [{ x: 300, y: 128 }, { x: 720, y: 128 }, { x: 400, y: 500 }, { x: 620, y: 500 }, { x: 500, y: 750 }]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // 5. Chrome Bolts and Rivets
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    for (let y = 64; y < size; y += 128) {
      for (let x = 64; x < size; x += 128) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 6. Technical Stencil Branding Badges
    ctx.font = '900 28px sans-serif';
    ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
    ctx.fillText('ULTRA FAN 3000', 120, 80);
    ctx.fillText('ROBO-BOSS X-3000', 600, 80);
    ctx.font = '900 20px monospace';
    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.fillText('DANGER: ROCKET LAUNCHER & MINIGUN', 260, 960);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 1, repeatY: 1, isColorMap: true, anisotropy: 8 });
  }

  // Boss Armor Bump Map
  public static getBossRoboBumpTexture(): THREE.CanvasTexture {
    const cacheKey = 'boss_robo_bump_v1';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    // Raised armor panels
    ctx.fillStyle = '#c0c0c0';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#202020';

    const panelSize = 256;
    for (let py = 0; py < size; py += panelSize) {
      for (let px = 0; px < size; px += panelSize) {
        ctx.fillRect(px + 8, py + 8, panelSize - 16, panelSize - 16);
        ctx.strokeRect(px + 8, py + 8, panelSize - 16, panelSize - 16);
      }
    }

    // Rivet height
    ctx.fillStyle = '#ffffff';
    for (let y = 64; y < size; y += 128) {
      for (let x = 64; x < size; x += 128) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 1, repeatY: 1, isColorMap: false, anisotropy: 8 });
  }
}

