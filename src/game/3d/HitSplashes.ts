import * as THREE from 'three';

/**
 * Pooled impact FX. Only the ice-shatter burst is live gameplay FX today; the generic
 * bullet-hit splash (`spawn`) is intentionally a no-op.
 *
 * PERF: this class used to also build 3 extra geometries and 6 extra materials for
 * particle/ring/flash/light systems that were never populated - allocated (and leaked,
 * being attached to nothing) on every level load. Only the resources the live pools
 * actually reference remain.
 */
export class HitSplashes {
  private scene: THREE.Scene;

  // Geometries
  private sparkGeo: THREE.BoxGeometry;
  private ringGeo: THREE.TorusGeometry;

  // Shared Materials for high performance & minimal GC
  private ringMatSecondary: THREE.MeshBasicMaterial;
  private cyanSparkMat: THREE.MeshBasicMaterial;

  private particlePool: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number; initialScale: number; active: boolean }[] = [];
  private ringPool: { mesh: THREE.Mesh; life: number; maxLife: number; maxScale: number; active: boolean }[] = [];
  private tempTarget = new THREE.Vector3();
  private tempOffset = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Optimized geometries with reasonable polygon counts
    this.sparkGeo = new THREE.BoxGeometry(0.10, 0.10, 0.40);
    this.ringGeo = new THREE.TorusGeometry(0.5, 0.06, 8, 16);

    this.ringMatSecondary = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.cyanSparkMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 1.0, depthWrite: false });

    // Pre-allocate pools
    for (let i = 0; i < 40; i++) {
      const pMesh = new THREE.Mesh(this.sparkGeo, this.cyanSparkMat);
      pMesh.visible = false;
      pMesh.frustumCulled = false;
      this.scene.add(pMesh);
      this.particlePool.push({
        mesh: pMesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0.7,
        initialScale: 1.0,
        active: false,
      });
    }

    for (let i = 0; i < 8; i++) {
      const ring = new THREE.Mesh(this.ringGeo, this.ringMatSecondary);
      ring.visible = false;
      ring.frustumCulled = false;
      this.scene.add(ring);
      this.ringPool.push({
        mesh: ring,
        life: 0,
        maxLife: 0.3,
        maxScale: 4.5,
        active: false,
      });
    }
  }

  public spawn(position: THREE.Vector3, isCrit: boolean = false) {
    // Disabled blue streak hit particles as requested
    return;
  }

  public spawnIceShatter(position: THREE.Vector3) {
    // 1. Cyan Shockwave Ring
    const ring = this.ringPool.find((r) => !r.active);
    if (ring) {
      ring.active = true;
      ring.life = 0.3;
      ring.maxLife = 0.3;
      ring.maxScale = 4.5;
      ring.mesh.position.copy(position);
      ring.mesh.position.y += 1.2;
      ring.mesh.rotation.x = Math.PI / 2;
      ring.mesh.visible = true;
    }

    // 2. Ice Shard Particles bursting outward
    let count = 0;
    for (const p of this.particlePool) {
      if (p.active) continue;
      p.active = true;
      // PERF: scratch vector - this used to allocate 11 Vector3 per burst.
      this.tempOffset.set(
        (Math.random() - 0.5) * 1.2,
        1.0 + (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 1.2
      );
      p.mesh.position.copy(position).add(this.tempOffset);

      p.velocity.set(
        (Math.random() - 0.5) * 18.0,
        4.0 + Math.random() * 12.0,
        (Math.random() - 0.5) * 18.0
      );

      this.tempTarget.copy(p.mesh.position).add(p.velocity);
      p.mesh.lookAt(this.tempTarget);
      p.life = 0.45 + Math.random() * 0.25;
      p.maxLife = 0.7;
      p.initialScale = 1.2 + Math.random() * 0.8;
      p.mesh.visible = true;

      count++;
      if (count >= 10) break;
    }
  }

  public update(delta: number) {
    // Update shockwave rings
    for (const ring of this.ringPool) {
      if (!ring.active) continue;
      ring.life -= delta;
      const progress = 1.0 - ring.life / ring.maxLife;

      const scale = (0.4 + progress * ring.maxScale) * (1.0 - progress);
      ring.mesh.scale.setScalar(Math.max(0.01, scale));

      if (ring.life <= 0) {
        ring.active = false;
        ring.mesh.visible = false;
      }
    }

    // Update white spark particles
    for (const p of this.particlePool) {
      if (!p.active) continue;
      p.life -= delta;
      p.mesh.position.addScaledVector(p.velocity, delta);

      p.velocity.multiplyScalar(Math.pow(0.08, delta));

      const progress = 1.0 - p.life / p.maxLife;
      const scale = p.initialScale * (1.0 - progress);
      p.mesh.scale.set(Math.max(0.01, scale * 0.5), Math.max(0.01, scale * 0.5), Math.max(0.01, scale * 1.6));

      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
      }
    }
  }

  public clear() {
    for (const r of this.ringPool) {
      r.active = false;
      r.mesh.visible = false;
    }
    for (const p of this.particlePool) {
      p.active = false;
      p.mesh.visible = false;
    }
  }

  /** Dispose pooled GPU resources (meshes are owned by the scene teardown). */
  public destroy() {
    this.sparkGeo.dispose();
    this.ringGeo.dispose();
    this.ringMatSecondary.dispose();
    this.cyanSparkMat.dispose();
  }
}
