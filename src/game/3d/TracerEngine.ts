import * as THREE from 'three';
import { WeaponId } from '../../types';

export interface ActiveTracer {
  mesh: THREE.Mesh;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  life: number;
  maxLife: number;
  material: THREE.MeshBasicMaterial;
  inUse: boolean;
}

export class TracerEngine {
  private scene: THREE.Scene;
  private pool: ActiveTracer[] = [];
  private poolSize = 60;
  private cylinderGeo: THREE.CylinderGeometry;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Unit length cylinder pointing along Y axis, offset so origin is at base
    this.cylinderGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6);
    this.cylinderGeo.translate(0, 0.5, 0);
    this.cylinderGeo.rotateX(Math.PI / 2); // Align with Z axis for easy lookAt orientation

    // Pre-allocate pool
    for (let i = 0; i < this.poolSize; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(this.cylinderGeo, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);

      this.pool.push({
        mesh,
        startPos: new THREE.Vector3(),
        endPos: new THREE.Vector3(),
        life: 0,
        maxLife: 0.1,
        material,
        inUse: false,
      });
    }
  }

  public spawnTracer(
    start: THREE.Vector3,
    end: THREE.Vector3,
    weapon: WeaponId,
    isBerserk: boolean = false
  ) {
    // Determine colors & thickness based on weapon type
    let colorHex = 0xffcc00; // Gold (Peacemaker)
    let emissiveHex = 0xff9900;
    let radius = 0.05;
    let duration = 0.12;

    if (isBerserk) {
      colorHex = 0xff00ff; // Neon Pink/Magenta Berserk
      emissiveHex = 0xff00aa;
      radius = 0.08;
      duration = 0.16;
    } else if (weapon === 'peacemaker') {
      colorHex = 0xffd700; // Golden Yellow Revolver
      emissiveHex = 0xffaa00;
      radius = 0.06;
      duration = 0.12;
    } else if (weapon === 'trembler') {
      colorHex = 0xff3300; // Flame Red/Orange Shotgun Pellet
      emissiveHex = 0xff1100;
      radius = 0.04;
      duration = 0.10;
    } else if (weapon === 'punisher') {
      colorHex = 0x00e5ff; // Neon Electric Cyan Rifle Pulse
      emissiveHex = 0x0088ff;
      radius = 0.05;
      duration = 0.09;
    }

    // Find available pooled tracer
    let tracer = this.pool.find((t) => !t.inUse);
    if (!tracer) {
      // Reuse oldest tracer
      tracer = this.pool[0];
    }

    tracer.inUse = true;
    tracer.startPos.copy(start);
    tracer.endPos.copy(end);
    tracer.life = duration;
    tracer.maxLife = duration;

    // Update material properties
    tracer.material.color.setHex(colorHex);
    tracer.material.opacity = 1.0;

    // Position and orient mesh from start to end
    const dist = start.distanceTo(end);
    tracer.mesh.position.copy(start);
    tracer.mesh.lookAt(end);
    tracer.mesh.scale.set(radius, radius, Math.max(0.1, dist));
    tracer.mesh.visible = true;
  }

  public update(delta: number) {
    for (const tracer of this.pool) {
      if (!tracer.inUse) continue;

      tracer.life -= delta;
      if (tracer.life <= 0) {
        tracer.inUse = false;
        tracer.mesh.visible = false;
      } else {
        const ratio = tracer.life / tracer.maxLife;
        tracer.material.opacity = Math.max(0, ratio * ratio); // Fade out smoothly
      }
    }
  }

  public clear() {
    for (const tracer of this.pool) {
      tracer.inUse = false;
      tracer.mesh.visible = false;
    }
  }

  public destroy() {
    this.clear();
    for (const tracer of this.pool) {
      this.scene.remove(tracer.mesh);
      tracer.material.dispose();
    }
    this.cylinderGeo.dispose();
    this.pool = [];
  }
}
