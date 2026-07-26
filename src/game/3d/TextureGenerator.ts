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
  // ==========================================
  // SHARED PROCEDURAL HELPERS (mine + hell biomes)
  // ==========================================

  /**
   * Runs `draw` once for the shape at (x, y) plus wrapped copies whenever the shape's
   * bounding radius crosses a canvas edge, so decals never get chopped at the tile seam.
   */
  private static drawWrapped(
    size: number,
    x: number,
    y: number,
    radius: number,
    draw: (cx: number, cy: number) => void,
    wrapY: boolean = true
  ): void {
    const dxs: number[] = [0];
    if (x - radius < 0) dxs.push(size);
    if (x + radius > size) dxs.push(-size);

    const dys: number[] = [0];
    if (wrapY) {
      if (y - radius < 0) dys.push(size);
      if (y + radius > size) dys.push(-size);
    }

    for (const dx of dxs) {
      for (const dy of dys) {
        draw(x + dx, y + dy);
      }
    }
  }

  /**
   * Vertical displacement for a sedimentary bedding plane. Built from sines whose periods
   * divide the canvas width exactly, so a band drawn across the full width tiles perfectly.
   */
  private static strataOffset(x: number, size: number, amp: number, phase: number): number {
    const t = (x / size) * Math.PI * 2;
    return (
      Math.sin(t + phase) * amp +
      Math.sin(t * 3 + phase * 2.3) * amp * 0.45 +
      Math.sin(t * 7 + phase * 0.7) * amp * 0.18
    );
  }

  /** Recursive branching fracture. Uses the ctx's current strokeStyle; sets its own lineWidth. */
  private static drawCrack(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    length: number,
    width: number,
    depth: number,
    rand: () => number = Math.random
  ): void {
    const steps = Math.max(3, Math.round(length / 14));
    const stepLen = length / steps;
    let cx = x;
    let cy = y;
    let a = angle;
    const pts: Array<{ x: number; y: number }> = [{ x: cx, y: cy }];

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.75;
      cx += Math.cos(a) * stepLen;
      cy += Math.sin(a) * stepLen;
      pts.push({ x: cx, y: cy });
      ctx.lineTo(cx, cy);
    }
    ctx.lineWidth = Math.max(0.4, width);
    ctx.stroke();

    if (depth > 0) {
      const branches = rand() > 0.45 ? 2 : 1;
      for (let b = 0; b < branches; b++) {
        const p = pts[1 + Math.floor(rand() * (pts.length - 1))];
        this.drawCrack(ctx, p.x, p.y, a + (rand() - 0.5) * 2.1, length * 0.45, width * 0.6, depth - 1, rand);
      }
    }
  }

  /** A single meandering polyline sampled once and reused for halo / glow / core passes. */
  private static veinPath(
    x: number,
    y: number,
    angle: number,
    length: number,
    wobble: number
  ): Array<{ x: number; y: number }> {
    const steps = Math.max(4, Math.round(length / 18));
    const stepLen = length / steps;
    const pts: Array<{ x: number; y: number }> = [{ x, y }];
    let cx = x;
    let cy = y;
    let a = angle;
    for (let i = 0; i < steps; i++) {
      a += (Math.random() - 0.5) * wobble;
      cx += Math.cos(a) * stepLen;
      cy += Math.sin(a) * stepLen;
      pts.push({ x: cx, y: cy });
    }
    return pts;
  }

  private static strokePath(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>, offX = 0, offY = 0): void {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x + offX, pts[0].y + offY);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + offX, pts[i].y + offY);
    ctx.stroke();
  }

  /** Small seeded PRNG - used only where a colour map and its bump map must agree. */
  private static mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Shared layouts -------------------------------------------------------
  // A bump map only reads correctly if its ridges land on the same features as the
  // colour map's. These layouts are generated once in normalised 0..1 space and used
  // by both maps, which run at different resolutions but identical repeat factors.

  private static mineStrataLayout: Array<{ top: number; h: number; amp: number; phase: number; tone: number }> | null = null;

  private static getMineStrata(): Array<{ top: number; h: number; amp: number; phase: number; tone: number }> {
    if (this.mineStrataLayout) return this.mineStrataLayout;
    const rand = this.mulberry32(0x5eed0001);
    const bands: Array<{ top: number; h: number; amp: number; phase: number; tone: number }> = [];
    let top = -0.06;
    let phase = rand() * Math.PI * 2;
    while (top < 1.04) {
      const h = 0.025 + rand() * 0.08;
      phase += 0.6 + rand() * 1.4;
      bands.push({ top, h, amp: 0.005 + rand() * 0.016, phase, tone: rand() });
      top += h;
    }
    this.mineStrataLayout = bands;
    return bands;
  }

  /** Normalised y positions of the mine's half-buried rail sleepers. */
  private static mineSleeperLayout: number[] | null = null;

  private static getMineSleepers(): number[] {
    if (this.mineSleeperLayout) return this.mineSleeperLayout;
    const rand = this.mulberry32(0x5eed0002);
    const ys: number[] = [];
    const gap = 1 / 6;
    for (let i = 0; i < 6; i++) ys.push(0.039 + i * gap + (rand() - 0.5) * 0.012);
    this.mineSleeperLayout = ys;
    return ys;
  }

  private static hellWallLayout: {
    courses: number;
    blocks: Array<{ x: number; w: number; course: number; tone: number }>;
    bands: Array<{ y: number; h: number; glyphs: Array<{ x: number; dy: number; seed: number; ember: boolean }> }>;
  } | null = null;

  /** Cyclopean course/block runs plus the inscribed rune bands, in normalised units. */
  private static getHellWallLayout() {
    if (this.hellWallLayout) return this.hellWallLayout;
    const rand = this.mulberry32(0x5eed0003);
    const courses = 8;
    const courseH = 1 / courses;
    const blocks: Array<{ x: number; w: number; course: number; tone: number }> = [];

    for (let ci = 0; ci < courses; ci++) {
      let x = -(0.04 + rand() * 0.2);
      while (x < 1) {
        const w = 0.145 + rand() * 0.19;
        blocks.push({ x, w, course: ci, tone: rand() });
        x += w;
      }
    }

    const bands: Array<{ y: number; h: number; glyphs: Array<{ x: number; dy: number; seed: number; ember: boolean }> }> = [];
    for (let ci = 0; ci < courses; ci++) {
      if (rand() > 0.42) continue; // only some courses were ever inscribed
      const h = 0.042 + rand() * 0.026;
      const y = ci * courseH + 0.022 + rand() * (courseH - h - 0.045);
      const glyphW = h * 0.55;
      const glyphs: Array<{ x: number; dy: number; seed: number; ember: boolean }> = [];
      let gx = rand() * 0.02;
      while (gx < 1) {
        // Gaps and skips: a hand-cut inscription, not a stamped repeat
        if (rand() > 0.14) {
          glyphs.push({ x: gx, dy: (rand() - 0.5) * h * 0.16, seed: (rand() * 0xffffff) | 0, ember: rand() > 0.68 });
        }
        gx += glyphW + 0.014 + rand() * 0.028;
      }
      bands.push({ y, h, glyphs });
    }

    this.hellWallLayout = { courses, blocks, bands };
    return this.hellWallLayout;
  }

  private static hellFlagLayout: { cells: number; vx: number[][]; vy: number[][] } | null = null;

  /**
   * Fully periodic jittered lattice for the hell flagstones: every vertex is jittered,
   * including the ones on the border, and the far row/column is pinned to the near one
   * plus one tile. Stones therefore straddle the tile seam instead of lining up along it.
   */
  private static getHellFlagLattice() {
    if (this.hellFlagLayout) return this.hellFlagLayout;
    const rand = this.mulberry32(0x5eed0004);
    const cells = 7;
    const step = 1 / cells;
    const jitter = step * 0.24;
    const vx: number[][] = [];
    const vy: number[][] = [];

    for (let r = 0; r <= cells; r++) {
      vx[r] = [];
      vy[r] = [];
      for (let c = 0; c <= cells; c++) {
        vx[r][c] = c * step + (rand() - 0.5) * jitter * 2;
        vy[r][c] = r * step + (rand() - 0.5) * jitter * 2;
      }
    }
    // Periodic wrap: right column == left column shifted one tile, same for bottom row
    for (let r = 0; r <= cells; r++) {
      vx[r][cells] = vx[r][0] + 1;
      vy[r][cells] = vy[r][0];
    }
    for (let c = 0; c <= cells; c++) {
      vx[cells][c] = vx[0][c];
      vy[cells][c] = vy[0][c] + 1;
    }
    vx[cells][cells] = vx[0][0] + 1;
    vy[cells][cells] = vy[0][0] + 1;

    this.hellFlagLayout = { cells, vx, vy };
    return this.hellFlagLayout;
  }

  // ==========================================
  // ABYSSAL MINE - HEWN ROCK WALL FACE
  // ==========================================
  public static getMineRockTexture(): THREE.CanvasTexture {
    const cacheKey = 'mine_rock_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // 1. Damp bedrock foundation - darker at the base where the water sits
    const base = ctx.createLinearGradient(0, 0, 0, size);
    base.addColorStop(0, '#191308');
    base.addColorStop(0.35, '#141009');
    base.addColorStop(0.75, '#100c07');
    base.addColorStop(1, '#0a0805');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    // 2. SEDIMENTARY STRATA - stacked bands of differently aged rock.
    // Band edges follow a wave whose period divides the width, so the seam tiles.
    const strataTones = [
      '#221809', '#19120a', '#2a1e11', '#150f07', '#2f2214',
      '#1e1608', '#261c11', '#120d06', '#352618', '#1b1409',
    ];
    for (const band of this.getMineStrata()) {
      const bandTop = band.top * size;
      const bandH = band.h * size;
      const amp = band.amp * size;
      const phase = band.phase;
      const tone = strataTones[Math.floor(band.tone * strataTones.length) % strataTones.length];

      ctx.beginPath();
      ctx.moveTo(0, bandTop + this.strataOffset(0, size, amp, phase));
      for (let x = 8; x <= size; x += 8) {
        ctx.lineTo(x, bandTop + this.strataOffset(x, size, amp, phase));
      }
      for (let x = size; x >= 0; x -= 8) {
        ctx.lineTo(x, bandTop + bandH + this.strataOffset(x, size, amp * 0.8, phase + 1.1));
      }
      ctx.closePath();
      ctx.fillStyle = tone;
      ctx.fill();

      // Mottling within the band so the strata don't read as flat painted stripes
      ctx.save();
      ctx.clip();
      for (let m = 0; m < 26; m++) {
        const mx = Math.random() * size;
        const my = bandTop + Math.random() * bandH;
        const mr = 20 + Math.random() * 90;
        const mg = ctx.createRadialGradient(mx, my, 1, mx, my, mr);
        mg.addColorStop(0, Math.random() > 0.5 ? 'rgba(0, 0, 0, 0.35)' : 'rgba(96, 76, 50, 0.14)');
        mg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Bedding plane: a hairline of pale mineral dust on the upper edge, shadow below it
      ctx.strokeStyle = 'rgba(190, 172, 140, 0.16)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, bandTop + this.strataOffset(0, size, amp, phase));
      for (let x = 8; x <= size; x += 8) ctx.lineTo(x, bandTop + this.strataOffset(x, size, amp, phase));
      ctx.stroke();

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, bandTop + 2 + this.strataOffset(0, size, amp, phase));
      for (let x = 8; x <= size; x += 8) ctx.lineTo(x, bandTop + 2 + this.strataOffset(x, size, amp, phase));
      ctx.stroke();
    }

    // 3. BROKEN ROCK FACETS - angular chunks catching the lamplight
    for (let f = 0; f < 150; f++) {
      const fx = Math.random() * size;
      const fy = Math.random() * size;
      const r = 12 + Math.random() * 54;
      const verts = 5 + Math.floor(Math.random() * 3);
      const lit = Math.random() > 0.55;

      this.drawWrapped(size, fx, fy, r + 4, (cx, cy) => {
        ctx.beginPath();
        for (let v = 0; v < verts; v++) {
          const a = (v / verts) * Math.PI * 2 + Math.random() * 0.35;
          const rr = r * (0.55 + Math.random() * 0.55);
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr * 0.7;
          if (v === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = lit ? 'rgba(120, 100, 72, 0.12)' : 'rgba(0, 0, 0, 0.30)';
        ctx.fill();
        // Chipped bright edge along the top of a lit facet
        if (lit) {
          ctx.strokeStyle = 'rgba(198, 176, 132, 0.16)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
    }

    // 4. PICK & CHISEL MARKS - clustered arcs where the rock was worked by hand
    for (let cluster = 0; cluster < 26; cluster++) {
      const ox = Math.random() * size;
      const oy = Math.random() * size;
      const swing = -0.9 + Math.random() * 1.8;
      const marks = 8 + Math.floor(Math.random() * 16);

      for (let m = 0; m < marks; m++) {
        const mx = ox + (Math.random() - 0.5) * 190;
        const my = oy + (Math.random() - 0.5) * 150;
        const len = 10 + Math.random() * 30;
        const a = swing + (Math.random() - 0.5) * 0.45;

        this.drawWrapped(size, mx, my, len + 6, (cx, cy) => {
          // Gouge shadow
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
          ctx.lineWidth = 2 + Math.random() * 2.5;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.quadraticCurveTo(
            cx + Math.cos(a) * len * 0.5 - Math.sin(a) * 5,
            cy + Math.sin(a) * len * 0.5 + Math.cos(a) * 5,
            cx + Math.cos(a) * len,
            cy + Math.sin(a) * len
          );
          ctx.stroke();
          // Fresh rock exposed on the upper lip of the gouge
          ctx.strokeStyle = 'rgba(186, 164, 124, 0.19)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(cx, cy - 2);
          ctx.quadraticCurveTo(
            cx + Math.cos(a) * len * 0.5 - Math.sin(a) * 5,
            cy - 2 + Math.sin(a) * len * 0.5 + Math.cos(a) * 5,
            cx + Math.cos(a) * len,
            cy - 2 + Math.sin(a) * len
          );
          ctx.stroke();
        });
      }
    }

    // 5. FRACTURES - branching cracks through the strata
    for (let c = 0; c < 34; c++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = 60 + Math.random() * 200;
      this.drawWrapped(size, x, y, len, (cx, cy) => {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        this.drawCrack(ctx, cx, cy, Math.random() * Math.PI * 2, len, 2.6, 2);
        // Dust highlight offset one pixel so the crack reads as an actual gap
        ctx.strokeStyle = 'rgba(160, 145, 115, 0.10)';
        this.drawCrack(ctx, cx + 1.5, cy - 1.5, Math.random() * Math.PI * 2, len * 0.6, 1.1, 1);
      });
    }

    // 6. ORE VEINS - amber mineral embedded IN the rock. Deliberately restrained: short,
    // broken runs that mostly follow the bedding, so they read as ore and not as neon.
    for (let v = 0; v < 22; v++) {
      const vx = Math.random() * size;
      const vy = Math.random() * size;
      const len = 40 + Math.random() * 150;
      // Bias the run toward horizontal - ore follows the strata it was laid down with
      const angle = (Math.random() - 0.5) * 0.9 + (Math.random() > 0.5 ? 0 : Math.PI);
      const pts = this.veinPath(0, 0, angle, len, 0.55);
      const rich = Math.random() > 0.7;

      this.drawWrapped(size, vx, vy, len, (cx, cy) => {
        ctx.save();
        ctx.lineCap = 'round';

        // Mineral-stained host rock around the seam
        ctx.strokeStyle = 'rgba(58, 38, 12, 0.5)';
        ctx.lineWidth = 9;
        this.strokePath(ctx, pts, cx, cy);

        // Broken-up ore: skip segments so the seam pinches out and reappears
        const segs: Array<Array<{ x: number; y: number }>> = [];
        let run: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < pts.length; i++) {
          if (Math.random() > 0.28) run.push(pts[i]);
          else if (run.length > 1) { segs.push(run); run = []; }
          else run = [];
        }
        if (run.length > 1) segs.push(run);

        for (const seg of segs) {
          // Dim warm bloom - just enough to catch the eye in a dark tunnel
          ctx.shadowColor = '#c8700a';
          ctx.shadowBlur = 9;
          ctx.strokeStyle = rich ? 'rgba(190, 116, 22, 0.42)' : 'rgba(132, 82, 20, 0.3)';
          ctx.lineWidth = 3.5;
          this.strokePath(ctx, seg, cx, cy);

          ctx.shadowBlur = 4;
          ctx.strokeStyle = rich ? 'rgba(214, 158, 62, 0.85)' : 'rgba(150, 110, 48, 0.75)';
          ctx.lineWidth = 1.3;
          this.strokePath(ctx, seg, cx, cy);
        }

        // A few crystalline glints where the ore is exposed
        ctx.shadowBlur = 6;
        for (let n = 0; n < pts.length; n++) {
          if (Math.random() > 0.22) continue;
          const p = pts[n];
          const r = 1.5 + Math.random() * 2.6;
          ctx.fillStyle = rich ? 'rgba(236, 190, 106, 0.9)' : 'rgba(170, 128, 60, 0.8)';
          ctx.beginPath();
          ctx.moveTo(cx + p.x, cy + p.y - r);
          ctx.lineTo(cx + p.x + r * 0.8, cy + p.y);
          ctx.lineTo(cx + p.x, cy + p.y + r);
          ctx.lineTo(cx + p.x - r * 0.8, cy + p.y);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });
    }

    // 7. WET SEEPAGE - dark saturated patches with a sheen and running drips
    for (let w = 0; w < 15; w++) {
      const wx = Math.random() * size;
      const wy = Math.random() * (size * 0.75);
      const rw = 45 + Math.random() * 130;
      const rh = rw * (0.5 + Math.random() * 0.55);

      this.drawWrapped(size, wx, wy, rw + 20, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rw);
        g.addColorStop(0, 'rgba(6, 5, 4, 0.8)');
        g.addColorStop(0.55, 'rgba(9, 8, 6, 0.45)');
        g.addColorStop(1, 'rgba(10, 9, 7, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rw, rh, Math.random() * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Specular sheen - wet rock catches the lamp light
        ctx.strokeStyle = 'rgba(168, 152, 118, 0.10)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx - rw * 0.15, cy - rh * 0.35, rw * 0.45, rh * 0.3, -0.4, 0.6, 2.6);
        ctx.stroke();

        // Drips running down out of the patch
        const drips = 3 + Math.floor(Math.random() * 6);
        for (let d = 0; d < drips; d++) {
          const dx = cx + (Math.random() - 0.5) * rw * 1.4;
          const dLen = 30 + Math.random() * 180;
          const dg = ctx.createLinearGradient(dx, cy, dx, cy + dLen);
          dg.addColorStop(0, 'rgba(7, 6, 5, 0.65)');
          dg.addColorStop(1, 'rgba(7, 6, 5, 0)');
          ctx.fillStyle = dg;
          ctx.fillRect(dx, cy, 2 + Math.random() * 5, dLen);
        }
      });
    }

    // 8. MINERAL EFFLORESCENCE - pale crusty salt bloom around the damp
    for (let e = 0; e < 22; e++) {
      const ex = Math.random() * size;
      const ey = Math.random() * size;
      const spread = 25 + Math.random() * 60;
      this.drawWrapped(size, ex, ey, spread + 6, (cx, cy) => {
        for (let s = 0; s < 90; s++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.pow(Math.random(), 0.6) * spread;
          const alpha = 0.05 + Math.random() * 0.18;
          ctx.fillStyle = Math.random() > 0.35
            ? `rgba(198, 200, 176, ${alpha})`
            : `rgba(150, 176, 150, ${alpha})`;
          ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.75, 1 + Math.random() * 3, 1 + Math.random() * 2);
        }
      });
    }

    // 9. LAMP HOOKS & SOOT - iron spikes with a century of smoke above them
    for (const lamp of [{ x: 170, y: 300 }, { x: 610, y: 250 }, { x: 880, y: 360 }]) {
      const soot = ctx.createLinearGradient(lamp.x, lamp.y, lamp.x, lamp.y - 300);
      soot.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
      soot.addColorStop(0.5, 'rgba(0, 0, 0, 0.3)');
      soot.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = soot;
      ctx.beginPath();
      ctx.moveTo(lamp.x - 26, lamp.y);
      ctx.lineTo(lamp.x + 26, lamp.y);
      ctx.lineTo(lamp.x + 78, lamp.y - 300);
      ctx.lineTo(lamp.x - 78, lamp.y - 300);
      ctx.closePath();
      ctx.fill();

      // Rusted iron spike driven into the rock
      ctx.fillStyle = '#1a120b';
      ctx.fillRect(lamp.x - 5, lamp.y - 4, 30, 7);
      ctx.fillStyle = 'rgba(96, 74, 44, 0.6)';
      ctx.fillRect(lamp.x - 5, lamp.y - 4, 30, 2);
      ctx.strokeStyle = 'rgba(74, 44, 18, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(lamp.x + 24, lamp.y + 3, 7, Math.PI * 1.1, Math.PI * 2.2);
      ctx.stroke();
      // Rust bleed below the hook
      const rust = ctx.createLinearGradient(lamp.x, lamp.y + 3, lamp.x, lamp.y + 80);
      rust.addColorStop(0, 'rgba(96, 46, 14, 0.22)');
      rust.addColorStop(1, 'rgba(96, 46, 14, 0)');
      ctx.fillStyle = rust;
      ctx.fillRect(lamp.x - 6, lamp.y + 3, 34, 80);
    }

    // 10. Coal dust settling into the lower half of every wall
    const dust = ctx.createLinearGradient(0, size * 0.55, 0, size);
    dust.addColorStop(0, 'rgba(0, 0, 0, 0)');
    dust.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = dust;
    ctx.fillRect(0, size * 0.55, size, size * 0.45);

    this.addFastNoiseOverlay(ctx, size, size, 0.16, false);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 3, repeatY: 1, isColorMap: true, anisotropy: 8 });
  }

  // Mine rock wall bump - strata relief, gouges, open fractures
  public static getMineRockBumpTexture(): THREE.CanvasTexture {
    const cacheKey = 'mine_rock_bump_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 512;
    const { canvas, ctx } = this.createCanvas(size, size);

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    // Strata relief - same bands as the colour map so the shading lands on the same rock
    for (const band of this.getMineStrata()) {
      const bandTop = band.top * size;
      const bandH = band.h * size;
      const amp = band.amp * size;
      const phase = band.phase;
      const v = 96 + Math.floor(band.tone * 88);

      ctx.beginPath();
      ctx.moveTo(0, bandTop + this.strataOffset(0, size, amp, phase));
      for (let x = 6; x <= size; x += 6) ctx.lineTo(x, bandTop + this.strataOffset(x, size, amp, phase));
      for (let x = size; x >= 0; x -= 6) ctx.lineTo(x, bandTop + bandH + this.strataOffset(x, size, amp * 0.8, phase + 1.1));
      ctx.closePath();
      ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
      ctx.fill();

      // Recessed bedding plane
      ctx.strokeStyle = 'rgba(20, 20, 20, 0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, bandTop + this.strataOffset(0, size, amp, phase));
      for (let x = 6; x <= size; x += 6) ctx.lineTo(x, bandTop + this.strataOffset(x, size, amp, phase));
      ctx.stroke();
    }

    // Lumpy rock facets
    for (let f = 0; f < 120; f++) {
      const fx = Math.random() * size;
      const fy = Math.random() * size;
      const r = 8 + Math.random() * 30;
      const proud = Math.random() > 0.5;
      this.drawWrapped(size, fx, fy, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
        g.addColorStop(0, proud ? 'rgba(235, 235, 235, 0.55)' : 'rgba(30, 30, 30, 0.5)');
        g.addColorStop(1, 'rgba(128, 128, 128, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Pick gouges cut into the surface
    for (let m = 0; m < 320; m++) {
      const mx = Math.random() * size;
      const my = Math.random() * size;
      const len = 6 + Math.random() * 20;
      const a = Math.random() * Math.PI * 2;
      this.drawWrapped(size, mx, my, len, (cx, cy) => {
        ctx.strokeStyle = 'rgba(24, 24, 24, 0.7)';
        ctx.lineWidth = 1.5 + Math.random() * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(225, 225, 225, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 2);
        ctx.lineTo(cx + Math.cos(a) * len, cy - 2 + Math.sin(a) * len);
        ctx.stroke();
      });
    }

    // Deep fractures
    for (let c = 0; c < 22; c++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = 40 + Math.random() * 130;
      this.drawWrapped(size, x, y, len, (cx, cy) => {
        ctx.strokeStyle = '#0d0d0d';
        this.drawCrack(ctx, cx, cy, Math.random() * Math.PI * 2, len, 2.5, 2);
      });
    }

    // Ore seams sit slightly proud of the softer host rock
    for (let v = 0; v < 12; v++) {
      const pts = this.veinPath(0, 0, Math.random() * Math.PI * 2, 60 + Math.random() * 170, 0.85);
      const vx = Math.random() * size;
      const vy = Math.random() * size;
      this.drawWrapped(size, vx, vy, 200, (cx, cy) => {
        ctx.strokeStyle = 'rgba(215, 215, 215, 0.6)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        this.strokePath(ctx, pts, cx, cy);
      });
    }

    this.addFastNoiseOverlay(ctx, size, size, 0.3, true);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 3, repeatY: 1, isColorMap: false, anisotropy: 8 });
  }

  // ==========================================
  // ABYSSAL MINE - PACKED DIRT & GRAVEL FLOOR
  // ==========================================
  public static getMineFloorTexture(): THREE.CanvasTexture {
    const cacheKey = 'mine_floor_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // 1. Packed earth base
    ctx.fillStyle = '#17110b';
    ctx.fillRect(0, 0, size, size);

    // Mottled patches of drier / wetter ground
    for (let p = 0; p < 220; p++) {
      const px = Math.random() * size;
      const py = Math.random() * size;
      const r = 40 + Math.random() * 150;
      const wet = Math.random() > 0.55;
      this.drawWrapped(size, px, py, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
        g.addColorStop(0, wet ? 'rgba(8, 7, 5, 0.5)' : 'rgba(66, 50, 32, 0.28)');
        g.addColorStop(1, 'rgba(23, 17, 11, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 2. TIMBER SLEEPERS half-buried in the dirt (old rail bed)
    for (const sn of this.getMineSleepers()) {
      const sy = sn * size;
      const h = 0.033 * size;
      const jitter = 0;

      // Impression / shadow trench the sleeper sits in
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.fillRect(0, sy + jitter - 6, size, h + 14);

      // The timber itself, buried under drifted dirt
      ctx.fillStyle = '#241a10';
      ctx.fillRect(0, sy + jitter, size, h);

      // Wood grain along the sleeper
      for (let g = 0; g < 60; g++) {
        const gy = sy + jitter + Math.random() * h;
        ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(70, 50, 28, 0.5)' : 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 0.6 + Math.random() * 1.6;
        ctx.beginPath();
        const gx = Math.random() * size;
        ctx.moveTo(gx - 120, gy);
        ctx.bezierCurveTo(gx - 40, gy + 2, gx + 40, gy - 2, gx + 160, gy);
        ctx.stroke();
      }

      // Dirt drifting back over the timber so it doesn't read as a clean plank
      for (let d = 0; d < 26; d++) {
        const dx = Math.random() * size;
        ctx.fillStyle = 'rgba(28, 20, 13, 0.75)';
        ctx.beginPath();
        ctx.ellipse(dx, sy + jitter + (Math.random() > 0.5 ? 0 : h), 20 + Math.random() * 60, 6 + Math.random() * 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rusted spike plates
      for (let s = 0; s < 4; s++) {
        const sx = 90 + s * 250 + Math.random() * 60;
        ctx.fillStyle = '#241708';
        ctx.fillRect(sx, sy + jitter + h * 0.3, 14, 12);
        ctx.fillStyle = 'rgba(96, 50, 16, 0.4)';
        ctx.fillRect(sx, sy + jitter + h * 0.3, 14, 4);
      }
    }

    // 3. GRAVEL - hundreds of small stones with a lit top and cast shadow
    for (let g = 0; g < 1400; g++) {
      const gx = Math.random() * size;
      const gy = Math.random() * size;
      const r = 1.5 + Math.random() * 6;
      const shade = 40 + Math.floor(Math.random() * 70);
      this.drawWrapped(size, gx, gy, r + 3, (cx, cy) => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.ellipse(cx + 1.5, cy + 1.8, r, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgb(${shade}, ${Math.floor(shade * 0.85)}, ${Math.floor(shade * 0.66)})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.8, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(178, 154, 112, ${0.06 + Math.random() * 0.12})`;
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.25, cy - r * 0.3, r * 0.45, r * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 4. RUBBLE - fallen chunks of the ceiling, faceted
    for (let r = 0; r < 90; r++) {
      const rx = Math.random() * size;
      const ry = Math.random() * size;
      const rad = 10 + Math.random() * 26;
      const verts = 5 + Math.floor(Math.random() * 3);
      this.drawWrapped(size, rx, ry, rad + 8, (cx, cy) => {
        const poly: Array<{ x: number; y: number }> = [];
        for (let v = 0; v < verts; v++) {
          const a = (v / verts) * Math.PI * 2 + Math.random() * 0.4;
          const rr = rad * (0.6 + Math.random() * 0.5);
          poly.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.85 });
        }
        // Contact shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x + 4, p.y + 5) : ctx.lineTo(p.x + 4, p.y + 5)));
        ctx.closePath();
        ctx.fill();
        // Stone body
        const g = ctx.createLinearGradient(cx - rad, cy - rad, cx + rad, cy + rad);
        g.addColorStop(0, '#4d4034');
        g.addColorStop(0.55, '#2c2419');
        g.addColorStop(1, '#161009');
        ctx.fillStyle = g;
        ctx.beginPath();
        poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
        // Fracture facet across the chunk
        ctx.strokeStyle = 'rgba(190, 172, 140, 0.16)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        ctx.lineTo(cx, cy);
        ctx.lineTo(poly[Math.floor(verts / 2)].x, poly[Math.floor(verts / 2)].y);
        ctx.stroke();
      });
    }

    // 5. BOOT SCUFF TRACKS - wandering trails where the dirt is polished smooth
    for (let t = 0; t < 7; t++) {
      let bx = Math.random() * size;
      let by = Math.random() * size;
      let a = Math.random() * Math.PI * 2;
      const steps = 22 + Math.floor(Math.random() * 20);
      for (let s = 0; s < steps; s++) {
        a += (Math.random() - 0.5) * 0.5;
        bx += Math.cos(a) * 34;
        by += Math.sin(a) * 34;
        const fx = ((bx % size) + size) % size;
        const fy = ((by % size) + size) % size;
        const side = s % 2 === 0 ? 9 : -9;
        this.drawWrapped(size, fx, fy, 34, (cx, cy) => {
          ctx.save();
          ctx.translate(cx - Math.sin(a) * side, cy + Math.cos(a) * side);
          ctx.rotate(a + Math.PI / 2);
          // Smeared heel print
          ctx.fillStyle = 'rgba(6, 5, 4, 0.42)';
          ctx.beginPath();
          ctx.ellipse(0, 0, 8 + Math.random() * 4, 16 + Math.random() * 6, 0, 0, Math.PI * 2);
          ctx.fill();
          // Tread bars
          ctx.fillStyle = 'rgba(92, 76, 52, 0.22)';
          for (let tb = -12; tb < 12; tb += 5) ctx.fillRect(-6, tb, 12, 2.2);
          ctx.restore();
        });
      }
    }

    // 6. DARK WATER PUDDLES sitting in the low spots - near black, irregular edged,
    // holding only a dim warm reflection of a lamp somewhere off to the side.
    for (let p = 0; p < 9; p++) {
      const px = Math.random() * size;
      const py = Math.random() * size;
      const rw = 30 + Math.random() * 85;
      const rh = rw * (0.4 + Math.random() * 0.4);
      const rot = Math.random() * Math.PI;
      // Irregular outline - water pools into the shape of the ground, not an ellipse
      const lobes = 11;
      const radii: number[] = [];
      for (let l = 0; l < lobes; l++) radii.push(0.72 + Math.random() * 0.42);

      const outline = (cx: number, cy: number, scale: number) => {
        ctx.beginPath();
        for (let l = 0; l <= lobes; l++) {
          const a = (l / lobes) * Math.PI * 2;
          const rr = radii[l % lobes] * scale;
          const ex = Math.cos(a) * rw * rr;
          const ey = Math.sin(a) * rh * rr;
          const rx = cx + ex * Math.cos(rot) - ey * Math.sin(rot);
          const ry = cy + ex * Math.sin(rot) + ey * Math.cos(rot);
          if (l === 0) ctx.moveTo(rx, ry);
          else ctx.lineTo(rx, ry);
        }
        ctx.closePath();
      };

      this.drawWrapped(size, px, py, rw + 20, (cx, cy) => {
        // Damp halo soaked into the dirt around the water
        ctx.fillStyle = 'rgba(11, 8, 6, 0.5)';
        outline(cx, cy, 1.22);
        ctx.fill();
        // Standing water - not quite opaque, so the ground reads through the shallows
        const g = ctx.createLinearGradient(cx, cy - rh, cx, cy + rh);
        g.addColorStop(0, 'rgba(16, 15, 13, 0.86)');
        g.addColorStop(0.45, 'rgba(6, 6, 5, 0.94)');
        g.addColorStop(1, 'rgba(13, 12, 11, 0.88)');
        ctx.fillStyle = g;
        outline(cx, cy, 1);
        ctx.fill();
        // Silt showing through at the shallow edge
        ctx.strokeStyle = 'rgba(52, 42, 30, 0.35)';
        ctx.lineWidth = 5;
        outline(cx, cy, 0.94);
        ctx.stroke();
        // Dim lamp reflection broken across the surface
        ctx.strokeStyle = 'rgba(150, 118, 62, 0.13)';
        ctx.lineWidth = 1.5;
        for (let r = 0; r < 3; r++) {
          const ry = cy - rh * 0.4 + (r / 3) * rh * 0.9;
          ctx.beginPath();
          ctx.moveTo(cx - rw * 0.4, ry);
          ctx.lineTo(cx + rw * (0.05 + Math.random() * 0.35), ry);
          ctx.stroke();
        }
        // Faint wet rim
        ctx.strokeStyle = 'rgba(140, 126, 96, 0.09)';
        ctx.lineWidth = 2;
        outline(cx, cy, 1);
        ctx.stroke();
      });
    }

    // 7. SPILLED ORE - a dropped cartload half-trodden into the dirt
    for (let o = 0; o < 5; o++) {
      const ox = Math.random() * size;
      const oy = Math.random() * size;
      const spread = 26 + Math.random() * 55;
      this.drawWrapped(size, ox, oy, spread + 10, (cx, cy) => {
        ctx.save();
        ctx.shadowColor = '#b06a08';
        ctx.shadowBlur = 6;
        for (let n = 0; n < 12; n++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.pow(Math.random(), 0.7) * spread;
          const nx = cx + Math.cos(a) * r;
          const ny = cy + Math.sin(a) * r * 0.8;
          const nr = 1.5 + Math.random() * 3;
          ctx.fillStyle = Math.random() > 0.4 ? 'rgba(150, 106, 34, 0.85)' : 'rgba(198, 154, 74, 0.8)';
          ctx.beginPath();
          ctx.moveTo(nx, ny - nr);
          ctx.lineTo(nx + nr, ny);
          ctx.lineTo(nx, ny + nr);
          ctx.lineTo(nx - nr, ny);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });
    }

    // 8. Coal dust and fine grit settled over everything
    for (let d = 0; d < 600; d++) {
      ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + Math.random() * 0.5})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }

    this.addFastNoiseOverlay(ctx, size, size, 0.18, false);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 4, repeatY: 4, isColorMap: true, anisotropy: 8 });
  }

  // Mine floor bump - gravel bumps, sleeper ridges, sunken puddles
  public static getMineFloorBumpTexture(): THREE.CanvasTexture {
    const cacheKey = 'mine_floor_bump_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 512;
    const { canvas, ctx } = this.createCanvas(size, size);

    ctx.fillStyle = '#6e6e6e';
    ctx.fillRect(0, 0, size, size);

    // Broad undulation of the packed earth
    for (let u = 0; u < 120; u++) {
      const ux = Math.random() * size;
      const uy = Math.random() * size;
      const r = 25 + Math.random() * 80;
      const up = Math.random() > 0.5;
      this.drawWrapped(size, ux, uy, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
        g.addColorStop(0, up ? 'rgba(210, 210, 210, 0.35)' : 'rgba(45, 45, 45, 0.35)');
        g.addColorStop(1, 'rgba(110, 110, 110, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Sleeper ridges (proud) sunk in trenches (recessed) - same rows as the colour map
    for (const sn of this.getMineSleepers()) {
      const sy = sn * size;
      const h = 0.033 * size;
      ctx.fillStyle = 'rgba(35, 35, 35, 0.8)';
      ctx.fillRect(0, sy - 6, size, h + 14);
      ctx.fillStyle = 'rgba(180, 180, 180, 0.85)';
      ctx.fillRect(0, sy, size, h);
      for (let g = 0; g < 40; g++) {
        ctx.fillStyle = 'rgba(90, 90, 90, 0.5)';
        ctx.fillRect(Math.random() * size, sy + Math.random() * h, 20 + Math.random() * 60, 1.4);
      }
    }

    // Gravel pebbles
    for (let g = 0; g < 1100; g++) {
      const gx = Math.random() * size;
      const gy = Math.random() * size;
      const r = 1 + Math.random() * 4;
      this.drawWrapped(size, gx, gy, r + 2, (cx, cy) => {
        ctx.fillStyle = 'rgba(20, 20, 20, 0.5)';
        ctx.beginPath();
        ctx.arc(cx + 1, cy + 1, r, 0, Math.PI * 2);
        ctx.fill();
        const v = 190 + Math.floor(Math.random() * 60);
        ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Rubble chunks stand well proud
    for (let r = 0; r < 70; r++) {
      const rx = Math.random() * size;
      const ry = Math.random() * size;
      const rad = 5 + Math.random() * 14;
      this.drawWrapped(size, rx, ry, rad + 4, (cx, cy) => {
        ctx.fillStyle = 'rgba(15, 15, 15, 0.6)';
        ctx.beginPath();
        ctx.arc(cx + 2, cy + 3, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f0f0f0';
        ctx.beginPath();
        for (let v = 0; v < 6; v++) {
          const a = (v / 6) * Math.PI * 2 + Math.random() * 0.3;
          const rr = rad * (0.6 + Math.random() * 0.5);
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr * 0.85;
          if (v === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      });
    }

    // Puddles are the lowest points - flat and black
    for (let p = 0; p < 12; p++) {
      const px = Math.random() * size;
      const py = Math.random() * size;
      const rw = 20 + Math.random() * 60;
      const rh = rw * (0.45 + Math.random() * 0.4);
      const rot = Math.random() * Math.PI;
      this.drawWrapped(size, px, py, rw + 6, (cx, cy) => {
        ctx.fillStyle = '#101010';
        ctx.beginPath();
        ctx.ellipse(cx, cy, rw, rh, rot, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    this.addFastNoiseOverlay(ctx, size, size, 0.32, true);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 4, repeatY: 4, isColorMap: false, anisotropy: 8 });
  }

  // ==========================================
  // ABYSSAL MINE - SHORED ROCK CEILING
  // ==========================================
  public static getMineCeilingTexture(): THREE.CanvasTexture {
    const cacheKey = 'mine_ceiling_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // 1. Raw rock overhead, nearly black
    ctx.fillStyle = '#0b0906';
    ctx.fillRect(0, 0, size, size);

    // Lumpy hewn rock - blobs of slightly lit stone
    for (let l = 0; l < 380; l++) {
      const lx = Math.random() * size;
      const ly = Math.random() * size;
      const r = 20 + Math.random() * 110;
      this.drawWrapped(size, lx, ly, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 2, cx, cy, r);
        const lum = 44 + Math.random() * 34;
        g.addColorStop(0, `rgba(${lum | 0}, ${lum * 0.84 | 0}, ${lum * 0.7 | 0}, 0.2)`);
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Fracture network in the roof - the reason it needs shoring
    for (let c = 0; c < 40; c++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = 70 + Math.random() * 240;
      this.drawWrapped(size, x, y, len, (cx, cy) => {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        this.drawCrack(ctx, cx, cy, Math.random() * Math.PI * 2, len, 3, 2);
        ctx.strokeStyle = 'rgba(150, 132, 100, 0.10)';
        this.drawCrack(ctx, cx + 2, cy + 2, Math.random() * Math.PI * 2, len * 0.5, 1.2, 1);
      });
    }

    // 2. TIMBER SUPPORT BEAMS spanning the roof
    const beamGap = 256;
    for (let by = 60; by < size; by += beamGap) {
      const h = 54;

      // Shadow the beam casts on the rock
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(0, by + h - 4, size, 26);

      // Beam body
      const wood = ctx.createLinearGradient(0, by, 0, by + h);
      wood.addColorStop(0, '#150e08');
      wood.addColorStop(0.3, '#3a2716');
      wood.addColorStop(0.65, '#2a1c10');
      wood.addColorStop(1, '#0f0a06');
      ctx.fillStyle = wood;
      ctx.fillRect(0, by, size, h);

      // Adze-hewn grain and splits
      for (let g = 0; g < 90; g++) {
        const gy = by + 3 + Math.random() * (h - 6);
        ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(88, 62, 34, 0.45)' : 'rgba(0, 0, 0, 0.55)';
        ctx.lineWidth = 0.6 + Math.random() * 1.8;
        const gx = Math.random() * size;
        ctx.beginPath();
        ctx.moveTo(gx - 200, gy);
        ctx.bezierCurveTo(gx - 60, gy + 3, gx + 60, gy - 3, gx + 220, gy);
        ctx.stroke();
      }

      // Knots
      for (let k = 0; k < 5; k++) {
        const kx = Math.random() * size;
        const ky = by + 12 + Math.random() * (h - 24);
        this.drawWrapped(size, kx, ky, 14, (cx, cy) => {
          ctx.fillStyle = '#120b06';
          ctx.beginPath();
          ctx.ellipse(cx, cy, 10, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(70, 48, 26, 0.6)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, 13, 8, 0, 0, Math.PI * 2);
          ctx.stroke();
        }, false);
      }

      // Iron strap brackets bolted through the timber
      for (let b = 0; b < 5; b++) {
        const bx = 60 + b * 210 + Math.random() * 40;
        ctx.fillStyle = '#1c1512';
        ctx.fillRect(bx, by - 4, 26, h + 8);
        ctx.fillStyle = 'rgba(120, 58, 18, 0.45)';
        ctx.fillRect(bx, by - 4, 26, 5);
        ctx.fillStyle = '#4a3a2c';
        ctx.beginPath(); ctx.arc(bx + 13, by + 10, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + 13, by + h - 10, 4.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 3. HANGING ROOTS & CABLE RUNS
    for (let r = 0; r < 60; r++) {
      const rx = Math.random() * size;
      const ry = Math.random() * size;
      const len = 25 + Math.random() * 110;
      const isCable = Math.random() > 0.7;
      this.drawWrapped(size, rx, ry, len, (cx, cy) => {
        ctx.strokeStyle = isCable ? 'rgba(30, 26, 24, 0.9)' : 'rgba(46, 36, 22, 0.75)';
        ctx.lineWidth = isCable ? 3.5 : 1 + Math.random() * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.bezierCurveTo(
          cx + (Math.random() - 0.5) * 60, cy + len * 0.4,
          cx + (Math.random() - 0.5) * 80, cy + len * 0.7,
          cx + (Math.random() - 0.5) * 50, cy + len
        );
        ctx.stroke();
        if (isCable) {
          ctx.strokeStyle = 'rgba(120, 110, 100, 0.2)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    }

    // 4. Damp seepage and hanging drips
    for (let d = 0; d < 26; d++) {
      const dx = Math.random() * size;
      const dy = Math.random() * size;
      const r = 25 + Math.random() * 80;
      this.drawWrapped(size, dx, dy, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
        g.addColorStop(0, 'rgba(6, 10, 12, 0.8)');
        g.addColorStop(1, 'rgba(6, 10, 12, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(150, 178, 190, 0.18)';
        ctx.beginPath();
        ctx.arc(cx + (Math.random() - 0.5) * r * 0.5, cy + (Math.random() - 0.5) * r * 0.5, 2 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 5. Faint ore glimmer bleeding through from the seams above
    for (let o = 0; o < 6; o++) {
      const ox = Math.random() * size;
      const oy = Math.random() * size;
      const r = 14 + Math.random() * 12;
      this.drawWrapped(size, ox, oy, r + 4, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
        g.addColorStop(0, 'rgba(196, 122, 34, 0.16)');
        g.addColorStop(1, 'rgba(180, 100, 20, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        // A couple of exposed grains
        ctx.fillStyle = 'rgba(214, 158, 62, 0.6)';
        for (let n = 0; n < 3; n++) {
          ctx.beginPath();
          ctx.arc(cx + (Math.random() - 0.5) * r, cy + (Math.random() - 0.5) * r, 1 + Math.random() * 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // 6. Lamp-smoke soot pooling on the roof
    for (let s = 0; s < 14; s++) {
      const sx = Math.random() * size;
      const sy = Math.random() * size;
      const r = 60 + Math.random() * 120;
      this.drawWrapped(size, sx, sy, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
        g.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    this.addFastNoiseOverlay(ctx, size, size, 0.15, false);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 3, repeatY: 3, isColorMap: true, anisotropy: 8 });
  }

  /**
   * One inscribed demonic glyph. Drawn as a chiselled groove: a bone-white lip offset
   * down-right, the dark cut over it, and (optionally) an ember smouldering in the cut.
   */
  private static drawRuneGlyph(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    ember: boolean,
    rand: () => number = Math.random
  ): void {
    // Lattice of anchor points the strokes snap between - gives an alphabet-like feel
    const cols = 3;
    const rows = 4;
    const px = (c: number) => x + (c / (cols - 1)) * w;
    const py = (r: number) => y + (r / (rows - 1)) * h;

    type Seg = { a: [number, number]; b: [number, number] };
    const segs: Seg[] = [];

    // Always a spine, then 2-5 limbs hanging off it
    const spineCol = Math.floor(rand() * cols);
    segs.push({ a: [spineCol, 0], b: [spineCol, rows - 1] });
    const limbs = 2 + Math.floor(rand() * 4);
    for (let l = 0; l < limbs; l++) {
      const r0 = Math.floor(rand() * rows);
      const c1 = Math.floor(rand() * cols);
      const r1 = Math.min(rows - 1, Math.max(0, r0 + (rand() > 0.5 ? 1 : -1)));
      segs.push({ a: [spineCol, r0], b: [c1, r1] });
    }
    // The odd crossbar
    if (rand() > 0.5) {
      const r = 1 + Math.floor(rand() * (rows - 2));
      segs.push({ a: [0, r], b: [cols - 1, r] });
    }

    const stroke = (color: string, width: number, dx: number, dy: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'square';
      ctx.beginPath();
      for (const s of segs) {
        ctx.moveTo(px(s.a[0]) + dx, py(s.a[1]) + dy);
        ctx.lineTo(px(s.b[0]) + dx, py(s.b[1]) + dy);
      }
      ctx.stroke();
    };

    // Chisel lip catching light on the far side of the groove
    stroke('rgba(196, 182, 158, 0.30)', Math.max(2, w * 0.10), 1.8, 1.8);
    // The cut itself
    stroke('rgba(0, 0, 0, 0.92)', Math.max(2, w * 0.11), 0, 0);
    // Inner shadow depth
    stroke('rgba(24, 10, 8, 0.7)', Math.max(1, w * 0.05), -0.6, -0.6);

    if (ember) {
      ctx.save();
      ctx.shadowColor = '#ff4a00';
      ctx.shadowBlur = 14;
      stroke('rgba(255, 96, 16, 0.55)', Math.max(1, w * 0.045), 0, 0);
      ctx.shadowBlur = 6;
      stroke('rgba(255, 190, 90, 0.5)', Math.max(0.8, w * 0.02), 0, 0);
      ctx.restore();
    }

    // Terminal punch-dots at some stroke ends
    for (const s of segs) {
      if (rand() > 0.6) {
        const dx = px(s.b[0]);
        const dy = py(s.b[1]);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.beginPath();
        ctx.arc(dx, dy, Math.max(1.5, w * 0.06), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(196, 182, 158, 0.22)';
        ctx.beginPath();
        ctx.arc(dx + 1.5, dy + 1.5, Math.max(1, w * 0.04), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ==========================================
  // HELLISH CITADEL - CARVED VOLCANIC BASALT WALL
  // ==========================================
  public static getObsidianRuneTexture(): THREE.CanvasTexture {
    const cacheKey = 'obsidian_rune_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // 1. Basalt foundation - the mortar-less shadow behind the blocks
    ctx.fillStyle = '#050304';
    ctx.fillRect(0, 0, size, size);

    // Molten bed behind the masonry. Only a few regions are still hot, so most joints
    // stay black and the glowing ones actually mean something.
    for (let i = 0; i < 14; i++) {
      const gx = Math.random() * size;
      const gy = Math.random() * size;
      const r = 90 + Math.random() * 210;
      this.drawWrapped(size, gx, gy, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
        g.addColorStop(0, 'rgba(255, 92, 10, 0.5)');
        g.addColorStop(0.45, 'rgba(150, 30, 4, 0.2)');
        g.addColorStop(1, 'rgba(60, 8, 2, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 2. CYCLOPEAN BLOCK COURSES - huge staggered basalt megaliths.
    // The layout is shared with the bump map so the relief lands on these same stones.
    const layout = this.getHellWallLayout();
    const courses = layout.courses;
    const courseH = size / courses;
    const gap = 6;

    for (const nb of layout.blocks) {
      const b = { x: nb.x * size, y: nb.course * courseH, w: nb.w * size, h: courseH };
      const inset = gap / 2;
      const drawBlock = (ox: number) => {
        const x = b.x + ox;
        const y = b.y;
        const w = b.w - gap;
        const h = b.h - gap;

        // Block body - each stone quarried a slightly different shade
        const tone = 12 + Math.floor(nb.tone * 20);
        const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
        g.addColorStop(0, `rgb(${tone + 14}, ${tone + 8}, ${tone + 9})`);
        g.addColorStop(0.45, `rgb(${tone + 4}, ${tone}, ${tone + 1})`);
        g.addColorStop(1, `rgb(${Math.max(3, tone - 6)}, ${Math.max(2, tone - 8)}, ${Math.max(2, tone - 7)})`);
        ctx.fillStyle = g;
        ctx.fillRect(x + inset, y + inset, w, h);

        // Columnar basalt banding within the block
        for (let cband = 0; cband < 14; cband++) {
          const cbx = x + inset + Math.random() * w;
          ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(70, 58, 58, 0.18)' : 'rgba(0, 0, 0, 0.35)';
          ctx.lineWidth = 1 + Math.random() * 6;
          ctx.beginPath();
          ctx.moveTo(cbx, y + inset);
          ctx.lineTo(cbx + (Math.random() - 0.5) * 24, y + inset + h);
          ctx.stroke();
        }

        // Chisel pocking across the face
        for (let p = 0; p < 130; p++) {
          const ppx = x + inset + Math.random() * w;
          const ppy = y + inset + Math.random() * h;
          const pr = 1 + Math.random() * 4;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
          ctx.beginPath();
          ctx.arc(ppx, ppy, pr, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(190, 176, 152, 0.14)';
          ctx.beginPath();
          ctx.arc(ppx + pr * 0.6, ppy + pr * 0.6, pr * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }

        // Hairline fractures on the face
        for (let f = 0; f < 4; f++) {
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
          this.drawCrack(
            ctx,
            x + inset + Math.random() * w,
            y + inset + Math.random() * h,
            Math.random() * Math.PI * 2,
            25 + Math.random() * 70,
            1.4,
            1
          );
        }

        // Bevelled edges: bone-white chisel highlight top/left, deep shadow bottom/right
        ctx.strokeStyle = 'rgba(206, 192, 166, 0.20)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x + inset, y + inset + h);
        ctx.lineTo(x + inset, y + inset);
        ctx.lineTo(x + inset + w, y + inset);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x + inset + w, y + inset);
        ctx.lineTo(x + inset + w, y + inset + h);
        ctx.lineTo(x + inset, y + inset + h);
        ctx.stroke();
      };

      drawBlock(0);
      if (b.x < 0) drawBlock(size);
      if (b.x + b.w > size) drawBlock(-size);
    }

    // 3. LAVA BLEEDING THROUGH THE JOINTS. Most of it creeps along the horizontal
    // bed joints, where a settling wall actually opens up; only a few climb the stones.
    for (let s = 0; s < 10; s++) {
      const followsJoint = s < 6;
      const sy = followsJoint
        ? Math.floor(Math.random() * courses) * courseH + (Math.random() - 0.5) * 6
        : Math.random() * size;
      const sx = Math.random() * size;
      const len = followsJoint ? 90 + Math.random() * 240 : 60 + Math.random() * 150;
      const angle = followsJoint
        ? (Math.random() > 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.18
        : Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      const pts = this.veinPath(0, 0, angle, len, followsJoint ? 0.22 : 0.6);

      this.drawWrapped(size, sx, sy, len, (cx, cy) => {
        ctx.save();
        ctx.lineCap = 'round';
        // Scorched rim
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.lineWidth = 12;
        this.strokePath(ctx, pts, cx, cy);

        // Break the fissure into runs so it opens and closes along its length
        const segs: Array<Array<{ x: number; y: number }>> = [];
        let run: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < pts.length; i++) {
          if (Math.random() > 0.22) run.push(pts[i]);
          else if (run.length > 1) { segs.push(run); run = []; }
          else run = [];
        }
        if (run.length > 1) segs.push(run);

        for (const seg of segs) {
          ctx.shadowColor = '#e03800';
          ctx.shadowBlur = 20;
          ctx.strokeStyle = 'rgba(150, 32, 5, 0.6)';
          ctx.lineWidth = 5;
          this.strokePath(ctx, seg, cx, cy);
          ctx.shadowBlur = 9;
          ctx.strokeStyle = 'rgba(214, 92, 16, 0.8)';
          ctx.lineWidth = 2;
          this.strokePath(ctx, seg, cx, cy);
          // Only the odd stretch is genuinely white-hot
          if (Math.random() > 0.55) {
            ctx.shadowBlur = 6;
            ctx.strokeStyle = 'rgba(255, 190, 110, 0.85)';
            ctx.lineWidth = 0.9;
            this.strokePath(ctx, seg, cx, cy);
          }
        }
        ctx.restore();
      });
    }

    // 4. CARVED RUNES - inscribed glyph bands cut into a few of the stone courses
    for (const band of layout.bands) {
      const gy = band.y * size;
      const glyphH = band.h * size;
      const glyphW = glyphH * 0.55;

      // Faint incised guide lines above and below the band
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, gy - 10); ctx.lineTo(size, gy - 10);
      ctx.moveTo(0, gy + glyphH + 10); ctx.lineTo(size, gy + glyphH + 10);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(196, 182, 158, 0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, gy - 8); ctx.lineTo(size, gy - 8);
      ctx.moveTo(0, gy + glyphH + 12); ctx.lineTo(size, gy + glyphH + 12);
      ctx.stroke();

      for (const glyph of band.glyphs) {
        this.drawRuneGlyph(
          ctx,
          glyph.x * size,
          gy + glyph.dy * size,
          glyphW,
          glyphH,
          glyph.ember,
          this.mulberry32(glyph.seed)
        );
      }
    }

    // 5. GREAT SIGIL - a summoning circle cut deep into the wall
    const sigX = 200 + Math.random() * 620;
    const sigY = 300 + Math.random() * 420;
    const sigR = 130 + Math.random() * 50;
    this.drawWrapped(size, sigX, sigY, sigR + 30, (cx, cy) => {
      const engrave = (drawPath: () => void) => {
        ctx.save();
        // Chisel lip
        ctx.translate(2, 2);
        ctx.strokeStyle = 'rgba(206, 192, 166, 0.24)';
        ctx.lineWidth = 6;
        drawPath();
        ctx.restore();
        // Cut
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.lineWidth = 6;
        drawPath();
        // Ember in the cut
        ctx.save();
        ctx.shadowColor = '#ff3800';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = 'rgba(255, 80, 12, 0.5)';
        ctx.lineWidth = 2;
        drawPath();
        ctx.restore();
      };

      engrave(() => {
        ctx.beginPath();
        ctx.arc(cx, cy, sigR, 0, Math.PI * 2);
        ctx.stroke();
      });
      engrave(() => {
        ctx.beginPath();
        ctx.arc(cx, cy, sigR * 0.82, 0, Math.PI * 2);
        ctx.stroke();
      });
      // Inverted pentacle inside
      engrave(() => {
        ctx.beginPath();
        for (let i = 0; i <= 5; i++) {
          const a = (i * 4 * Math.PI * 2) / 5 + Math.PI / 2;
          const vx = cx + Math.cos(a) * sigR * 0.78;
          const vy = cy + Math.sin(a) * sigR * 0.78;
          if (i === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.stroke();
      });
      // Radial tick marks between the rings
      engrave(() => {
        ctx.beginPath();
        for (let t = 0; t < 32; t++) {
          const a = (t / 32) * Math.PI * 2;
          ctx.moveTo(cx + Math.cos(a) * sigR * 0.84, cy + Math.sin(a) * sigR * 0.84);
          ctx.lineTo(cx + Math.cos(a) * sigR * 0.97, cy + Math.sin(a) * sigR * 0.97);
        }
        ctx.stroke();
      });
      // Glyphs ringing the sigil
      for (let t = 0; t < 10; t++) {
        const a = (t / 10) * Math.PI * 2 + 0.15;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * sigR * 0.62, cy + Math.sin(a) * sigR * 0.62);
        ctx.rotate(a + Math.PI / 2);
        this.drawRuneGlyph(ctx, -9, -14, 18, 28, Math.random() > 0.5);
        ctx.restore();
      }
    });

    // 6. SCORCH MARKS & SOOT
    for (let s = 0; s < 20; s++) {
      const sx = Math.random() * size;
      const sy = Math.random() * size;
      const r = 50 + Math.random() * 150;
      this.drawWrapped(size, sx, sy, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
        g.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
        g.addColorStop(0.6, 'rgba(10, 4, 2, 0.35)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
      // Smoke plume licking upward from the scorch
      const plume = ctx.createLinearGradient(sx, sy, sx, sy - 260);
      plume.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
      plume.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = plume;
      ctx.beginPath();
      ctx.moveTo(sx - 30, sy);
      ctx.lineTo(sx + 30, sy);
      ctx.lineTo(sx + 70, sy - 260);
      ctx.lineTo(sx - 70, sy - 260);
      ctx.closePath();
      ctx.fill();
    }

    // 7. Drifting embers caught against the stone
    ctx.save();
    ctx.shadowColor = '#ff6a00';
    ctx.shadowBlur = 6;
    for (let e = 0; e < 34; e++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(224, 118, 32, 0.6)' : 'rgba(236, 186, 116, 0.45)';
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 0.8 + Math.random() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    this.addFastNoiseOverlay(ctx, size, size, 0.14, false);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 2, repeatY: 1, isColorMap: true, anisotropy: 8 });
  }

  // Hell wall bump - block relief, engraved runes, open fissures
  public static getObsidianRuneBumpTexture(): THREE.CanvasTexture {
    const cacheKey = 'obsidian_rune_bump_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 512;
    const { canvas, ctx } = this.createCanvas(size, size);

    // Joints are the lowest surface, blocks sit proud of them
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, size, size);

    const layout = this.getHellWallLayout();
    const courses = layout.courses;
    const courseH = size / courses;
    const gap = 3;

    {
      for (const nb of layout.blocks) {
        const bx = nb.x * size;
        const by = nb.course * courseH;
        const bw = nb.w * size;

        const drawBlock = (ox: number) => {
          const x = bx + ox + gap / 2;
          const y = by + gap / 2;
          const w = bw - gap;
          const h = courseH - gap;

          const v = 150 + Math.floor(nb.tone * 60);
          ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
          ctx.fillRect(x, y, w, h);

          // Rounded-over edges so the seam reads as a chamfer, not a paint line
          const edge = ctx.createLinearGradient(x, y, x, y + h);
          edge.addColorStop(0, 'rgba(40, 40, 40, 0.85)');
          edge.addColorStop(0.12, 'rgba(128, 128, 128, 0)');
          edge.addColorStop(0.88, 'rgba(128, 128, 128, 0)');
          edge.addColorStop(1, 'rgba(30, 30, 30, 0.9)');
          ctx.fillStyle = edge;
          ctx.fillRect(x, y, w, h);

          const edgeH = ctx.createLinearGradient(x, y, x + w, y);
          edgeH.addColorStop(0, 'rgba(40, 40, 40, 0.85)');
          edgeH.addColorStop(0.08, 'rgba(128, 128, 128, 0)');
          edgeH.addColorStop(0.92, 'rgba(128, 128, 128, 0)');
          edgeH.addColorStop(1, 'rgba(30, 30, 30, 0.9)');
          ctx.fillStyle = edgeH;
          ctx.fillRect(x, y, w, h);

          // Chisel pocking
          for (let p = 0; p < 70; p++) {
            const ppx = x + Math.random() * w;
            const ppy = y + Math.random() * h;
            const pr = 0.8 + Math.random() * 2.4;
            ctx.fillStyle = 'rgba(60, 60, 60, 0.55)';
            ctx.beginPath();
            ctx.arc(ppx, ppy, pr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(235, 235, 235, 0.3)';
            ctx.beginPath();
            ctx.arc(ppx + pr * 0.7, ppy + pr * 0.7, pr * 0.6, 0, Math.PI * 2);
            ctx.fill();
          }

          // Face fractures
          for (let f = 0; f < 3; f++) {
            ctx.strokeStyle = 'rgba(25, 25, 25, 0.8)';
            this.drawCrack(ctx, x + Math.random() * w, y + Math.random() * h, Math.random() * Math.PI * 2, 15 + Math.random() * 40, 1.2, 1);
          }
        };

        drawBlock(0);
        if (bx < 0) drawBlock(size);
        if (bx + bw > size) drawBlock(-size);
      }
    }

    // Engraved rune bands cut below the surface - identical glyphs, in the same
    // places, as the colour map, so the relief matches the carving.
    for (const band of layout.bands) {
      const gy = band.y * size;
      const glyphH = band.h * size;
      const glyphW = glyphH * 0.55;
      for (const glyph of band.glyphs) {
        this.drawRuneGlyph(
          ctx,
          glyph.x * size,
          gy + glyph.dy * size,
          glyphW,
          glyphH,
          false,
          this.mulberry32(glyph.seed)
        );
      }
    }

    // Deep fissures
    for (let s = 0; s < 10; s++) {
      const sx = Math.random() * size;
      const sy = Math.random() * size;
      const len = 60 + Math.random() * 190;
      this.drawWrapped(size, sx, sy, len, (cx, cy) => {
        ctx.strokeStyle = '#000000';
        this.drawCrack(ctx, cx, cy, Math.random() * Math.PI * 2, len, 5, 2);
      });
    }

    this.addFastNoiseOverlay(ctx, size, size, 0.24, true);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 2, repeatY: 1, isColorMap: false, anisotropy: 8 });
  }

  // ==========================================
  // HELLISH CITADEL - CRACKED OBSIDIAN FLAGSTONE FLOOR
  // ==========================================
  public static getHellFloorTexture(): THREE.CanvasTexture {
    const cacheKey = 'hell_floor_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // 1. MOLTEN BED - everything below the flagstones is still burning
    ctx.fillStyle = '#150603';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 22; i++) {
      const gx = Math.random() * size;
      const gy = Math.random() * size;
      const r = 90 + Math.random() * 220;
      this.drawWrapped(size, gx, gy, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
        g.addColorStop(0, 'rgba(255, 150, 30, 0.8)');
        g.addColorStop(0.35, 'rgba(230, 70, 10, 0.45)');
        g.addColorStop(1, 'rgba(90, 14, 2, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 2. FLAGSTONE LATTICE - shared with the bump map, and fully periodic, so stones
    // straddle the tile boundary rather than lining up along a straight seam.
    const lattice = this.getHellFlagLattice();
    const cells = lattice.cells;
    const step = size / cells;
    const vx = lattice.vx.map((row) => row.map((v) => v * size));
    const vy = lattice.vy.map((row) => row.map((v) => v * size));

    const seamGap = 7;
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        const corners = [
          { x: vx[r][c], y: vy[r][c] },
          { x: vx[r][c + 1], y: vy[r][c + 1] },
          { x: vx[r + 1][c + 1], y: vy[r + 1][c + 1] },
          { x: vx[r + 1][c], y: vy[r + 1][c] },
        ];
        const midX = (corners[0].x + corners[2].x) / 2;
        const midY = (corners[0].y + corners[2].y) / 2;
        // Shrink toward the centre to leave a glowing joint
        const inset = corners.map((p) => {
          const dx = midX - p.x;
          const dy = midY - p.y;
          const d = Math.hypot(dx, dy) || 1;
          return { x: p.x + (dx / d) * seamGap, y: p.y + (dy / d) * seamGap };
        });

        const paint = (ox: number, oy: number) => {
          // Re-seeded per call: a stone drawn twice (once on each side of the tile seam)
          // must come out identical, or its two halves would not match up.
          const rnd = this.mulberry32(0xf1a6 + r * 7919 + c * 104729);

          ctx.save();
          ctx.beginPath();
          inset.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x + ox, p.y + oy) : ctx.lineTo(p.x + ox, p.y + oy)));
          ctx.closePath();
          ctx.clip();

          // Obsidian body with a faint glassy sheen
          const tone = 10 + Math.floor(rnd() * 16);
          const g = ctx.createLinearGradient(midX + ox - step / 2, midY + oy - step / 2, midX + ox + step / 2, midY + oy + step / 2);
          g.addColorStop(0, `rgb(${tone + 16}, ${tone + 11}, ${tone + 13})`);
          g.addColorStop(0.5, `rgb(${tone + 3}, ${tone}, ${tone + 1})`);
          g.addColorStop(1, `rgb(${Math.max(2, tone - 6)}, ${Math.max(2, tone - 7)}, ${Math.max(2, tone - 6)})`);
          ctx.fillStyle = g;
          ctx.fillRect(midX + ox - step, midY + oy - step, step * 2, step * 2);

          // Conchoidal fracture sheen - obsidian breaks in shell-shaped curves
          for (let f = 0; f < 7; f++) {
            const fx = midX + ox + (rnd() - 0.5) * step;
            const fy = midY + oy + (rnd() - 0.5) * step;
            ctx.strokeStyle = `rgba(180, 172, 178, ${0.04 + rnd() * 0.09})`;
            ctx.lineWidth = 1 + rnd() * 2.5;
            ctx.beginPath();
            ctx.arc(fx, fy, 8 + rnd() * 40, rnd() * Math.PI * 2, rnd() * Math.PI * 2 + 1.6);
            ctx.stroke();
          }

          // Stress cracks in the stone, some still hot inside
          for (let k = 0; k < 5; k++) {
            const kx = midX + ox + (rnd() - 0.5) * step;
            const ky = midY + oy + (rnd() - 0.5) * step;
            const a1 = rnd() * Math.PI * 2;
            const l1 = 20 + rnd() * 60;
            const hot = rnd() > 0.6;
            const a2 = rnd() * Math.PI * 2;
            const l2 = 18 + rnd() * 40;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            this.drawCrack(ctx, kx, ky, a1, l1, 2, 1, rnd);
            if (hot) {
              ctx.save();
              ctx.shadowColor = '#ff4a00';
              ctx.shadowBlur = 12;
              ctx.strokeStyle = 'rgba(255, 90, 15, 0.55)';
              this.drawCrack(ctx, kx, ky, a2, l2, 1, 1, rnd);
              ctx.restore();
            }
          }

          // Char scabs and pitting
          for (let p = 0; p < 90; p++) {
            ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + rnd() * 0.5})`;
            ctx.beginPath();
            ctx.arc(midX + ox + (rnd() - 0.5) * step, midY + oy + (rnd() - 0.5) * step, 1 + rnd() * 4, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();

          // Bevel: cooled black lip on the hot side of the joint
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          inset.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x + ox, p.y + oy) : ctx.lineTo(p.x + ox, p.y + oy)));
          ctx.closePath();
          ctx.stroke();
        };

        paint(0, 0);
        // Stones on the border are painted again one tile over, so the half that hangs
        // off this edge reappears on the opposite one.
        const minX = Math.min(...corners.map((p) => p.x));
        const maxX = Math.max(...corners.map((p) => p.x));
        const minY = Math.min(...corners.map((p) => p.y));
        const maxY = Math.max(...corners.map((p) => p.y));
        const dxs = [0];
        if (minX < 0) dxs.push(size);
        if (maxX > size) dxs.push(-size);
        const dys = [0];
        if (minY < 0) dys.push(size);
        if (maxY > size) dys.push(-size);
        for (const dx of dxs) for (const dy of dys) if (dx || dy) paint(dx, dy);
      }
    }

    // 3. COOLED CRUST - roughly half the joints have skinned over with black rock, so the
    // floor reads as cracked stone with lava in it rather than as a glowing grid.
    const crustJoint = (ax: number, ay: number, bx: number, by: number) => {
      const steps = 5;
      const wob: Array<{ x: number; y: number }> = [];
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        wob.push({
          x: ax + (bx - ax) * t + (Math.random() - 0.5) * 4,
          y: ay + (by - ay) * t + (Math.random() - 0.5) * 4,
        });
      }
      const dxs = [0];
      if (Math.min(ax, bx) < 0) dxs.push(size);
      if (Math.max(ax, bx) > size) dxs.push(-size);
      const dys = [0];
      if (Math.min(ay, by) < 0) dys.push(size);
      if (Math.max(ay, by) > size) dys.push(-size);

      ctx.strokeStyle = 'rgba(7, 5, 5, 0.94)';
      ctx.lineWidth = seamGap + 4;
      ctx.lineCap = 'round';
      for (const dx of dxs) {
        for (const dy of dys) {
          ctx.beginPath();
          ctx.moveTo(ax + dx, ay + dy);
          for (const p of wob) ctx.lineTo(p.x + dx, p.y + dy);
          ctx.stroke();
        }
      }
    };
    // Only the r,c < cells joints are visited: the far row/column are periodic images of
    // these, and crustJoint already redraws anything that crosses the border.
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        if (Math.random() > 0.45) crustJoint(vx[r][c], vy[r][c], vx[r][c + 1], vy[r][c + 1]);
        if (Math.random() > 0.45) crustJoint(vx[r][c], vy[r][c], vx[r + 1][c], vy[r + 1][c]);
      }
    }

    // 4. HOT SPOTS - lava pools where several joints meet, not out on the stone faces
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let h = 0; h < 16; h++) {
      const jr = Math.floor(Math.random() * cells);
      const jc = Math.floor(Math.random() * cells);
      const hx = vx[jr][jc];
      const hy = vy[jr][jc];
      const r = 26 + Math.random() * 60;
      this.drawWrapped(size, hx, hy, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
        g.addColorStop(0, 'rgba(255, 178, 80, 0.28)');
        g.addColorStop(0.4, 'rgba(255, 84, 12, 0.13)');
        g.addColorStop(1, 'rgba(255, 60, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();

    // 5. ASH DRIFTS - pale grey powder banked against the stones
    for (let a = 0; a < 30; a++) {
      const ax = Math.random() * size;
      const ay = Math.random() * size;
      const rw = 40 + Math.random() * 140;
      const rh = rw * (0.3 + Math.random() * 0.4);
      const rot = Math.random() * Math.PI;
      this.drawWrapped(size, ax, ay, rw, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, rw);
        g.addColorStop(0, 'rgba(120, 112, 106, 0.34)');
        g.addColorStop(0.6, 'rgba(80, 74, 70, 0.16)');
        g.addColorStop(1, 'rgba(60, 56, 54, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rw, rh, rot, 0, Math.PI * 2);
        ctx.fill();
        // Grainy ash flecks
        for (let f = 0; f < 120; f++) {
          const t = Math.random() * Math.PI * 2;
          const d = Math.pow(Math.random(), 0.6);
          ctx.fillStyle = `rgba(${150 + Math.random() * 60 | 0}, ${142 + Math.random() * 50 | 0}, 138, ${0.05 + Math.random() * 0.2})`;
          ctx.fillRect(cx + Math.cos(t) * d * rw, cy + Math.sin(t) * d * rh, 1 + Math.random() * 2.5, 1 + Math.random() * 2);
        }
      });
    }

    // 6. Loose char shards and glowing cinders
    ctx.save();
    ctx.shadowColor = '#ff5a00';
    ctx.shadowBlur = 10;
    for (let c = 0; c < 130; c++) {
      const cx = Math.random() * size;
      const cy = Math.random() * size;
      if (Math.random() > 0.45) {
        ctx.shadowBlur = 10;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 130, 30, 0.8)' : 'rgba(255, 205, 130, 0.7)';
        ctx.beginPath();
        ctx.arc(cx, cy, 0.9 + Math.random() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.beginPath();
        const r = 2 + Math.random() * 6;
        for (let v = 0; v < 5; v++) {
          const a = (v / 5) * Math.PI * 2 + Math.random() * 0.5;
          const rr = r * (0.5 + Math.random() * 0.6);
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr;
          if (v === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    this.addFastNoiseOverlay(ctx, size, size, 0.14, false);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 4, repeatY: 4, isColorMap: true, anisotropy: 8 });
  }

  // Hell floor bump - proud flagstones, deep molten joints
  public static getHellFloorBumpTexture(): THREE.CanvasTexture {
    const cacheKey = 'hell_floor_bump_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 512;
    const { canvas, ctx } = this.createCanvas(size, size);

    // Joints sit far below the stone faces
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, 0, size, size);

    // Same lattice as the colour map, at half the resolution
    const lattice = this.getHellFlagLattice();
    const cells = lattice.cells;
    const step = size / cells;
    const vx = lattice.vx.map((row) => row.map((v) => v * size));
    const vy = lattice.vy.map((row) => row.map((v) => v * size));

    const seamGap = 5;
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        const corners = [
          { x: vx[r][c], y: vy[r][c] },
          { x: vx[r][c + 1], y: vy[r][c + 1] },
          { x: vx[r + 1][c + 1], y: vy[r + 1][c + 1] },
          { x: vx[r + 1][c], y: vy[r + 1][c] },
        ];
        const midX = (corners[0].x + corners[2].x) / 2;
        const midY = (corners[0].y + corners[2].y) / 2;
        const inset = corners.map((p) => {
          const dx = midX - p.x;
          const dy = midY - p.y;
          const d = Math.hypot(dx, dy) || 1;
          return { x: p.x + (dx / d) * seamGap, y: p.y + (dy / d) * seamGap };
        });

        const paint = (ox: number, oy: number) => {
          const rnd = this.mulberry32(0xf1a6 + r * 7919 + c * 104729);

          ctx.save();
          ctx.beginPath();
          inset.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x + ox, p.y + oy) : ctx.lineTo(p.x + ox, p.y + oy)));
          ctx.closePath();
          ctx.clip();

          // Same seed as the colour map's stone, so the brightest stones there are the
          // proudest ones here.
          const v = 165 + Math.floor(rnd() * 70);
          ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
          ctx.fillRect(midX + ox - step, midY + oy - step, step * 2, step * 2);

          // Slight dish in the middle of worn stones
          const g = ctx.createRadialGradient(midX + ox, midY + oy, 2, midX + ox, midY + oy, step * 0.7);
          g.addColorStop(0, 'rgba(90, 90, 90, 0.35)');
          g.addColorStop(1, 'rgba(128, 128, 128, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(midX + ox - step, midY + oy - step, step * 2, step * 2);

          // Cracks and pitting
          for (let k = 0; k < 4; k++) {
            ctx.strokeStyle = 'rgba(15, 15, 15, 0.85)';
            this.drawCrack(
              ctx,
              midX + ox + (rnd() - 0.5) * step,
              midY + oy + (rnd() - 0.5) * step,
              rnd() * Math.PI * 2,
              15 + rnd() * 45,
              2,
              1,
              rnd
            );
          }
          for (let p = 0; p < 60; p++) {
            ctx.fillStyle = `rgba(70, 70, 70, ${0.2 + rnd() * 0.4})`;
            ctx.beginPath();
            ctx.arc(midX + ox + (rnd() - 0.5) * step, midY + oy + (rnd() - 0.5) * step, 0.8 + rnd() * 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();

          // Chamfered edge falling into the joint
          ctx.strokeStyle = 'rgba(45, 45, 45, 0.9)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          inset.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x + ox, p.y + oy) : ctx.lineTo(p.x + ox, p.y + oy)));
          ctx.closePath();
          ctx.stroke();
        };

        paint(0, 0);
        const minX = Math.min(...corners.map((p) => p.x));
        const maxX = Math.max(...corners.map((p) => p.x));
        const minY = Math.min(...corners.map((p) => p.y));
        const maxY = Math.max(...corners.map((p) => p.y));
        const dxs = [0];
        if (minX < 0) dxs.push(size);
        if (maxX > size) dxs.push(-size);
        const dys = [0];
        if (minY < 0) dys.push(size);
        if (maxY > size) dys.push(-size);
        for (const dx of dxs) for (const dy of dys) if (dx || dy) paint(dx, dy);
      }
    }

    // Ash drifts read as a soft raised powder
    for (let a = 0; a < 24; a++) {
      const ax = Math.random() * size;
      const ay = Math.random() * size;
      const rw = 20 + Math.random() * 70;
      this.drawWrapped(size, ax, ay, rw, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rw);
        g.addColorStop(0, 'rgba(215, 215, 215, 0.22)');
        g.addColorStop(1, 'rgba(128, 128, 128, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rw, rw * 0.5, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    this.addFastNoiseOverlay(ctx, size, size, 0.22, true);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 4, repeatY: 4, isColorMap: false, anisotropy: 8 });
  }

  // ==========================================
  // HELLISH CITADEL - VAULTED STONE CEILING
  // ==========================================
  public static getHellCeilingTexture(): THREE.CanvasTexture {
    const cacheKey = 'hell_ceiling_v2';
    if (this.canvasCache.has(cacheKey)) return this.canvasCache.get(cacheKey)!;

    const size = 1024;
    const { canvas, ctx } = this.createCanvas(size, size);

    // 1. Soot-blackened vault stone
    ctx.fillStyle = '#080506';
    ctx.fillRect(0, 0, size, size);

    for (let l = 0; l < 260; l++) {
      const lx = Math.random() * size;
      const ly = Math.random() * size;
      const r = 25 + Math.random() * 120;
      this.drawWrapped(size, lx, ly, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 2, cx, cy, r);
        g.addColorStop(0, `rgba(${40 + Math.random() * 26 | 0}, ${30 + Math.random() * 18 | 0}, ${32 + Math.random() * 18 | 0}, 0.24)`);
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 2. ASHLAR COURSING filling the vault webs - laid before the ribs so the ribs sit
    // proud on top of it. Each stone gets its own tone, a lit lower lip and a dark bed joint.
    const webCourse = 64;
    for (let y = 0; y < size; y += webCourse) {
      const offset = (y / webCourse) % 2 === 0 ? 0 : webCourse;
      for (let x = offset - webCourse; x < size; x += webCourse * 2) {
        const v = 20 + Math.random() * 16;
        ctx.fillStyle = `rgba(${v | 0}, ${(v * 0.82) | 0}, ${(v * 0.84) | 0}, 0.6)`;
        ctx.fillRect(x + 2, y + 2, webCourse * 2 - 4, webCourse - 4);
        for (let p = 0; p < 22; p++) {
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0, 0, 0, 0.35)' : 'rgba(130, 116, 108, 0.06)';
          ctx.beginPath();
          ctx.arc(
            x + 4 + Math.random() * (webCourse * 2 - 8),
            y + 4 + Math.random() * (webCourse - 8),
            1 + Math.random() * 3,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(156, 140, 124, 0.08)';
        ctx.fillRect(x + 2, y + webCourse - 5, webCourse * 2 - 4, 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x + 2, y + webCourse - 3, webCourse * 2 - 4, 3);
      }
    }

    // 3. GROIN VAULT RIBS - heavy ribs crossing into a boss at the centre of each bay
    const bay = 512;
    for (let by = 0; by < size; by += bay) {
      for (let bx = 0; bx < size; bx += bay) {
        const cx = bx + bay / 2;
        const cy = by + bay / 2;

        // Diagonal ribs
        for (const [ax, ay] of [[bx, by], [bx + bay, by], [bx + bay, by + bay], [bx, by + bay]] as Array<[number, number]>) {
          // Rib shadow
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.lineWidth = 34;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cx, cy); ctx.stroke();
          // Rib body
          const g = ctx.createLinearGradient(ax, ay, cx, cy);
          g.addColorStop(0, '#1d1618');
          g.addColorStop(0.5, '#2a2023');
          g.addColorStop(1, '#151011');
          ctx.strokeStyle = g;
          ctx.lineWidth = 24;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cx, cy); ctx.stroke();
          // Chiselled highlight along the rib crown
          ctx.strokeStyle = 'rgba(196, 182, 158, 0.14)';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(ax + 4, ay + 4); ctx.lineTo(cx + 4, cy + 4); ctx.stroke();

          // Voussoir joints across the rib
          const segments = 14;
          for (let s = 1; s < segments; s++) {
            const t = s / segments;
            const jx = ax + (cx - ax) * t;
            const jy = ay + (cy - ay) * t;
            const a = Math.atan2(cy - ay, cx - ax) + Math.PI / 2;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(jx + Math.cos(a) * 12, jy + Math.sin(a) * 12);
            ctx.lineTo(jx - Math.cos(a) * 12, jy - Math.sin(a) * 12);
            ctx.stroke();
          }
        }

        // Carved boss at the rib intersection with a smouldering sigil
        ctx.fillStyle = '#161113';
        ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(196, 182, 158, 0.20)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.stroke();
        ctx.save();
        ctx.shadowColor = '#ff3c00';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = 'rgba(255, 90, 15, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 5; i++) {
          const a = (i * 4 * Math.PI * 2) / 5 + Math.PI / 2;
          const px = cx + Math.cos(a) * 26;
          const py = cy + Math.sin(a) * 26;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 4. GLOWING CRACKS - the vault is failing and hell shows through. Kept sparse and
    // broken; a ceiling full of bright lines reads as neon rather than as failing stone.
    for (let c = 0; c < 12; c++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const len = 60 + Math.random() * 170;
      const pts = this.veinPath(0, 0, Math.random() * Math.PI * 2, len, 0.8);
      this.drawWrapped(size, x, y, len, (cx, cy) => {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.lineWidth = 9;
        this.strokePath(ctx, pts, cx, cy);

        const segs: Array<Array<{ x: number; y: number }>> = [];
        let run: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < pts.length; i++) {
          if (Math.random() > 0.25) run.push(pts[i]);
          else if (run.length > 1) { segs.push(run); run = []; }
          else run = [];
        }
        if (run.length > 1) segs.push(run);

        for (const seg of segs) {
          ctx.shadowColor = '#e03800';
          ctx.shadowBlur = 18;
          ctx.strokeStyle = 'rgba(150, 34, 6, 0.5)';
          ctx.lineWidth = 4;
          this.strokePath(ctx, seg, cx, cy);
          ctx.shadowBlur = 8;
          ctx.strokeStyle = 'rgba(206, 88, 18, 0.75)';
          ctx.lineWidth = 1.4;
          this.strokePath(ctx, seg, cx, cy);
        }
        ctx.restore();
      });
    }

    // 5. Stalactite drips of cooled lava hanging from the webs
    for (let d = 0; d < 40; d++) {
      const dx = Math.random() * size;
      const dy = Math.random() * size;
      const len = 12 + Math.random() * 45;
      this.drawWrapped(size, dx, dy, len, (cx, cy) => {
        const g = ctx.createLinearGradient(cx, cy, cx, cy + len);
        g.addColorStop(0, 'rgba(20, 14, 14, 0.95)');
        g.addColorStop(0.7, 'rgba(60, 20, 8, 0.8)');
        g.addColorStop(1, 'rgba(180, 60, 10, 0.5)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - 5 - Math.random() * 4, cy);
        ctx.lineTo(cx + 5 + Math.random() * 4, cy);
        ctx.lineTo(cx, cy + len);
        ctx.closePath();
        ctx.fill();
      });
    }

    // 6. Heavy soot pooling under the vault
    for (let s = 0; s < 22; s++) {
      const sx = Math.random() * size;
      const sy = Math.random() * size;
      const r = 60 + Math.random() * 150;
      this.drawWrapped(size, sx, sy, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
        g.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    this.addFastNoiseOverlay(ctx, size, size, 0.13, false);

    return this.finalizeTexture(canvas, cacheKey, { repeatX: 3, repeatY: 3, isColorMap: true, anisotropy: 8 });
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

