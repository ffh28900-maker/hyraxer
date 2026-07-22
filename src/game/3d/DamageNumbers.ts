import * as THREE from 'three';

export interface DamageNumberItem {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  initialScale: number;
  texture: THREE.CanvasTexture;
  material: THREE.SpriteMaterial;
}

export class DamageNumbers {
  private scene: THREE.Scene;
  private items: DamageNumberItem[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawn(position: THREE.Vector3, damage: number, isCrit: boolean = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const roundedDmg = Math.round(damage);
    const text = isCrit ? `💥 ${roundedDmg} CRIT!` : `${roundedDmg}`;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isCrit) {
      ctx.font = '900 48px "Courier New", monospace, sans-serif';

      // Drop shadow / glow
      ctx.shadowColor = '#FF1744';
      ctx.shadowBlur = 12;

      // Outer dark outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 10;
      ctx.strokeText(text, 128, 64);

      // Inner gradient fill
      const grad = ctx.createLinearGradient(0, 20, 0, 100);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.3, '#FFEA00');
      grad.addColorStop(1, '#FF1744');
      ctx.fillStyle = grad;
      ctx.fillText(text, 128, 64);
    } else {
      ctx.font = '800 38px "Courier New", monospace, sans-serif';

      // Outer dark outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 8;
      ctx.strokeText(text, 128, 64);

      // Standard yellow/white fill
      ctx.fillStyle = '#FFEB3B';
      ctx.fillText(text, 128, 64);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false, // Ensures damage numbers pop cleanly over 3D geometry
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);

    const initialScale = isCrit ? 2.8 : 1.8;
    // Start at 60% scale for pop/spring entrance animation
    sprite.scale.set(initialScale * 0.6, (initialScale * 0.6) * 0.5, 1);

    // Random slight offset from exact hit point
    const spawnPos = position.clone().add(
      new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        0.8 + Math.random() * 0.4,
        (Math.random() - 0.5) * 0.8
      )
    );
    sprite.position.copy(spawnPos);

    this.scene.add(sprite);

    const maxLife = isCrit ? 0.95 : 0.75;
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 2.0,
      isCrit ? 4.5 : 3.2,
      (Math.random() - 0.5) * 2.0
    );

    this.items.push({
      sprite,
      velocity,
      life: maxLife,
      maxLife,
      initialScale,
      texture,
      material,
    });
  }

  public update(delta: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life -= delta;

      // Position update
      item.sprite.position.addScaledVector(item.velocity, delta);
      // Gravity & air drag
      item.velocity.y -= 3.0 * delta;
      item.velocity.multiplyScalar(Math.pow(0.3, delta));

      const ageRatio = 1.0 - item.life / item.maxLife; // 0 to 1

      // Entrance Pop Animation (0 to 0.15s)
      if (ageRatio < 0.2) {
        const pop = ageRatio / 0.2;
        const currentScale = item.initialScale * (0.6 + 0.5 * Math.sin(pop * Math.PI * 0.5));
        item.sprite.scale.set(currentScale, currentScale * 0.5, 1);
      } else {
        const currentScale = item.initialScale * 1.1;
        item.sprite.scale.set(currentScale, currentScale * 0.5, 1);
      }

      // Fade out in last 50% of lifespan
      if (ageRatio > 0.5) {
        const fade = (1.0 - ageRatio) / 0.5;
        item.material.opacity = Math.max(0, fade);
      }

      if (item.life <= 0) {
        this.scene.remove(item.sprite);
        item.texture.dispose();
        item.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  public clear() {
    for (const item of this.items) {
      this.scene.remove(item.sprite);
      item.texture.dispose();
      item.material.dispose();
    }
    this.items = [];
  }
}
