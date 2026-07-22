import * as THREE from 'three';

interface WhiteParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  initialScale: number;
}

interface ImpactRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
}

interface ImpactFlash {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
}

export class HitSplashes {
  private scene: THREE.Scene;
  private particles: WhiteParticle[] = [];
  private rings: ImpactRing[] = [];
  private flashes: ImpactFlash[] = [];

  private sparkGeo: THREE.BoxGeometry;
  private sparkMat: THREE.MeshBasicMaterial;
  private ringGeo: THREE.TorusGeometry;
  private ringMat: THREE.MeshBasicMaterial;
  private flashGeo: THREE.SphereGeometry;
  private flashMat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Bright white spark geometry & glowing material
    this.sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.25);
    this.sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
    });

    // Expanding shockwave ring
    this.ringGeo = new THREE.TorusGeometry(0.4, 0.05, 12, 24);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });

    // Pure white impact core flash
    this.flashGeo = new THREE.SphereGeometry(0.45, 12, 12);
    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
    });
  }

  public spawn(position: THREE.Vector3, isCrit: boolean = false) {
    const particleCount = isCrit ? 18 : 10;

    // 1. Core White Flash
    const flashMesh = new THREE.Mesh(this.flashGeo, this.flashMat.clone());
    flashMesh.position.copy(position);
    this.scene.add(flashMesh);
    this.flashes.push({
      mesh: flashMesh,
      life: 0.12,
      maxLife: 0.12,
      maxScale: isCrit ? 2.5 : 1.5,
    });

    // 2. White Impact Shockwave Ring
    const ringMesh = new THREE.Mesh(this.ringGeo, this.ringMat.clone());
    ringMesh.position.copy(position);
    ringMesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    this.scene.add(ringMesh);
    this.rings.push({
      mesh: ringMesh,
      life: 0.18,
      maxLife: 0.18,
      maxScale: isCrit ? 3.5 : 2.0,
    });

    // 3. Radial White Spark Particles
    for (let i = 0; i < particleCount; i++) {
      const sparkMesh = new THREE.Mesh(this.sparkGeo, this.sparkMat.clone());
      sparkMesh.position.copy(position);

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.2) * 2,
        (Math.random() - 0.5) * 2
      ).normalize();

      sparkMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

      const speed = isCrit ? 12 + Math.random() * 16 : 8 + Math.random() * 10;
      const velocity = dir.multiplyScalar(speed);
      const life = 0.15 + Math.random() * 0.15;
      const initialScale = isCrit ? 1.5 + Math.random() * 0.8 : 0.8 + Math.random() * 0.6;

      sparkMesh.scale.setScalar(initialScale);
      this.scene.add(sparkMesh);

      this.particles.push({
        mesh: sparkMesh,
        velocity,
        life,
        maxLife: life,
        initialScale,
      });
    }
  }

  public update(delta: number) {
    // Update core flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const flash = this.flashes[i];
      flash.life -= delta;
      const progress = 1.0 - flash.life / flash.maxLife;

      const scale = 0.5 + progress * (flash.maxScale - 0.5);
      flash.mesh.scale.setScalar(scale);

      const mat = flash.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1.0 - progress);

      if (flash.life <= 0) {
        this.scene.remove(flash.mesh);
        mat.dispose();
        this.flashes.splice(i, 1);
      }
    }

    // Update shockwave rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life -= delta;
      const progress = 1.0 - ring.life / ring.maxLife;

      const scale = 0.5 + progress * ring.maxScale;
      ring.mesh.scale.setScalar(scale);

      const mat = ring.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (1.0 - progress) * 0.95);

      if (ring.life <= 0) {
        this.scene.remove(ring.mesh);
        mat.dispose();
        this.rings.splice(i, 1);
      }
    }

    // Update white spark particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      p.mesh.position.addScaledVector(p.velocity, delta);

      p.velocity.multiplyScalar(Math.pow(0.1, delta));

      const progress = 1.0 - p.life / p.maxLife;
      const scale = p.initialScale * (1.0 - progress);
      p.mesh.scale.setScalar(Math.max(0.01, scale));

      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1.0 - progress);

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        mat.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  public clear() {
    for (const f of this.flashes) {
      this.scene.remove(f.mesh);
      (f.mesh.material as THREE.Material).dispose();
    }
    for (const r of this.rings) {
      this.scene.remove(r.mesh);
      (r.mesh.material as THREE.Material).dispose();
    }
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.flashes = [];
    this.rings = [];
    this.particles = [];
  }
}
