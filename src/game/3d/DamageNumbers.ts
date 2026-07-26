import * as THREE from 'three';

export class DamageNumbers {
  private scene: THREE.Scene;
  private digitMaterialsNormal: THREE.SpriteMaterial[] = [];
  private digitMaterialsCrit: THREE.SpriteMaterial[] = [];
  private critBadgeMaterial: THREE.SpriteMaterial;

  private pool: {
    group: THREE.Group;
    digitSprites: THREE.Sprite[];
    critBadgeSprite: THREE.Sprite;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    initialScale: number;
    active: boolean;
  }[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Pre-render digit materials once during load (0-9 normal & 0-9 crit)
    for (let d = 0; d <= 9; d++) {
      const texNorm = this.createDigitTexture(`${d}`, false);
      const matNorm = new THREE.SpriteMaterial({
        map: texNorm,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      this.digitMaterialsNormal.push(matNorm);

      const texCrit = this.createDigitTexture(`${d}`, true);
      const matCrit = new THREE.SpriteMaterial({
        map: texCrit,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      this.digitMaterialsCrit.push(matCrit);
    }

    const texCritBadge = this.createCritBadgeTexture();
    this.critBadgeMaterial = new THREE.SpriteMaterial({
      map: texCritBadge,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    // Pre-allocate pool of 20 DamageNumber Groups
    for (let i = 0; i < 20; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const digitSprites: THREE.Sprite[] = [];
      for (let s = 0; s < 4; s++) {
        const sprite = new THREE.Sprite(this.digitMaterialsNormal[0]);
        sprite.visible = false;
        sprite.frustumCulled = false;
        group.add(sprite);
        digitSprites.push(sprite);
      }

      const critBadgeSprite = new THREE.Sprite(this.critBadgeMaterial);
      critBadgeSprite.visible = false;
      critBadgeSprite.frustumCulled = false;
      critBadgeSprite.scale.set(1.2, 0.6, 1);
      critBadgeSprite.position.set(0, 0.55, 0);
      group.add(critBadgeSprite);

      this.scene.add(group);

      this.pool.push({
        group,
        digitSprites,
        critBadgeSprite,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1.0,
        initialScale: 1.0,
        active: false,
      });
    }
  }

  private createDigitTexture(digitStr: string, isCrit: boolean): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isCrit) {
      ctx.font = '900 48px "Courier New", monospace, sans-serif';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 8;
      ctx.strokeText(digitStr, 32, 32);

      const grad = ctx.createLinearGradient(0, 10, 0, 54);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.3, '#FFEA00');
      grad.addColorStop(1, '#FF1744');
      ctx.fillStyle = grad;
      ctx.fillText(digitStr, 32, 32);
    } else {
      ctx.font = '800 44px "Courier New", monospace, sans-serif';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 7;
      ctx.strokeText(digitStr, 32, 32);

      ctx.fillStyle = '#FFEB3B';
      ctx.fillText(digitStr, 32, 32);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    return texture;
  }

  private createCritBadgeTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 32px "Courier New", monospace, sans-serif';

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.strokeText('💥 CRIT!', 64, 32);

    ctx.fillStyle = '#FF1744';
    ctx.fillText('💥 CRIT!', 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    return texture;
  }

  public spawn(position: THREE.Vector3, damage: number, isCrit: boolean = false) {
    let item = this.pool.find((i) => !i.active);
    if (!item) {
      item = this.pool[0];
    }

    const roundedDmg = Math.max(1, Math.round(damage));
    const str = `${roundedDmg}`;
    const numDigits = Math.min(4, str.length);
    const materials = isCrit ? this.digitMaterialsCrit : this.digitMaterialsNormal;

    const spacing = 0.55;
    const startX = -((numDigits - 1) * spacing) / 2;

    for (let i = 0; i < 4; i++) {
      const sprite = item.digitSprites[i];
      if (i < numDigits) {
        const digitVal = parseInt(str[i], 10) || 0;
        sprite.material = materials[digitVal];
        sprite.position.set(startX + i * spacing, 0, 0);
        sprite.scale.set(0.7, 0.7, 1);
        sprite.visible = true;
      } else {
        sprite.visible = false;
      }
    }

    if (isCrit) {
      item.critBadgeSprite.visible = true;
      item.critBadgeSprite.position.set(0, 0.55, 0);
    } else {
      item.critBadgeSprite.visible = false;
    }

    item.group.position.set(
      position.x + (Math.random() - 0.5) * 0.6,
      position.y + 0.8 + Math.random() * 0.3,
      position.z + (Math.random() - 0.5) * 0.6
    );

    const initialScale = isCrit ? 1.6 : 1.2;
    item.initialScale = initialScale;
    item.group.scale.setScalar(initialScale * 0.5);

    const maxLife = isCrit ? 0.7 : 0.5;
    item.life = maxLife;
    item.maxLife = maxLife;
    item.velocity.set(
      (Math.random() - 0.5) * 1.5,
      isCrit ? 3.5 : 2.5,
      (Math.random() - 0.5) * 1.5
    );

    item.active = true;
    item.group.visible = true;
  }

  public update(delta: number) {
    for (const item of this.pool) {
      if (!item.active) continue;

      item.life -= delta;

      item.group.position.addScaledVector(item.velocity, delta);
      item.velocity.y -= 4.0 * delta;

      const progress = 1.0 - item.life / item.maxLife; // 0 to 1

      if (progress < 0.2) {
        const pop = progress / 0.2;
        const scale = item.initialScale * (0.5 + 0.6 * Math.sin(pop * Math.PI * 0.5));
        item.group.scale.setScalar(scale);
      } else {
        const fade = (1.0 - progress) / 0.8;
        const scale = item.initialScale * 1.1 * Math.max(0, fade);
        item.group.scale.setScalar(scale);
      }

      if (item.life <= 0) {
        item.active = false;
        item.group.visible = false;
      }
    }
  }

  public clear() {
    for (const item of this.pool) {
      item.active = false;
      item.group.visible = false;
    }
  }
}
