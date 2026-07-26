import * as THREE from 'three';
import { EnemyType } from '../../types';
import { TextureGenerator } from './TextureGenerator';

export class ModelBuilder {
  private static metalTexture = TextureGenerator.getMetalArmorTexture();
  private static materialsCache: Map<string, THREE.Material> = new Map();
  private static geometryCache: Map<string, THREE.BufferGeometry> = new Map();

  public static getMaterial(key: string, creator: () => THREE.Material): THREE.Material {
    if (!this.materialsCache.has(key)) {
      this.materialsCache.set(key, creator());
    }
    return this.materialsCache.get(key)!;
  }

  public static getGeo(key: string, creator: () => THREE.BufferGeometry): THREE.BufferGeometry {
    if (!this.geometryCache.has(key)) {
      this.geometryCache.set(key, creator());
    }
    return this.geometryCache.get(key)!;
  }

  /** Reverse lookups so shared cached resources are never disposed with a level. */
  private static cachedGeometrySet: Set<THREE.BufferGeometry> | null = null;
  private static cachedMaterialSet: Set<THREE.Material> | null = null;
  private static cachedGeometrySetSize = -1;
  private static cachedMaterialSetSize = -1;

  /**
   * True when the geometry/material is one of the shared, cross-level cached instances.
   *
   * Level teardown walks the scene disposing GPU resources; these cached instances are
   * intentionally reused by the *next* level, so disposing them would leave dangling
   * references and force expensive regeneration. The lookup sets are rebuilt lazily whenever
   * the caches have grown.
   */
  public static isCachedResource(resource: THREE.BufferGeometry | THREE.Material): boolean {
    if (this.cachedGeometrySet === null || this.cachedGeometrySetSize !== this.geometryCache.size) {
      this.cachedGeometrySet = new Set(this.geometryCache.values());
      this.cachedGeometrySetSize = this.geometryCache.size;
    }
    if (this.cachedMaterialSet === null || this.cachedMaterialSetSize !== this.materialsCache.size) {
      this.cachedMaterialSet = new Set(this.materialsCache.values());
      this.cachedMaterialSetSize = this.materialsCache.size;
    }

    if ((resource as THREE.BufferGeometry).isBufferGeometry) {
      return this.cachedGeometrySet.has(resource as THREE.BufferGeometry);
    }
    return this.cachedMaterialSet.has(resource as THREE.Material);
  }

  private static createEmissiveMaterial(color: number, emissiveColor: number, emissiveIntensity: number = 0.5) {
    const cacheKey = `emissive_${color}_${emissiveColor}_${emissiveIntensity}`;
    return this.getMaterial(cacheKey, () => new THREE.MeshStandardMaterial({
      color,
      emissive: emissiveColor,
      emissiveIntensity,
      roughness: 0.22,
      metalness: 0.88,
    }));
  }


  // --- SHARED ENEMY BODY BUILDERS ---

  /**
   * Quadruped hyrax base: barrel torso, head with snout/nose/whiskers/ears/eyes/tusks,
   * four hip-pivoted legs (named leg_FL/FR/RL/RR so EnemyEngine can swing them) and a tail.
   * Used by the two "pack animal" mobs (dynamiter, hell bombardier).
   */
  private static buildHyraxQuadruped(
    group: THREE.Group,
    o: {
      furMat: THREE.Material;
      eyeMat: THREE.Material;
      bodyR: number;
      bodyL: number;
      bodyY: number;
      headR: number;
      headZ: number;
      legLen: number;
      tuskMat?: THREE.Material;
    }
  ) {
    const key = (n: number) => n.toFixed(3).replace('.', '_');

    // Barrel torso (capsule laid along Z) + haunches
    const bodyGeo = this.getGeo(`qbody_${key(o.bodyR)}_${key(o.bodyL)}`, () => {
      const g = new THREE.CapsuleGeometry(o.bodyR, o.bodyL, 10, 16);
      g.rotateX(Math.PI / 2);
      return g;
    });
    const body = new THREE.Mesh(bodyGeo, o.furMat);
    body.position.set(0, o.bodyY, 0);
    group.add(body);

    const haunchGeo = this.getGeo(`qhaunch_${key(o.bodyR)}`, () => new THREE.SphereGeometry(o.bodyR * 0.95, 12, 12));
    const haunch = new THREE.Mesh(haunchGeo, o.furMat);
    haunch.position.set(0, o.bodyY + o.bodyR * 0.12, -o.bodyL * 0.5);
    haunch.scale.set(1.05, 0.95, 0.9);
    group.add(haunch);

    // Head, snout, nose
    const headGeo = this.getGeo(`qhead_${key(o.headR)}`, () => new THREE.SphereGeometry(o.headR, 14, 14));
    const head = new THREE.Mesh(headGeo, o.furMat);
    head.position.set(0, o.bodyY + o.bodyR * 0.55, o.headZ);
    group.add(head);

    const snoutGeo = this.getGeo(`qsnout_${key(o.headR)}`, () => new THREE.SphereGeometry(o.headR * 0.55, 10, 10));
    const snout = new THREE.Mesh(snoutGeo, o.furMat);
    snout.position.set(0, o.bodyY + o.bodyR * 0.36, o.headZ + o.headR * 0.82);
    snout.scale.set(1.15, 0.85, 1.35);
    group.add(snout);

    const noseGeo = this.getGeo('nose_045', () => new THREE.SphereGeometry(0.045, 8, 8));
    const nose = new THREE.Mesh(noseGeo, this.getMaterial('nose_black', () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 })));
    nose.position.set(0, o.bodyY + o.bodyR * 0.38, o.headZ + o.headR * 1.35);
    group.add(nose);

    // Eyes
    const eyeGeo = this.getGeo('eye_007', () => new THREE.SphereGeometry(0.07, 8, 8));
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, o.eyeMat);
      eye.position.set(side * o.headR * 0.5, o.bodyY + o.bodyR * 0.72, o.headZ + o.headR * 0.78);
      group.add(eye);
    }

    // Rodent tusks
    if (o.tuskMat) {
      const tuskGeo = this.getGeo('tusk_small', () => new THREE.BoxGeometry(0.055, 0.16, 0.05));
      for (const side of [-1, 1]) {
        const tusk = new THREE.Mesh(tuskGeo, o.tuskMat);
        tusk.position.set(side * 0.075, o.bodyY + o.bodyR * 0.16, o.headZ + o.headR * 1.2);
        tusk.rotation.x = 0.15;
        group.add(tusk);
      }
    }

    // Ears with inner lining
    const earGeo = this.getGeo('qear_outer', () => new THREE.SphereGeometry(0.13, 10, 10));
    const earInGeo = this.getGeo('qear_inner', () => new THREE.SphereGeometry(0.08, 8, 8));
    const pinkMat = this.getMaterial('ear_pink', () => new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.6 }));
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, o.furMat);
      ear.position.set(side * o.headR * 0.78, o.bodyY + o.bodyR * 1.1, o.headZ - o.headR * 0.1);
      ear.scale.set(0.55, 1.0, 0.85);
      group.add(ear);

      const inner = new THREE.Mesh(earInGeo, pinkMat);
      inner.position.set(side * o.headR * 0.86, o.bodyY + o.bodyR * 1.08, o.headZ - o.headR * 0.05);
      inner.scale.set(0.4, 0.9, 0.7);
      group.add(inner);
    }

    // Whiskers
    const whiskerGeo = this.getGeo('whisker_022', () => new THREE.CylinderGeometry(0.004, 0.002, 0.22, 4));
    const whiskerMat = this.getMaterial('whisker_dark', () => new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    for (const side of [-1, 1]) {
      for (let w = -1; w <= 1; w++) {
        const whisker = new THREE.Mesh(whiskerGeo, whiskerMat);
        whisker.rotation.z = Math.PI / 2 + side * 0.12;
        whisker.rotation.x = w * 0.16;
        whisker.position.set(side * o.headR * 0.65, o.bodyY + o.bodyR * 0.36 + w * 0.03, o.headZ + o.headR * 1.05);
        group.add(whisker);
      }
    }

    // Four hip-pivoted legs (the pivot Group carries the animated name)
    const thighGeo = this.getGeo(`qthigh_${key(o.legLen)}`, () => new THREE.CapsuleGeometry(o.legLen * 0.22, o.legLen * 0.55, 6, 8));
    const pawGeo = this.getGeo('qpaw', () => new THREE.SphereGeometry(0.11, 8, 8));
    const clawGeo = this.getGeo('qclaw', () => new THREE.ConeGeometry(0.022, 0.09, 5));
    const clawMat = this.getMaterial('claw_dark', () => new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.35 }));
    const legNames = [
      ['leg_FL', -1, 1],
      ['leg_FR', 1, 1],
      ['leg_RL', -1, -1],
      ['leg_RR', 1, -1],
    ] as const;
    for (const [name, sx, sz] of legNames) {
      const hip = new THREE.Group();
      hip.name = name;
      hip.position.set(sx * o.bodyR * 0.72, o.bodyY - o.bodyR * 0.2, sz * o.bodyL * 0.34);
      group.add(hip);

      const thigh = new THREE.Mesh(thighGeo, o.furMat);
      thigh.position.y = -o.legLen * 0.42;
      hip.add(thigh);

      const paw = new THREE.Mesh(pawGeo, o.furMat);
      paw.position.set(0, -o.legLen * 0.85, 0.04);
      paw.scale.set(1.1, 0.7, 1.3);
      hip.add(paw);

      for (const cx of [-0.05, 0, 0.05]) {
        const claw = new THREE.Mesh(clawGeo, clawMat);
        claw.position.set(cx, -o.legLen * 0.9, 0.13);
        claw.rotation.x = Math.PI / 2.2;
        hip.add(claw);
      }
    }

    // Stub tail
    const tailGeo = this.getGeo('qtail', () => new THREE.SphereGeometry(0.1, 8, 8));
    const tail = new THREE.Mesh(tailGeo, o.furMat);
    tail.position.set(0, o.bodyY + o.bodyR * 0.35, -o.bodyL * 0.62 - o.bodyR * 0.45);
    tail.scale.set(0.8, 0.8, 1.2);
    group.add(tail);
  }

  /**
   * Bipedal armoured-guard base: plated torso, pauldrons, belt, two hip-pivoted armoured
   * legs (leg_FL/leg_FR) and a hyrax head. Shared by the mine overseer and the hell
   * praetorian - their silhouettes are the same, only the trim differs.
   */
  private static buildArmoredBiped(
    group: THREE.Group,
    o: {
      furMat: THREE.Material;
      plateMat: THREE.Material;
      trimMat: THREE.Material;
      eyeMat: THREE.Material;
      spiked: boolean;
    }
  ) {
    const boltMat = this.getMaterial('chrome_bolt', () => new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.1, metalness: 0.98 }));

    // Torso: fur core + layered cuirass
    const torso = new THREE.Mesh(this.getGeo('bip_torso', () => new THREE.BoxGeometry(0.74, 0.98, 0.6)), o.furMat);
    torso.position.y = 1.05;
    group.add(torso);

    const cuirass = new THREE.Mesh(this.getGeo('bip_cuirass', () => new THREE.BoxGeometry(0.86, 0.72, 0.68)), o.plateMat);
    cuirass.position.y = 1.16;
    group.add(cuirass);

    const skirtGeo = this.getGeo('bip_skirt', () => new THREE.BoxGeometry(0.8, 0.16, 0.64));
    for (let i = 0; i < 3; i++) {
      const skirt = new THREE.Mesh(skirtGeo, o.plateMat);
      skirt.position.set(0, 0.78 - i * 0.15, 0);
      skirt.scale.setScalar(1 - i * 0.06);
      group.add(skirt);
    }

    const gorget = new THREE.Mesh(this.getGeo('bip_gorget', () => new THREE.CylinderGeometry(0.3, 0.36, 0.16, 12)), o.trimMat);
    gorget.position.y = 1.56;
    group.add(gorget);

    // Rivets down the breastplate
    const boltGeo = this.getGeo('bolt_022', () => new THREE.SphereGeometry(0.022, 8, 8));
    for (const bx of [-0.36, 0.36]) {
      for (const by of [0.98, 1.18, 1.38]) {
        const rivet = new THREE.Mesh(boltGeo, boltMat);
        rivet.position.set(bx, by, 0.35);
        group.add(rivet);
      }
    }

    // Pauldrons (+ optional spikes)
    const pauldronGeo = this.getGeo('bip_pauldron', () => new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.7));
    const spikeGeo = this.getGeo('bip_spike', () => new THREE.ConeGeometry(0.05, 0.24, 6));
    for (const side of [-1, 1]) {
      const pauldron = new THREE.Mesh(pauldronGeo, o.plateMat);
      pauldron.position.set(side * 0.48, 1.46, 0);
      pauldron.rotation.z = side * 0.35;
      group.add(pauldron);

      const band = new THREE.Mesh(this.getGeo('bip_pauldron_band', () => new THREE.TorusGeometry(0.24, 0.03, 6, 14)), o.trimMat);
      band.position.set(side * 0.48, 1.4, 0);
      band.rotation.x = Math.PI / 2;
      group.add(band);

      if (o.spiked) {
        for (const sz of [-0.1, 0.1]) {
          const spike = new THREE.Mesh(spikeGeo, o.trimMat);
          spike.position.set(side * 0.56, 1.62, sz);
          spike.rotation.z = side * 0.5;
          group.add(spike);
        }
      }
    }

    // Belt with buckle
    const belt = new THREE.Mesh(this.getGeo('bip_belt', () => new THREE.BoxGeometry(0.88, 0.14, 0.7)), o.trimMat);
    belt.position.y = 0.86;
    group.add(belt);
    const buckle = new THREE.Mesh(this.getGeo('bip_buckle', () => new THREE.BoxGeometry(0.18, 0.16, 0.06)), boltMat);
    buckle.position.set(0, 0.86, 0.37);
    group.add(buckle);

    // Armoured legs on hip pivots
    const thighGeo = this.getGeo('bip_thigh', () => new THREE.CapsuleGeometry(0.15, 0.34, 6, 8));
    const greaveGeo = this.getGeo('bip_greave', () => new THREE.BoxGeometry(0.26, 0.34, 0.26));
    const kneeGeo = this.getGeo('bip_knee', () => new THREE.SphereGeometry(0.14, 10, 8));
    const bootGeo = this.getGeo('bip_boot', () => new THREE.BoxGeometry(0.3, 0.14, 0.44));
    for (const [name, sx] of [['leg_FL', -1], ['leg_FR', 1]] as const) {
      const hip = new THREE.Group();
      hip.name = name;
      hip.position.set(sx * 0.22, 0.74, 0);
      group.add(hip);

      const thigh = new THREE.Mesh(thighGeo, o.furMat);
      thigh.position.y = -0.2;
      hip.add(thigh);

      const knee = new THREE.Mesh(kneeGeo, o.plateMat);
      knee.position.y = -0.4;
      hip.add(knee);

      const greave = new THREE.Mesh(greaveGeo, o.plateMat);
      greave.position.y = -0.56;
      hip.add(greave);

      const boot = new THREE.Mesh(bootGeo, o.trimMat);
      boot.position.set(0, -0.72, 0.07);
      hip.add(boot);
    }

    // Head (hyrax muzzle stays visible under the helm added by callers)
    const head = new THREE.Mesh(this.getGeo('bip_head', () => new THREE.SphereGeometry(0.31, 14, 14)), o.furMat);
    head.position.set(0, 1.78, 0.06);
    group.add(head);

    const muzzle = new THREE.Mesh(this.getGeo('bip_muzzle', () => new THREE.SphereGeometry(0.17, 10, 10)), o.furMat);
    muzzle.position.set(0, 1.68, 0.3);
    muzzle.scale.set(1.1, 0.8, 1.3);
    group.add(muzzle);

    const nose = new THREE.Mesh(this.getGeo('nose_045', () => new THREE.SphereGeometry(0.045, 8, 8)), this.getMaterial('nose_black', () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 })));
    nose.position.set(0, 1.7, 0.45);
    group.add(nose);

    const eyeGeo = this.getGeo('eye_006', () => new THREE.SphereGeometry(0.06, 8, 8));
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, o.eyeMat);
      eye.position.set(side * 0.13, 1.83, 0.26);
      group.add(eye);
    }

    // Arms: shoulder -> upper -> forearm -> gauntlet. Callers attach weapons at the hands.
    const upperGeo = this.getGeo('bip_upperarm', () => new THREE.CapsuleGeometry(0.11, 0.26, 6, 8));
    const foreGeo = this.getGeo('bip_forearm', () => new THREE.BoxGeometry(0.2, 0.34, 0.2));
    const fistGeo = this.getGeo('bip_fist', () => new THREE.SphereGeometry(0.13, 10, 8));
    for (const side of [-1, 1]) {
      const upper = new THREE.Mesh(upperGeo, o.furMat);
      upper.position.set(side * 0.5, 1.22, 0.02);
      upper.rotation.z = side * 0.16;
      group.add(upper);

      const fore = new THREE.Mesh(foreGeo, o.plateMat);
      fore.position.set(side * 0.56, 0.94, 0.14);
      fore.rotation.x = -0.3;
      group.add(fore);

      const fist = new THREE.Mesh(fistGeo, o.trimMat);
      fist.position.set(side * 0.58, 0.78, 0.3);
      group.add(fist);
    }
  }

  // --- ENEMY 3D MODELS ---

  public static createEnemyMesh(type: EnemyType): THREE.Group {
    const group = new THREE.Group();

    // Solid-colored, high-performance satin/matte materials for zero texture churn & ultra-high FPS
    const stdFurMat = this.getMaterial('std_fur_solid', () => new THREE.MeshStandardMaterial({
      color: 0x8a5229, // Solid chestnut brown hyrax body
      roughness: 0.65,
      metalness: 0.05,
    }));

    const darkFurMat = this.getMaterial('dark_fur_solid', () => new THREE.MeshStandardMaterial({
      color: 0x241d18, // Solid dark charcoal hyrax body
      roughness: 0.70,
      metalness: 0.05,
    }));

    const metalMat = this.getMaterial('metal_armor_solid', () => new THREE.MeshStandardMaterial({
      color: 0x334155, // Solid titanium steel
      roughness: 0.22,
      metalness: 0.92,
    }));

    const carbonMat = this.getMaterial('carbon_fiber_solid', () => new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Solid carbon graphite
      roughness: 0.35,
      metalness: 0.70,
    }));

    const hazardMat = this.getMaterial('hazard_stripes_solid', () => new THREE.MeshStandardMaterial({
      color: 0xeab308, // Solid caution yellow
      roughness: 0.38,
      metalness: 0.25,
    }));

    const boltMat = this.getMaterial('chrome_bolt', () => new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.1,
      metalness: 0.98,
    }));

    const ledRedMat = this.getMaterial('led_red', () => new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    const ledCyanMat = this.getMaterial('led_cyan', () => new THREE.MeshBasicMaterial({ color: 0x06b6d4 }));
    const ledGreenMat = this.getMaterial('led_green', () => new THREE.MeshBasicMaterial({ color: 0x22c55e }));

    switch (type) {
      // --- CHAPTER 1: MOBS 1-4 ---
      case 'robo_doman': {
        // РОБО-ДОМАН: Hyrax with bionic prosthetic limbs, steel claws, glowing red eyes, metallic shoulder armor & hydraulic hoses
        const bodyGeo = this.getGeo('cap_0.38_0.55_12_16', () => {
          const g = new THREE.CapsuleGeometry(0.38, 0.55, 12, 16);
          g.rotateX(Math.PI / 2);
          return g;
        });
        const body = new THREE.Mesh(bodyGeo, stdFurMat);
        body.position.y = 0.55;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Steel Spine Plates on back + Micro Chrome Rivets
        const spineGeo = this.getGeo('box_0.18_0.08_0.16', () => new THREE.BoxGeometry(0.18, 0.08, 0.16));
        const boltGeo = this.getGeo('sph_0.02_8_8', () => new THREE.SphereGeometry(0.02, 8, 8));
        for (let s = 0; s < 4; s++) {
          const spinePlate = new THREE.Mesh(spineGeo, metalMat);
          spinePlate.position.set(0, 0.92, -0.2 + s * 0.15);
          group.add(spinePlate);

          for (const rx of [-0.07, 0.07]) {
            const bolt = new THREE.Mesh(boltGeo, boltMat);
            bolt.position.set(rx, 0.97, -0.2 + s * 0.15);
            group.add(bolt);
          }
        }

        // Head with Snout, Nose, Whiskers & Ears
        const headGeo = this.getGeo('sph_0.32_14_14', () => new THREE.SphereGeometry(0.32, 14, 14));
        const head = new THREE.Mesh(headGeo, stdFurMat);
        head.position.set(0, 0.78, 0.38);
        head.castShadow = true;
        group.add(head);

        const snoutGeo = this.getGeo('sph_0.14_10_10', () => new THREE.SphereGeometry(0.14, 10, 10));
        const snout = new THREE.Mesh(snoutGeo, stdFurMat);
        snout.position.set(0, 0.72, 0.65);
        snout.scale.set(1.2, 0.8, 1.4);
        group.add(snout);

        const noseGeo = this.getGeo('sph_0.045_8_8', () => new THREE.SphereGeometry(0.045, 8, 8));
        const noseMat = this.getMaterial('nose_black', () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 }));
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.set(0, 0.75, 0.78);
        group.add(nose);

        // Whiskers
        const whiskerGeo = this.getGeo('cyl_0.004_0.002_0.25_4', () => new THREE.CylinderGeometry(0.004, 0.002, 0.25, 4));
        const whiskerMat = this.getMaterial('whisker_dark', () => new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
        for (const side of [-1, 1]) {
          for (let w = -1; w <= 1; w++) {
            const whisker = new THREE.Mesh(whiskerGeo, whiskerMat);
            whisker.rotation.z = Math.PI / 2 + side * 0.1;
            whisker.rotation.x = w * 0.15;
            whisker.position.set(side * 0.22, 0.72 + w * 0.03, 0.68);
            group.add(whisker);
          }
        }

        // Ears with inner pink lining
        const earGeo = this.getGeo('cone_0.085_0.24_8', () => new THREE.ConeGeometry(0.085, 0.24, 8));
        const innerEarGeo = this.getGeo('cone_0.05_0.18_8', () => new THREE.ConeGeometry(0.05, 0.18, 8));
        const pinkMat = this.getMaterial('ear_pink', () => new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.6 }));
        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(earGeo, stdFurMat);
          ear.position.set(side * 0.22, 1.05, 0.35);
          ear.rotation.z = side * -0.3;
          group.add(ear);

          const innerEar = new THREE.Mesh(innerEarGeo, pinkMat);
          innerEar.position.set(side * 0.21, 1.04, 0.37);
          innerEar.rotation.z = side * -0.3;
          group.add(innerEar);
        }

        // Cybernetic Red Optic Eye (Left) & Chrome Bezel Ring
        const opticGeo = this.getGeo('sph_0.06_10_10', () => new THREE.SphereGeometry(0.06, 10, 10));
        const eye = new THREE.Mesh(opticGeo, ledRedMat);
        eye.position.set(-0.14, 0.82, 0.64);
        group.add(eye);

        const bezelGeo = this.getGeo('torus_0.065_0.012_8_12', () => new THREE.TorusGeometry(0.065, 0.012, 8, 12));
        const bezel = new THREE.Mesh(bezelGeo, boltMat);
        bezel.position.set(-0.14, 0.82, 0.65);
        group.add(bezel);

        const rightEyeGeo = this.getGeo('sph_0.05_8_8', () => new THREE.SphereGeometry(0.05, 8, 8));
        const darkEyeMat = this.getMaterial('dark_eye', () => new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1 }));
        const rightEye = new THREE.Mesh(rightEyeGeo, darkEyeMat);
        rightEye.position.set(0.14, 0.82, 0.64);
        group.add(rightEye);

        // Cybernetic Bionic Left Arm & Shoulder Armor with Rivets & Hydraulics
        const roboArmGroup = new THREE.Group();
        roboArmGroup.name = 'robo_arm';
        roboArmGroup.position.set(-0.4, 0.72, 0.2); // Pivot at shoulder

        const shoulderPaulGeo = this.getGeo('box_0.3_0.3_0.3', () => new THREE.BoxGeometry(0.3, 0.3, 0.3));
        const shoulderPaul = new THREE.Mesh(shoulderPaulGeo, metalMat);
        shoulderPaul.position.set(0, 0, 0);
        roboArmGroup.add(shoulderPaul);

        for (const px of [-0.12, 0.12]) {
          for (const py of [-0.12, 0.12]) {
            const rivet = new THREE.Mesh(boltGeo, boltMat);
            rivet.position.set(px, py, 0.16);
            roboArmGroup.add(rivet);
          }
        }

        const pipe1Geo = this.getGeo('cyl_0.02_0.02_0.42_8', () => new THREE.CylinderGeometry(0.02, 0.02, 0.42, 8));
        const pipe1Mat = this.getMaterial('pipe_blue', () => new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.8 }));
        const hydroPipe1 = new THREE.Mesh(pipe1Geo, pipe1Mat);
        hydroPipe1.position.set(0, 0.03, -0.15);
        roboArmGroup.add(hydroPipe1);

        const pipe2Geo = this.getGeo('cyl_0.018_0.018_0.38_8', () => new THREE.CylinderGeometry(0.018, 0.018, 0.38, 8));
        const pipe2Mat = this.getMaterial('pipe_orange', () => new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8 }));
        const hydroPipe2 = new THREE.Mesh(pipe2Geo, pipe2Mat);
        hydroPipe2.position.set(-0.02, -0.1, -0.12);
        roboArmGroup.add(hydroPipe2);

        const armGeo = this.getGeo('cyl_0.085_0.065_0.54_10', () => new THREE.CylinderGeometry(0.085, 0.065, 0.54, 10));
        const bionicArm = new THREE.Mesh(armGeo, metalMat);
        bionicArm.position.set(-0.04, -0.27, 0.12);
        bionicArm.rotation.x = Math.PI / 4;
        roboArmGroup.add(bionicArm);

        // Cyan Energy Strip on forearm
        const stripGeo = this.getGeo('box_0.02_0.3_0.03', () => new THREE.BoxGeometry(0.02, 0.3, 0.03));
        const energyStrip = new THREE.Mesh(stripGeo, ledCyanMat);
        energyStrip.position.set(-0.1, -0.27, 0.14);
        energyStrip.rotation.x = Math.PI / 4;
        roboArmGroup.add(energyStrip);

        // 3 Curved Razor Steel Claws
        const clawGeo = this.getGeo('cone_0.028_0.38_8', () => new THREE.ConeGeometry(0.028, 0.38, 8));
        for (let c = -1; c <= 1; c++) {
          const claw = new THREE.Mesh(clawGeo, boltMat);
          claw.position.set(-0.04 + c * 0.065, -0.52, 0.34);
          claw.rotation.x = Math.PI / 2.1;
          roboArmGroup.add(claw);
        }
        group.add(roboArmGroup);

        // Natural Fur Right Arm
        const rArmGeo = this.getGeo('cyl_0.075_0.075_0.42_8', () => new THREE.CylinderGeometry(0.075, 0.075, 0.42, 8));
        const rightArm = new THREE.Mesh(rArmGeo, stdFurMat);
        rightArm.name = 'robo_right_arm';
        rightArm.position.set(0.38, 0.38, 0.25);
        group.add(rightArm);
        break;
      }

      case 'doman_sniper': {
        // ДОМАН-СНАЙПЕР: Highly detailed Hyrax sniper with cute face, whiskers, padded paws & realistic sniper rifle

        // Materials
        const creamFurMat = this.getMaterial('cream_fur', () => new THREE.MeshStandardMaterial({
          color: 0xebdbbe,
          roughness: 0.75,
          metalness: 0.02,
        }));
        const noseMat = this.getMaterial('nose_black', () => new THREE.MeshStandardMaterial({
          color: 0x111111,
          roughness: 0.15,
        }));
        const pinkEarMat = this.getMaterial('ear_pink', () => new THREE.MeshStandardMaterial({
          color: 0xf472b6,
          roughness: 0.6,
        }));
        const darkEyeMat = this.getMaterial('dark_eye_shiny', () => new THREE.MeshStandardMaterial({
          color: 0x0a0a0f,
          roughness: 0.05,
        }));
        const eyeGlintMat = this.getMaterial('eye_glint', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));
        const whiskerMat = this.getMaterial('whisker_dark', () => new THREE.MeshBasicMaterial({ color: 0x222222 }));
        const pawPadMat = this.getMaterial('paw_pad_pink', () => new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.5 }));
        const clawMat = this.getMaterial('claw_dark', () => new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.3, metalness: 0.5 }));

        // 1. Body & Chest Fur Patch
        const bodyGeo = this.getGeo('cap_0.38_0.72_12_16', () => {
          const g = new THREE.CapsuleGeometry(0.38, 0.72, 12, 16);
          g.rotateX(Math.PI / 2);
          return g;
        });
        const body = new THREE.Mesh(bodyGeo, stdFurMat);
        body.position.y = 0.52;
        body.castShadow = true;
        group.add(body);

        // Cream Chest/Belly fur patch
        const chestGeo = this.getGeo('sph_0.28_10_10', () => new THREE.SphereGeometry(0.28, 10, 10));
        const chestFur = new THREE.Mesh(chestGeo, creamFurMat);
        chestFur.scale.set(0.9, 0.7, 1.3);
        chestFur.position.set(0, 0.42, 0.18);
        group.add(chestFur);

        // 2. Detailed Paws ("ЛАПКИ") with 3 Toe Digits & Pads
        const legGeo = this.getGeo('cyl_0.065_0.055_0.38_8', () => new THREE.CylinderGeometry(0.065, 0.055, 0.38, 8));
        const pawMainGeo = this.getGeo('box_0.13_0.06_0.16', () => new THREE.BoxGeometry(0.13, 0.06, 0.16));
        const toeGeo = this.getGeo('sph_0.035_8_8', () => new THREE.SphereGeometry(0.035, 8, 8));
        const clawGeo = this.getGeo('cone_0.015_0.04_6', () => new THREE.ConeGeometry(0.015, 0.04, 6));

        for (const sx of [-0.28, 0.28]) {
          for (const sz of [-0.22, 0.28]) {
            // Upper leg / limb
            const leg = new THREE.Mesh(legGeo, stdFurMat);
            leg.position.set(sx, 0.19, sz);
            group.add(leg);

            // Main Paw Pad Base
            const pawBase = new THREE.Mesh(pawMainGeo, creamFurMat);
            pawBase.position.set(sx, 0.03, sz + 0.04);
            group.add(pawBase);

            // Paw underside pad
            const padUnder = new THREE.Mesh(pawMainGeo, pawPadMat);
            padUnder.scale.set(0.8, 0.3, 0.8);
            padUnder.position.set(sx, 0.005, sz + 0.04);
            group.add(padUnder);

            // 3 Individual Toe Digits with claws
            for (let t = -1; t <= 1; t++) {
              const toeX = sx + t * 0.04;
              const toeZ = sz + 0.11;

              const toe = new THREE.Mesh(toeGeo, creamFurMat);
              toe.position.set(toeX, 0.035, toeZ);
              group.add(toe);

              const claw = new THREE.Mesh(clawGeo, clawMat);
              claw.rotation.x = Math.PI / 2 + 0.2;
              claw.position.set(toeX, 0.025, toeZ + 0.03);
              group.add(claw);
            }
          }
        }

        // 3. Cute Face / Muzzle ("МОРДОЧКА")
        const headGeo = this.getGeo('sph_0.32_14_14', () => new THREE.SphereGeometry(0.32, 14, 14));
        const head = new THREE.Mesh(headGeo, stdFurMat);
        head.position.set(0, 0.72, 0.45);
        head.castShadow = true;
        group.add(head);

        // Soft Snout / Muzzle cheeks
        const snoutGeo = this.getGeo('sph_0.15_12_12', () => new THREE.SphereGeometry(0.15, 12, 12));
        const snout = new THREE.Mesh(snoutGeo, creamFurMat);
        snout.scale.set(1.3, 0.85, 1.4);
        snout.position.set(0, 0.68, 0.70);
        group.add(snout);

        // Dark shiny Nose button
        const noseGeo = this.getGeo('sph_0.045_8_8', () => new THREE.SphereGeometry(0.045, 8, 8));
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.scale.set(1.2, 0.8, 1.0);
        nose.position.set(0, 0.72, 0.84);
        group.add(nose);

        // Eyes (Cute dark glass eyes + Specular highlight glints)
        const eyeGeo = this.getGeo('sph_0.055_10_10', () => new THREE.SphereGeometry(0.055, 10, 10));
        const glintGeo = this.getGeo('sph_0.018_6_6', () => new THREE.SphereGeometry(0.018, 6, 6));

        for (const ex of [-0.15, 0.15]) {
          const eye = new THREE.Mesh(eyeGeo, darkEyeMat);
          eye.position.set(ex, 0.77, 0.68);
          group.add(eye);

          // Specular Glint
          const glint = new THREE.Mesh(glintGeo, eyeGlintMat);
          glint.position.set(ex + (ex > 0 ? -0.018 : 0.018), 0.785, 0.725);
          group.add(glint);
        }

        // Tactical Monocle Frame over Right Eye
        const monocleGeo = this.getGeo('torus_0.065_0.012_8_12', () => new THREE.TorusGeometry(0.065, 0.012, 8, 12));
        const monocleBezel = new THREE.Mesh(monocleGeo, metalMat);
        monocleBezel.position.set(0.15, 0.77, 0.69);
        group.add(monocleBezel);

        // 4. Whiskers ("УСЫ")
        const whiskerGeo = this.getGeo('cyl_0.003_0.001_0.28_4', () => new THREE.CylinderGeometry(0.003, 0.001, 0.28, 4));
        for (const side of [-1, 1]) {
          for (let w = -1; w <= 1; w++) {
            const whisker = new THREE.Mesh(whiskerGeo, whiskerMat);
            whisker.rotation.z = Math.PI / 2 + side * 0.12;
            whisker.rotation.x = w * 0.18;
            whisker.position.set(side * 0.22, 0.68 + w * 0.025, 0.76);
            group.add(whisker);
          }
        }

        // 5. Cute Ears with Pink Lining
        const earGeo = this.getGeo('cone_0.085_0.22_8', () => new THREE.ConeGeometry(0.085, 0.22, 8));
        const innerEarGeo = this.getGeo('cone_0.05_0.16_8', () => new THREE.ConeGeometry(0.05, 0.16, 8));

        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(earGeo, stdFurMat);
          ear.position.set(side * 0.22, 0.98, 0.42);
          ear.rotation.z = side * -0.32;
          group.add(ear);

          const innerEar = new THREE.Mesh(innerEarGeo, pinkEarMat);
          innerEar.position.set(side * 0.21, 0.97, 0.44);
          innerEar.rotation.z = side * -0.32;
          group.add(innerEar);
        }

        // 6. Leather Harness & Back Mount
        const harnessGeo = this.getGeo('box_0.54_0.3_0.65', () => new THREE.BoxGeometry(0.54, 0.3, 0.65));
        const harness = new THREE.Mesh(harnessGeo, carbonMat);
        harness.position.set(0, 0.85, -0.05);
        group.add(harness);

        const buckleGeo = this.getGeo('box_0.08_0.08_0.04', () => new THREE.BoxGeometry(0.08, 0.08, 0.04));
        const goldMat = this.getMaterial('gold_buckle', () => new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.2 }));
        for (const bx of [-0.25, 0.25]) {
          const buckle = new THREE.Mesh(buckleGeo, goldMat);
          buckle.position.set(bx, 0.88, 0.28);
          group.add(buckle);
        }

        // 7. REALISTIC HIGH-PRECISION SNIPER RIFLE ("РЕАЛИСТИЧНАЯ ВИНТОВКА")
        // Rifle Receiver / Action
        const receiverGeo = this.getGeo('box_0.16_0.22_1.1', () => new THREE.BoxGeometry(0.16, 0.22, 1.1));
        const receiver = new THREE.Mesh(receiverGeo, carbonMat);
        receiver.position.set(0, 1.18, 0.1);
        group.add(receiver);

        // Long Precision Rifled Barrel
        const barrelGeo = this.getGeo('cyl_0.035_0.035_1.9_12', () => new THREE.CylinderGeometry(0.035, 0.035, 1.9, 12));
        const barrel = new THREE.Mesh(barrelGeo, metalMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 1.18, 1.25);
        group.add(barrel);

        // Perforated Handguard / Heat Shroud over barrel
        const shroudGeo = this.getGeo('cyl_0.065_0.065_0.8_10', () => new THREE.CylinderGeometry(0.065, 0.065, 0.8, 10));
        const shroud = new THREE.Mesh(shroudGeo, carbonMat);
        shroud.rotation.x = Math.PI / 2;
        shroud.position.set(0, 1.18, 0.85);
        group.add(shroud);

        // Multi-port Muzzle Brake / Flash Hider at barrel tip
        const brakeGeo = this.getGeo('box_0.09_0.09_0.25', () => new THREE.BoxGeometry(0.09, 0.09, 0.25));
        const muzzleBrake = new THREE.Mesh(brakeGeo, metalMat);
        muzzleBrake.position.set(0, 1.18, 2.22);
        group.add(muzzleBrake);

        // CNC Chrome Bolt Handle with Ball Knob
        const boltGeo = this.getGeo('cyl_0.015_0.015_0.18_6', () => new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6));
        const boltKnobGeo = this.getGeo('sph_0.035_8_8', () => new THREE.SphereGeometry(0.035, 8, 8));

        const boltHandle = new THREE.Mesh(boltGeo, boltMat);
        boltHandle.rotation.z = -Math.PI / 3;
        boltHandle.position.set(0.12, 1.18, -0.1);
        group.add(boltHandle);

        const boltKnob = new THREE.Mesh(boltKnobGeo, boltMat);
        boltKnob.position.set(0.20, 1.12, -0.1);
        group.add(boltKnob);

        // Picatinny Rail
        const railGeo = this.getGeo('box_0.10_0.04_0.85', () => new THREE.BoxGeometry(0.10, 0.04, 0.85));
        const picatinnyRail = new THREE.Mesh(railGeo, metalMat);
        picatinnyRail.position.set(0, 1.30, 0.1);
        group.add(picatinnyRail);

        // Highly Detailed Telescopic Scope
        // Scope Body Tube
        const scopeTubeGeo = this.getGeo('cyl_0.045_0.045_0.65_12', () => new THREE.CylinderGeometry(0.045, 0.045, 0.65, 12));
        const scopeTube = new THREE.Mesh(scopeTubeGeo, carbonMat);
        scopeTube.rotation.x = Math.PI / 2;
        scopeTube.position.set(0, 1.39, 0.1);
        group.add(scopeTube);

        // Scope Front Objective Bell (Larger cone)
        const scopeBellGeo = this.getGeo('cyl_0.07_0.045_0.22_12', () => new THREE.CylinderGeometry(0.07, 0.045, 0.22, 12));
        const scopeBell = new THREE.Mesh(scopeBellGeo, metalMat);
        scopeBell.rotation.x = Math.PI / 2;
        scopeBell.position.set(0, 1.39, 0.50);
        group.add(scopeBell);

        // Cyan Anti-reflective Objective Glass Lens
        const scopeLensGeo = this.getGeo('cyl_0.065_0.065_0.02_12', () => new THREE.CylinderGeometry(0.065, 0.065, 0.02, 12));
        const scopeLens = new THREE.Mesh(scopeLensGeo, ledCyanMat);
        scopeLens.rotation.x = Math.PI / 2;
        scopeLens.position.set(0, 1.39, 0.61);
        group.add(scopeLens);

        // Scope Rear Eyepiece
        const scopeEyepieceGeo = this.getGeo('cyl_0.052_0.045_0.18_12', () => new THREE.CylinderGeometry(0.052, 0.045, 0.18, 12));
        const scopeEyepiece = new THREE.Mesh(scopeEyepieceGeo, metalMat);
        scopeEyepiece.rotation.x = Math.PI / 2;
        scopeEyepiece.position.set(0, 1.39, -0.30);
        group.add(scopeEyepiece);

        // Dual Scope Mounting Rings
        const ringGeo = this.getGeo('torus_0.055_0.015_8_12', () => new THREE.TorusGeometry(0.055, 0.015, 8, 12));
        for (const rz of [-0.12, 0.32]) {
          const mountRing = new THREE.Mesh(ringGeo, metalMat);
          mountRing.position.set(0, 1.39, rz);
          group.add(mountRing);
        }

        // Scope Adjustment Turrets (Elevation & Windage Knobs)
        const turretGeo = this.getGeo('cyl_0.025_0.025_0.06_8', () => new THREE.CylinderGeometry(0.025, 0.025, 0.06, 8));
        // Elevation (Top)
        const elevTurret = new THREE.Mesh(turretGeo, goldMat);
        elevTurret.position.set(0, 1.45, 0.1);
        group.add(elevTurret);

        // Windage (Side)
        const windTurret = new THREE.Mesh(turretGeo, goldMat);
        windTurret.rotation.z = Math.PI / 2;
        windTurret.position.set(0.06, 1.39, 0.1);
        group.add(windTurret);

        // Cyan Laser Sight Beam
        const laserGeo = this.getGeo('cyl_0.012_0.012_12_6', () => new THREE.CylinderGeometry(0.012, 0.012, 12.0, 6));
        const laserMat = this.getMaterial('cyan_laser_mat', () => new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.85 }));
        const laser = new THREE.Mesh(laserGeo, laserMat);
        laser.rotation.x = Math.PI / 2;
        laser.position.set(0.12, 1.39, 6.61);
        group.add(laser);

        // Curved Detachable High-Capacity Magazine
        const magGeo = this.getGeo('box_0.12_0.42_0.26', () => new THREE.BoxGeometry(0.12, 0.42, 0.26));
        const magMat = this.getMaterial('slate_mag', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85 }));
        const mag = new THREE.Mesh(magGeo, magMat);
        mag.rotation.x = 0.2; // Curved tilt
        mag.position.set(0, 0.94, -0.05);
        group.add(mag);

        // Skeletal Sniper Stock with Rubber Buttpad & Cheek Riser
        const stockGeo = this.getGeo('box_0.12_0.22_0.60', () => new THREE.BoxGeometry(0.12, 0.22, 0.60));
        const stock = new THREE.Mesh(stockGeo, carbonMat);
        stock.position.set(0, 1.15, -0.72);
        group.add(stock);

        const buttPadGeo = this.getGeo('box_0.13_0.26_0.08', () => new THREE.BoxGeometry(0.13, 0.26, 0.08));
        const buttPadMat = this.getMaterial('rubber_black', () => new THREE.MeshStandardMaterial({ color: 0x0f0f14, roughness: 0.9 }));
        const buttPad = new THREE.Mesh(buttPadGeo, buttPadMat);
        buttPad.position.set(0, 1.15, -1.04);
        group.add(buttPad);

        const cheekRiserGeo = this.getGeo('box_0.14_0.08_0.32', () => new THREE.BoxGeometry(0.14, 0.08, 0.32));
        const cheekRiser = new THREE.Mesh(cheekRiserGeo, buttPadMat);
        cheekRiser.position.set(0, 1.28, -0.65);
        group.add(cheekRiser);

        // Folding Tactical Bipod at front handguard
        const bipodJointGeo = this.getGeo('box_0.14_0.08_0.10', () => new THREE.BoxGeometry(0.14, 0.08, 0.10));
        const bipodJoint = new THREE.Mesh(bipodJointGeo, metalMat);
        bipodJoint.position.set(0, 1.10, 1.10);
        group.add(bipodJoint);

        const bipodLegGeo = this.getGeo('cyl_0.016_0.014_0.50_8', () => new THREE.CylinderGeometry(0.016, 0.014, 0.50, 8));
        const footGeo = this.getGeo('cyl_0.03_0.03_0.06_8', () => new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8));

        for (const side of [-1, 1]) {
          const bipodLeg = new THREE.Mesh(bipodLegGeo, metalMat);
          bipodLeg.position.set(side * 0.12, 0.88, 1.10);
          bipodLeg.rotation.z = side * 0.28;
          group.add(bipodLeg);

          const foot = new THREE.Mesh(footGeo, buttPadMat);
          foot.position.set(side * 0.19, 0.63, 1.10);
          group.add(foot);
        }

        break;
      }

      case 'drone': {
        // ДРОН: Flying Hyrax strapped into high-tech quadcopter drone frame with cute face, paws, detailed propellers & brass ammo belt

        // Materials
        const creamFurMat = this.getMaterial('cream_fur', () => new THREE.MeshStandardMaterial({ color: 0xebdbbe, roughness: 0.75, metalness: 0.02 }));
        const noseMat = this.getMaterial('nose_black', () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.15 }));
        const pinkEarMat = this.getMaterial('ear_pink', () => new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.6 }));
        const darkEyeMat = this.getMaterial('dark_eye_shiny', () => new THREE.MeshStandardMaterial({ color: 0x0a0a0f, roughness: 0.05 }));
        const eyeGlintMat = this.getMaterial('eye_glint', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));
        const whiskerMat = this.getMaterial('whisker_dark', () => new THREE.MeshBasicMaterial({ color: 0x222222 }));
        const pawPadMat = this.getMaterial('paw_pad_pink', () => new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.5 }));
        const clawMat = this.getMaterial('claw_dark', () => new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.3, metalness: 0.5 }));
        const brassMat = this.getMaterial('brass_bullet', () => new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2, metalness: 0.95 }));
        const copperMat = this.getMaterial('copper_tip', () => new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.3, metalness: 0.90 }));
        const goggleLensMat = this.getMaterial('goggle_lens_yellow', () => new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.1, metalness: 0.9 }));

        // 1. Pilot Hyrax Body & Cream Belly Fur Patch
        const bodyGeo = this.getGeo('sph_0.36_14_14', () => new THREE.SphereGeometry(0.36, 14, 14));
        const body = new THREE.Mesh(bodyGeo, stdFurMat);
        body.position.set(0, 1.30, 0);
        body.castShadow = true;
        group.add(body);

        const chestGeo = this.getGeo('sph_0.25_10_10', () => new THREE.SphereGeometry(0.25, 10, 10));
        const chestFur = new THREE.Mesh(chestGeo, creamFurMat);
        chestFur.scale.set(0.9, 0.8, 1.2);
        chestFur.position.set(0, 1.22, 0.16);
        group.add(chestFur);

        // 2. Cute Face / Muzzle ("МОРДОЧКА")
        const headGeo = this.getGeo('sph_0.26_12_12', () => new THREE.SphereGeometry(0.26, 12, 12));
        const head = new THREE.Mesh(headGeo, stdFurMat);
        head.position.set(0, 1.34, 0.28);
        group.add(head);

        // Soft Snout / Muzzle cheeks
        const snoutGeo = this.getGeo('sph_0.13_10_10', () => new THREE.SphereGeometry(0.13, 10, 10));
        const snout = new THREE.Mesh(snoutGeo, creamFurMat);
        snout.scale.set(1.2, 0.85, 1.3);
        snout.position.set(0, 1.31, 0.48);
        group.add(snout);

        // Dark shiny Nose button
        const noseGeo = this.getGeo('sph_0.038_8_8', () => new THREE.SphereGeometry(0.038, 8, 8));
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.scale.set(1.2, 0.8, 1.0);
        nose.position.set(0, 1.35, 0.60);
        group.add(nose);

        // Dark Glass Eyes + Specular Glints
        const eyeGeo = this.getGeo('sph_0.048_10_10', () => new THREE.SphereGeometry(0.048, 10, 10));
        const glintGeo = this.getGeo('sph_0.016_6_6', () => new THREE.SphereGeometry(0.016, 6, 6));

        for (const ex of [-0.13, 0.13]) {
          const eye = new THREE.Mesh(eyeGeo, darkEyeMat);
          eye.position.set(ex, 1.39, 0.47);
          group.add(eye);

          const glint = new THREE.Mesh(glintGeo, eyeGlintMat);
          glint.position.set(ex + (ex > 0 ? -0.015 : 0.015), 1.405, 0.51);
          group.add(glint);
        }

        // Whiskers ("УСЫ")
        const whiskerGeo = this.getGeo('cyl_0.0025_0.001_0.24_4', () => new THREE.CylinderGeometry(0.0025, 0.001, 0.24, 4));
        for (const side of [-1, 1]) {
          for (let w = -1; w <= 1; w++) {
            const whisker = new THREE.Mesh(whiskerGeo, whiskerMat);
            whisker.rotation.z = Math.PI / 2 + side * 0.12;
            whisker.rotation.x = w * 0.16;
            whisker.position.set(side * 0.18, 1.31 + w * 0.02, 0.54);
            group.add(whisker);
          }
        }

        // Cute Ears with Pink Lining
        const earGeo = this.getGeo('cone_0.07_0.18_8', () => new THREE.ConeGeometry(0.07, 0.18, 8));
        const innerEarGeo = this.getGeo('cone_0.04_0.13_8', () => new THREE.ConeGeometry(0.04, 0.13, 8));

        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(earGeo, stdFurMat);
          ear.position.set(side * 0.18, 1.54, 0.26);
          ear.rotation.z = side * -0.30;
          group.add(ear);

          const innerEar = new THREE.Mesh(innerEarGeo, pinkEarMat);
          innerEar.position.set(side * 0.17, 1.53, 0.28);
          innerEar.rotation.z = side * -0.30;
          group.add(innerEar);
        }

        // Aviator Goggles resting on forehead
        const goggleFrameGeo = this.getGeo('torus_0.11_0.022_8_12', () => new THREE.TorusGeometry(0.11, 0.022, 8, 12));
        const lensGeo = this.getGeo('cyl_0.075_0.075_0.02_10', () => new THREE.CylinderGeometry(0.075, 0.075, 0.02, 10));

        for (const gx of [-0.11, 0.11]) {
          const goggleFrame = new THREE.Mesh(goggleFrameGeo, metalMat);
          goggleFrame.position.set(gx, 1.48, 0.38);
          group.add(goggleFrame);

          const goggleLens = new THREE.Mesh(lensGeo, goggleLensMat);
          goggleLens.rotation.x = Math.PI / 2;
          goggleLens.position.set(gx, 1.48, 0.39);
          group.add(goggleLens);
        }

        const strapGeo = this.getGeo('torus_0.26_0.018_6_16', () => new THREE.TorusGeometry(0.26, 0.018, 6, 16));
        const strap = new THREE.Mesh(strapGeo, carbonMat);
        strap.position.set(0, 1.46, 0.28);
        group.add(strap);

        // 3. Furry Paws ("ЛАПКИ")
        // Flight Control Bar under front paws
        const ctrlBarGeo = this.getGeo('cyl_0.02_0.02_0.42_8', () => new THREE.CylinderGeometry(0.02, 0.02, 0.42, 8));
        const ctrlBar = new THREE.Mesh(ctrlBarGeo, metalMat);
        ctrlBar.rotation.z = Math.PI / 2;
        ctrlBar.position.set(0, 1.15, 0.38);
        group.add(ctrlBar);

        const pawMainGeo = this.getGeo('box_0.10_0.05_0.12', () => new THREE.BoxGeometry(0.10, 0.05, 0.12));
        const toeGeo = this.getGeo('sph_0.028_8_8', () => new THREE.SphereGeometry(0.028, 8, 8));
        const clawGeo = this.getGeo('cone_0.012_0.035_6', () => new THREE.ConeGeometry(0.012, 0.035, 6));

        // Front Paws gripping controls
        for (const sx of [-0.15, 0.15]) {
          const legGeo = this.getGeo('cyl_0.055_0.045_0.22_8', () => new THREE.CylinderGeometry(0.055, 0.045, 0.22, 8));
          const leg = new THREE.Mesh(legGeo, stdFurMat);
          leg.position.set(sx, 1.20, 0.28);
          leg.rotation.x = 0.4;
          group.add(leg);

          const paw = new THREE.Mesh(pawMainGeo, creamFurMat);
          paw.position.set(sx, 1.15, 0.38);
          group.add(paw);

          const padUnder = new THREE.Mesh(pawMainGeo, pawPadMat);
          padUnder.scale.set(0.8, 0.3, 0.8);
          padUnder.position.set(sx, 1.13, 0.38);
          group.add(padUnder);

          for (let t = -1; t <= 1; t++) {
            const toe = new THREE.Mesh(toeGeo, creamFurMat);
            toe.position.set(sx + t * 0.03, 1.15, 0.43);
            group.add(toe);

            const claw = new THREE.Mesh(clawGeo, clawMat);
            claw.rotation.x = Math.PI / 2;
            claw.position.set(sx + t * 0.03, 1.14, 0.45);
            group.add(claw);
          }
        }

        // Back Paws resting on rear frame skids
        for (const sx of [-0.20, 0.20]) {
          const rearLegGeo = this.getGeo('cyl_0.06_0.05_0.24_8', () => new THREE.CylinderGeometry(0.06, 0.05, 0.24, 8));
          const leg = new THREE.Mesh(rearLegGeo, stdFurMat);
          leg.position.set(sx, 1.12, -0.18);
          leg.rotation.x = -0.3;
          group.add(leg);

          const paw = new THREE.Mesh(pawMainGeo, creamFurMat);
          paw.position.set(sx, 1.02, -0.25);
          group.add(paw);

          const padUnder = new THREE.Mesh(pawMainGeo, pawPadMat);
          padUnder.scale.set(0.8, 0.3, 0.8);
          padUnder.position.set(sx, 1.00, -0.25);
          group.add(padUnder);
        }

        // 4. Quadcopter Frame & Aerodynamic 3-Blade Propellers ("ПРОПЕЛЛЕРЫ")
        const frameRingGeo = this.getGeo('torus_0.64_0.04_10_20', () => new THREE.TorusGeometry(0.64, 0.04, 10, 20));
        const frameRing = new THREE.Mesh(frameRingGeo, carbonMat);
        frameRing.rotation.x = Math.PI / 2;
        frameRing.position.y = 1.30;
        group.add(frameRing);

        const rotorGuardGeo = this.getGeo('torus_0.30_0.025_8_16', () => new THREE.TorusGeometry(0.30, 0.025, 8, 16));
        const armGeo = this.getGeo('cyl_0.032_0.032_0.75_8', () => new THREE.CylinderGeometry(0.032, 0.032, 0.75, 8));
        const motorHousingGeo = this.getGeo('cyl_0.07_0.07_0.10_10', () => new THREE.CylinderGeometry(0.07, 0.07, 0.10, 10));
        const propBladeGeo = this.getGeo('box_0.26_0.012_0.045', () => new THREE.BoxGeometry(0.26, 0.012, 0.045));
        const bladeMat = this.getMaterial('rotor_blade_mat', () => new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.1 }));

        const positions = [
          [-0.62, 1.38, -0.42],
          [0.62, 1.38, -0.42],
          [-0.62, 1.38, 0.42],
          [0.62, 1.38, 0.42],
        ];

        for (let idx = 0; idx < positions.length; idx++) {
          const [px, py, pz] = positions[idx];

          // Structural Arm
          const arm = new THREE.Mesh(armGeo, carbonMat);
          arm.position.set(px * 0.5, py, pz * 0.5);
          group.add(arm);

          // Rotor Guard Duct Ring
          const guard = new THREE.Mesh(rotorGuardGeo, hazardMat);
          guard.rotation.x = Math.PI / 2;
          guard.position.set(px, py, pz);
          group.add(guard);

          // Brushless Motor Housing
          const motor = new THREE.Mesh(motorHousingGeo, metalMat);
          motor.position.set(px, py - 0.02, pz);
          group.add(motor);

          // 3-Blade Aerodynamic Propeller
          for (let b = 0; b < 3; b++) {
            const blade = new THREE.Mesh(propBladeGeo, bladeMat);
            const bAngle = (b / 3) * Math.PI * 2 + (idx * 0.5);
            blade.rotation.y = bAngle;
            blade.rotation.z = 0.15; // Aerodynamic pitch tilt
            blade.position.set(px + Math.cos(bAngle) * 0.13, py + 0.04, pz + Math.sin(bAngle) * 0.13);
            group.add(blade);
          }

          // Hub Cap Bullet Cone
          const hubCapGeo = this.getGeo('cone_0.045_0.08_8', () => new THREE.ConeGeometry(0.045, 0.08, 8));
          const hubCap = new THREE.Mesh(hubCapGeo, boltMat);
          hubCap.position.set(px, py + 0.06, pz);
          group.add(hubCap);

          // Navigation LED
          const ledMat = idx % 2 === 0 ? ledRedMat : ledGreenMat;
          const ledGeo = this.getGeo('sph_0.035_8_8', () => new THREE.SphereGeometry(0.035, 8, 8));
          const led = new THREE.Mesh(ledGeo, ledMat);
          led.position.set(px * 1.12, py + 0.03, pz * 1.12);
          group.add(led);
        }

        // 5. Dual Tactical Missile Rocket Pods & Loaded Micro-Rockets ("РАКЕТНЫЕ ПОДЫ И РАКЕТЫ")
        const podHousingGeo = this.getGeo('box_0.24_0.24_0.62', () => new THREE.BoxGeometry(0.24, 0.24, 0.62));
        const tubeGeo = this.getGeo('cyl_0.045_0.045_0.60_10', () => new THREE.CylinderGeometry(0.045, 0.045, 0.60, 10));

        // Rocket Materials
        const rocketBodyMat = this.getMaterial('rocket_body_olive', () => new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2 }));
        const warheadMat = this.getMaterial('rocket_warhead_red', () => new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2, metalness: 0.8 }));
        const warheadTipMat = this.getMaterial('warhead_crimson', () => new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.25, metalness: 0.6 }));
        const rocketFinMat = this.getMaterial('rocket_fin_dark', () => new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.9 }));

        const rocketBodyGeo = this.getGeo('cyl_0.038_0.038_0.45_8', () => new THREE.CylinderGeometry(0.038, 0.038, 0.45, 8));
        const rocketTipGeo = this.getGeo('cone_0.04_0.14_8', () => new THREE.ConeGeometry(0.04, 0.14, 8));
        const rocketFinGeo = this.getGeo('box_0.01_0.07_0.08', () => new THREE.BoxGeometry(0.01, 0.07, 0.08));

        // Pylon mounts under left and right arms
        const pylonGeo = this.getGeo('box_0.06_0.18_0.28', () => new THREE.BoxGeometry(0.06, 0.18, 0.28));

        for (const side of [-1, 1]) {
          const px = side * 0.38;
          const py = 1.02;

          // Underwing Mounting Pylon
          const pylon = new THREE.Mesh(pylonGeo, carbonMat);
          pylon.position.set(px, py + 0.12, 0.05);
          group.add(pylon);

          // Rocket Pod Outer Housing
          const podHousing = new THREE.Mesh(podHousingGeo, carbonMat);
          podHousing.position.set(px, py, 0.05);
          group.add(podHousing);

          // Front Pod Armor Plate / Faceplate
          const facePlateGeo = this.getGeo('box_0.25_0.25_0.04', () => new THREE.BoxGeometry(0.25, 0.25, 0.04));
          const facePlate = new THREE.Mesh(facePlateGeo, metalMat);
          facePlate.position.set(px, py, 0.36);
          group.add(facePlate);

          // Hazard Warning Stripes on side of Pod
          const stripeGeo = this.getGeo('box_0.26_0.05_0.18', () => new THREE.BoxGeometry(0.26, 0.05, 0.18));
          const stripe = new THREE.Mesh(stripeGeo, hazardMat);
          stripe.position.set(px, py, 0.05);
          group.add(stripe);

          // Rear Exhaust Heat Vent Plate
          const ventGeo = this.getGeo('cyl_0.09_0.09_0.04_10', () => new THREE.CylinderGeometry(0.09, 0.09, 0.04, 10));
          const vent = new THREE.Mesh(ventGeo, metalMat);
          vent.rotation.x = Math.PI / 2;
          vent.position.set(px, py, -0.27);
          group.add(vent);

          // 4 Launch Tubes & 4 Loaded Micro-Rockets ("РАКЕТКИ") inside each pod
          const tubeOffsets = [
            [-0.06, 0.06],
            [0.06, 0.06],
            [-0.06, -0.06],
            [0.06, -0.06],
          ];

          for (let t = 0; t < tubeOffsets.length; t++) {
            const [tx, ty] = tubeOffsets[t];
            const tubeX = px + tx;
            const tubeY = py + ty;

            // Launch Tube
            const tube = new THREE.Mesh(tubeGeo, metalMat);
            tube.rotation.x = Math.PI / 2;
            tube.position.set(tubeX, tubeY, 0.05);
            group.add(tube);

            // Loaded Micro-Rocket ("РАКЕТКА") sticking out of tube
            const rBody = new THREE.Mesh(rocketBodyGeo, rocketBodyMat);
            rBody.rotation.x = Math.PI / 2;
            rBody.position.set(tubeX, tubeY, 0.22);
            group.add(rBody);

            // Explosive Warhead Tip (Crimson/Orange Cone)
            const rTip = new THREE.Mesh(rocketTipGeo, t % 2 === 0 ? warheadTipMat : warheadMat);
            rTip.rotation.x = Math.PI / 2;
            rTip.position.set(tubeX, tubeY, 0.50);
            group.add(rTip);

            // Yellow Warning Band at Warhead Base
            const rRingGeo = this.getGeo('torus_0.04_0.008_6_10', () => new THREE.TorusGeometry(0.04, 0.008, 6, 10));
            const rRing = new THREE.Mesh(rRingGeo, hazardMat);
            rRing.position.set(tubeX, tubeY, 0.43);
            group.add(rRing);

            // 4 Tail Stabilizer Fins on rocket
            for (let f = 0; f < 4; f++) {
              const fin = new THREE.Mesh(rocketFinGeo, rocketFinMat);
              fin.rotation.z = (f * Math.PI) / 2;
              fin.position.set(tubeX, tubeY, 0.08);
              group.add(fin);
            }
          }
        }

        // Central Targeting & Guidance Sensor Pod under belly
        const sensorPodGeo = this.getGeo('sph_0.12_12_12', () => new THREE.SphereGeometry(0.12, 12, 12));
        const sensorPod = new THREE.Mesh(sensorPodGeo, carbonMat);
        sensorPod.position.set(0, 0.90, 0.15);
        group.add(sensorPod);

        // Glowing Laser Sensor Lens
        const sensorLensGeo = this.getGeo('sph_0.07_10_10', () => new THREE.SphereGeometry(0.07, 10, 10));
        const sensorLensMat = this.getMaterial('sensor_laser_red', () => new THREE.MeshBasicMaterial({ color: 0xff0033 }));
        const sensorLens = new THREE.Mesh(sensorLensGeo, sensorLensMat);
        sensorLens.position.set(0, 0.90, 0.24);
        group.add(sensorLens);

        break;
      }

      // --- CHAPTER 2: MOBS 5-8 ---
      case 'centipede': {
        // МНОГОНОЖКА (Centipede): Multi-segmented bio-cyber centipede featuring:
        // - Realistic 3-part jointed legs with paw pads & claws on each segment (лапки)
        // - Head with detailed Snout/Nose pad & nostrils (носик)
        // - Alert pointed Ears with inner ear shading (ушки)
        // - Large Bulging 3D Glossy Eyes with pupils & glint reflections (выпуклые глаза)
        // - Long sweeping jointed Antennae & Whiskers with glowing tip nodes (усики)

        const chitinMat = this.getMaterial('centipede_chitin', () => new THREE.MeshStandardMaterial({
          color: 0x1e1b2e,
          roughness: 0.25,
          metalness: 0.45,
        }));
        const bellyMat = this.getMaterial('centipede_belly', () => new THREE.MeshStandardMaterial({
          color: 0x312e81,
          roughness: 0.4,
        }));
        const jointGlowMat = this.getMaterial('centipede_joint_glow', () => new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          emissive: 0x0284c7,
          emissiveIntensity: 0.9,
          roughness: 0.2,
        }));
        const noseMat = this.getMaterial('centipede_nose', () => new THREE.MeshStandardMaterial({
          color: 0x27272a,
          roughness: 0.3,
          metalness: 0.2,
        }));
        const innerEarMat = this.getMaterial('centipede_inner_ear', () => new THREE.MeshStandardMaterial({
          color: 0xf472b6,
          roughness: 0.5,
        }));
        const eyeBulgeMat = this.getMaterial('centipede_eye_bulge', () => new THREE.MeshStandardMaterial({
          color: 0xd97706,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.9,
          roughness: 0.1,
        }));
        const pupilMat = this.getMaterial('centipede_pupil', () => new THREE.MeshStandardMaterial({
          color: 0x09090b,
          roughness: 0.05,
        }));
        const eyeGlintMat = this.getMaterial('centipede_eye_glint', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));
        const pawPadMat = this.getMaterial('centipede_paw_pad', () => new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.6,
        }));

        // 1. Multi-Segmented Body (7 Segments)
        const segCount = 7;
        const segWidth = 0.85;
        const segHeight = 0.55;
        const segDepth = 0.5;
        const segSpacing = 0.45;

        const segGeo = this.getGeo('box_0.85_0.55_0.5', () => new THREE.BoxGeometry(segWidth, segHeight, segDepth));
        const armorPlateGeo = this.getGeo('box_0.92_0.15_0.52', () => new THREE.BoxGeometry(segWidth + 0.07, 0.15, segDepth + 0.02));
        const spineSpikeGeo = this.getGeo('cone_0.06_0.3_8', () => new THREE.ConeGeometry(0.06, 0.3, 8));

        // Shared Leg Geometries
        const hipGeo = this.getGeo('sph_0.065_8_8', () => new THREE.SphereGeometry(0.065, 8, 8));
        const thighGeo = this.getGeo('cyl_0.06_0.05_0.44_8', () => new THREE.CylinderGeometry(0.06, 0.05, 0.44, 8));
        const kneeGeo = this.getGeo('sph_0.06_8_8', () => new THREE.SphereGeometry(0.06, 8, 8));
        const shinGeo = this.getGeo('cyl_0.05_0.038_0.48_8', () => new THREE.CylinderGeometry(0.05, 0.038, 0.48, 8));
        const pawGeo = this.getGeo('sph_0.08_10_10', () => new THREE.SphereGeometry(0.08, 10, 10));
        const clawTipGeo = this.getGeo('cone_0.025_0.12_6', () => new THREE.ConeGeometry(0.025, 0.12, 6));

        for (let i = 0; i < segCount; i++) {
          const zPos = 0.4 - i * segSpacing;
          const yPos = 0.45 + Math.sin(i * 0.8) * 0.05; // Gentle undulating crawling height

          // Segment Core Body
          const segMesh = new THREE.Mesh(segGeo, i % 2 === 0 ? chitinMat : bellyMat);
          segMesh.position.set(0, yPos, zPos);
          segMesh.castShadow = true;
          group.add(segMesh);

          // Top Chitinous Armor Carapace Plate
          const plate = new THREE.Mesh(armorPlateGeo, chitinMat);
          plate.position.set(0, yPos + segHeight / 2 + 0.06, zPos);
          group.add(plate);

          // Spine Spike
          const spine = new THREE.Mesh(spineSpikeGeo, jointGlowMat);
          spine.position.set(0, yPos + segHeight / 2 + 0.22, zPos);
          group.add(spine);

          // Glowing Joint Seam between segments
          if (i < segCount - 1) {
            const seamGeo = this.getGeo('box_0.75_0.45_0.08', () => new THREE.BoxGeometry(0.75, 0.45, 0.08));
            const seam = new THREE.Mesh(seamGeo, jointGlowMat);
            seam.position.set(0, yPos, zPos - segSpacing / 2);
            group.add(seam);
          }

          // --- REALISTIC SEAMLESSLY CONNECTED LEGS WITH PAWS (Лапки) ---
          for (const side of [-1, 1]) {
            const legPhase = (i * 0.6 + (side > 0 ? 0 : Math.PI)) % (Math.PI * 2);
            const legAngleOffset = Math.sin(legPhase) * 0.18; // Crawling stride offset

            // Root Leg Joint (Hip Socket attached directly inside body side wall)
            const legGroup = new THREE.Group();
            legGroup.position.set(side * (segWidth / 2 - 0.04), yPos - 0.02, zPos + legAngleOffset);

            // Hip Ball
            const hipBall = new THREE.Mesh(hipGeo, jointGlowMat);
            legGroup.add(hipBall);

            // Thigh (Upper Leg)
            const thighGroup = new THREE.Group();
            thighGroup.rotation.z = side * (Math.PI / 3.4); // Angled outward from body (+ for right, - for left)
            thighGroup.rotation.y = side * (0.2 + legAngleOffset);

            const thighMesh = new THREE.Mesh(thighGeo, chitinMat);
            thighMesh.position.y = -0.22; // Center of 0.44 cylinder
            thighGroup.add(thighMesh);

            // Knee Joint (At bottom of thigh)
            const kneeMesh = new THREE.Mesh(kneeGeo, jointGlowMat);
            kneeMesh.position.y = -0.44;
            thighGroup.add(kneeMesh);

            // Shin (Lower Leg) attached directly to Knee
            const shinGroup = new THREE.Group();
            shinGroup.position.set(0, -0.44, 0);
            shinGroup.rotation.z = side * (-Math.PI / 2.3); // Bends downward toward floor (- for right, + for left)

            const shinMesh = new THREE.Mesh(shinGeo, chitinMat);
            shinMesh.position.y = -0.24; // Center of 0.48 cylinder
            shinGroup.add(shinMesh);

            // Paw Foot & Claws (Лапка) attached directly to end of Shin
            const pawGroup = new THREE.Group();
            pawGroup.position.set(0, -0.48, 0);

            const pawMesh = new THREE.Mesh(pawGeo, pawPadMat);
            pawGroup.add(pawMesh);

            for (let c = -1; c <= 1; c++) {
              const claw = new THREE.Mesh(clawTipGeo, chitinMat);
              claw.position.set(c * 0.032, -0.04, 0.04);
              claw.rotation.x = Math.PI / 2.2;
              pawGroup.add(claw);
            }

            shinGroup.add(pawGroup);
            thighGroup.add(shinGroup);
            legGroup.add(thighGroup);
            group.add(legGroup);
          }
        }

        // 2. HEAD ASSEMBLY (Front at Z = 0.85)
        const headZ = 0.85;
        const headY = 0.62;

        const headBaseGeo = this.getGeo('sph_0.42_16_16', () => new THREE.SphereGeometry(0.42, 16, 16));
        const headBase = new THREE.Mesh(headBaseGeo, chitinMat);
        headBase.position.set(0, headY, headZ);
        headBase.castShadow = true;
        group.add(headBase);

        // --- SNOUT & NOSE (Носик) ---
        const snoutGeo = this.getGeo('box_0.28_0.22_0.32', () => new THREE.BoxGeometry(0.28, 0.22, 0.32));
        const snout = new THREE.Mesh(snoutGeo, chitinMat);
        snout.position.set(0, headY - 0.06, headZ + 0.32);
        group.add(snout);

        // Nose Pad (Носик)
        const nosePadGeo = this.getGeo('sph_0.07_10_10', () => new THREE.SphereGeometry(0.07, 10, 10));
        const nosePad = new THREE.Mesh(nosePadGeo, noseMat);
        nosePad.position.set(0, headY - 0.04, headZ + 0.48);
        nosePad.scale.set(1.4, 0.9, 1.0);
        group.add(nosePad);

        // Nostril dots
        const nostrilGeo = this.getGeo('sph_0.018_6_6', () => new THREE.SphereGeometry(0.018, 6, 6));
        for (const side of [-1, 1]) {
          const nostril = new THREE.Mesh(nostrilGeo, pupilMat);
          nostril.position.set(side * 0.035, headY - 0.05, headZ + 0.54);
          group.add(nostril);
        }

        // --- POINTED EARS (Ушки) ---
        const earOuterGeo = this.getGeo('cone_0.08_0.32_8', () => new THREE.ConeGeometry(0.08, 0.32, 8));
        const earInnerGeo = this.getGeo('cone_0.055_0.24_8', () => new THREE.ConeGeometry(0.055, 0.24, 8));

        for (const side of [-1, 1]) {
          // Outer Ear Shell
          const earOuter = new THREE.Mesh(earOuterGeo, chitinMat);
          earOuter.position.set(side * 0.28, headY + 0.36, headZ - 0.05);
          earOuter.rotation.z = side * -0.35;
          earOuter.rotation.x = -0.2;
          group.add(earOuter);

          // Inner Ear Shading (Ушки)
          const earInner = new THREE.Mesh(earInnerGeo, innerEarMat);
          earInner.position.set(side * 0.27, headY + 0.36, headZ - 0.03);
          earInner.rotation.z = side * -0.35;
          earInner.rotation.x = -0.2;
          group.add(earInner);
        }

        // --- BULGING EYES (Выпуклые глаза) ---
        const eyeSocketGeo = this.getGeo('sph_0.16_12_12', () => new THREE.SphereGeometry(0.16, 12, 12));
        const eyeBulgeGeo = this.getGeo('sph_0.14_14_14', () => new THREE.SphereGeometry(0.14, 14, 14));
        const pupilEyeGeo = this.getGeo('sph_0.07_10_10', () => new THREE.SphereGeometry(0.07, 10, 10));
        const glintGeo = this.getGeo('sph_0.028_6_6', () => new THREE.SphereGeometry(0.028, 6, 6));

        for (const side of [-1, 1]) {
          // Socket rim
          const socket = new THREE.Mesh(eyeSocketGeo, chitinMat);
          socket.position.set(side * 0.28, headY + 0.1, headZ + 0.2);
          group.add(socket);

          // Bulging Eye Orb
          const eyeOrb = new THREE.Mesh(eyeBulgeGeo, eyeBulgeMat);
          eyeOrb.position.set(side * 0.34, headY + 0.12, headZ + 0.24);
          group.add(eyeOrb);

          // Pupil
          const pupil = new THREE.Mesh(pupilEyeGeo, pupilMat);
          pupil.position.set(side * 0.38, headY + 0.13, headZ + 0.32);
          group.add(pupil);

          // Glint Highlight
          const glint = new THREE.Mesh(glintGeo, eyeGlintMat);
          glint.position.set(side * 0.36 + 0.02, headY + 0.17, headZ + 0.36);
          group.add(glint);
        }

        // --- ANTENNAE & WHISKERS (Усики) ---
        // 1. Long Sweeping Jointed Antennae
        const nodeGeo = this.getGeo('sph_0.035_8_8', () => new THREE.SphereGeometry(0.035, 8, 8));
        const antennaSegmentGeo = this.getGeo('cyl_0.02_0.015_0.22_6', () => new THREE.CylinderGeometry(0.02, 0.015, 0.22, 6));

        for (const side of [-1, 1]) {
          let currX = side * 0.12;
          let currY = headY + 0.22;
          let currZ = headZ + 0.35;

          for (let a = 0; a < 5; a++) {
            const node = new THREE.Mesh(nodeGeo, a === 4 ? jointGlowMat : chitinMat);
            node.position.set(currX, currY, currZ);
            group.add(node);

            const nextX = currX + side * 0.12;
            const nextY = currY + 0.10 + a * 0.03;
            const nextZ = currZ + 0.15 - a * 0.02;

            const segLink = new THREE.Mesh(antennaSegmentGeo, chitinMat);
            segLink.position.set((currX + nextX) / 2, (currY + nextY) / 2, (currZ + nextZ) / 2);

            const dirVec = new THREE.Vector3(nextX - currX, nextY - currY, nextZ - currZ);
            segLink.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirVec.normalize());
            group.add(segLink);

            currX = nextX;
            currY = nextY;
            currZ = nextZ;
          }
        }

        // 2. Snout Whiskers (Усики мордочки)
        const whiskerGeo = this.getGeo('cyl_0.008_0.004_0.35_6', () => new THREE.CylinderGeometry(0.008, 0.004, 0.35, 6));
        for (const side of [-1, 1]) {
          for (let w = 0; w < 3; w++) {
            const whisker = new THREE.Mesh(whiskerGeo, jointGlowMat);
            whisker.position.set(side * 0.22, headY - 0.08 + w * 0.04, headZ + 0.42);
            whisker.rotation.z = side * (-Math.PI / 2.5 - w * 0.15);
            whisker.rotation.y = side * 0.2;
            group.add(whisker);
          }
        }

        break;
      }

      case 'worm': {
        // ХИМИЧЕСКИЙ ДОМАН (Acid Doman): Hyrax quadruped beast body with doman_sniper paws/legs, cute face, normal eyes & whiskers, and realistic acid tank on back

        // Materials
        const creamFurMat = this.getMaterial('cream_fur', () => new THREE.MeshStandardMaterial({
          color: 0xebdbbe,
          roughness: 0.75,
          metalness: 0.02,
        }));
        const noseMat = this.getMaterial('nose_black', () => new THREE.MeshStandardMaterial({
          color: 0x111111,
          roughness: 0.15,
        }));
        const pinkEarMat = this.getMaterial('ear_pink', () => new THREE.MeshStandardMaterial({
          color: 0xf472b6,
          roughness: 0.6,
        }));
        const darkEyeMat = this.getMaterial('dark_eye_shiny', () => new THREE.MeshStandardMaterial({
          color: 0x0a0a0f,
          roughness: 0.05,
        }));
        const eyeGlintMat = this.getMaterial('eye_glint', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));
        const whiskerMat = this.getMaterial('whisker_dark', () => new THREE.MeshBasicMaterial({ color: 0x222222 }));
        const pawPadMat = this.getMaterial('paw_pad_pink', () => new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.5 }));
        const clawMat = this.getMaterial('claw_dark', () => new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.3, metalness: 0.5 }));

        // 1. Core Body & Chest Fur Patch
        const bodyGeo = this.getGeo('cap_0.38_0.72_12_16', () => {
          const g = new THREE.CapsuleGeometry(0.38, 0.72, 12, 16);
          g.rotateX(Math.PI / 2);
          return g;
        });
        const body = new THREE.Mesh(bodyGeo, stdFurMat);
        body.position.set(0, 0.52, 0);
        body.castShadow = true;
        group.add(body);

        // Cream Chest/Belly fur patch
        const chestGeo = this.getGeo('sph_0.28_10_10', () => new THREE.SphereGeometry(0.28, 10, 10));
        const chestFur = new THREE.Mesh(chestGeo, creamFurMat);
        chestFur.scale.set(0.9, 0.7, 1.3);
        chestFur.position.set(0, 0.42, 0.18);
        group.add(chestFur);

        // 2. Detailed Paws ("ЛАПКИ") as in Doman Sniper (3 Toe Digits & Pads)
        const legGeo = this.getGeo('cyl_0.065_0.055_0.38_8', () => new THREE.CylinderGeometry(0.065, 0.055, 0.38, 8));
        const pawMainGeo = this.getGeo('box_0.13_0.06_0.16', () => new THREE.BoxGeometry(0.13, 0.06, 0.16));
        const toeGeo = this.getGeo('sph_0.035_8_8', () => new THREE.SphereGeometry(0.035, 8, 8));
        const clawGeo = this.getGeo('cone_0.015_0.04_6', () => new THREE.ConeGeometry(0.015, 0.04, 6));

        for (const sx of [-0.28, 0.28]) {
          for (const sz of [-0.22, 0.28]) {
            // Upper leg / limb
            const leg = new THREE.Mesh(legGeo, stdFurMat);
            leg.position.set(sx, 0.19, sz);
            group.add(leg);

            // Main Paw Pad Base
            const pawBase = new THREE.Mesh(pawMainGeo, creamFurMat);
            pawBase.position.set(sx, 0.03, sz + 0.04);
            group.add(pawBase);

            // Paw underside pad
            const padUnder = new THREE.Mesh(pawMainGeo, pawPadMat);
            padUnder.scale.set(0.8, 0.3, 0.8);
            padUnder.position.set(sx, 0.005, sz + 0.04);
            group.add(padUnder);

            // 3 Individual Toe Digits with claws
            for (let t = -1; t <= 1; t++) {
              const toeX = sx + t * 0.04;
              const toeZ = sz + 0.11;

              const toe = new THREE.Mesh(toeGeo, creamFurMat);
              toe.position.set(toeX, 0.035, toeZ);
              group.add(toe);

              const claw = new THREE.Mesh(clawGeo, clawMat);
              claw.rotation.x = Math.PI / 2 + 0.2;
              claw.position.set(toeX, 0.025, toeZ + 0.03);
              group.add(claw);
            }
          }
        }

        // 3. Cute Face / Muzzle ("МОРДОЧКА")
        const headGeo = this.getGeo('sph_0.32_14_14', () => new THREE.SphereGeometry(0.32, 14, 14));
        const head = new THREE.Mesh(headGeo, stdFurMat);
        head.position.set(0, 0.72, 0.45);
        head.castShadow = true;
        group.add(head);

        // Soft Snout / Muzzle cheeks
        const snoutGeo = this.getGeo('sph_0.15_12_12', () => new THREE.SphereGeometry(0.15, 12, 12));
        const snout = new THREE.Mesh(snoutGeo, creamFurMat);
        snout.scale.set(1.3, 0.85, 1.4);
        snout.position.set(0, 0.68, 0.70);
        group.add(snout);

        // Dark shiny Nose button
        const noseGeo = this.getGeo('sph_0.045_8_8', () => new THREE.SphereGeometry(0.045, 8, 8));
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.scale.set(1.2, 0.8, 1.0);
        nose.position.set(0, 0.72, 0.84);
        group.add(nose);

        // Normal Shiny Eyes + Specular Glints
        const eyeGeo = this.getGeo('sph_0.055_10_10', () => new THREE.SphereGeometry(0.055, 10, 10));
        const glintGeo = this.getGeo('sph_0.018_6_6', () => new THREE.SphereGeometry(0.018, 6, 6));

        for (const ex of [-0.15, 0.15]) {
          const eye = new THREE.Mesh(eyeGeo, darkEyeMat);
          eye.position.set(ex, 0.77, 0.68);
          group.add(eye);

          // Specular Glint
          const glint = new THREE.Mesh(glintGeo, eyeGlintMat);
          glint.position.set(ex + (ex > 0 ? -0.018 : 0.018), 0.785, 0.725);
          group.add(glint);
        }

        // Whiskers ("УСЫ")
        const whiskerGeo = this.getGeo('cyl_0.003_0.001_0.28_4', () => new THREE.CylinderGeometry(0.003, 0.001, 0.28, 4));
        for (const side of [-1, 1]) {
          for (let w = -1; w <= 1; w++) {
            const whisker = new THREE.Mesh(whiskerGeo, whiskerMat);
            whisker.rotation.z = Math.PI / 2 + side * 0.12;
            whisker.rotation.x = w * 0.18;
            whisker.position.set(side * 0.22, 0.68 + w * 0.025, 0.76);
            group.add(whisker);
          }
        }

        // Cute Ears with Pink Lining
        const earGeo = this.getGeo('cone_0.085_0.22_8', () => new THREE.ConeGeometry(0.085, 0.22, 8));
        const innerEarGeo = this.getGeo('cone_0.05_0.16_8', () => new THREE.ConeGeometry(0.05, 0.16, 8));

        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(earGeo, stdFurMat);
          ear.position.set(side * 0.22, 0.98, 0.42);
          ear.rotation.z = side * -0.32;
          group.add(ear);

          const innerEar = new THREE.Mesh(innerEarGeo, pinkEarMat);
          innerEar.position.set(side * 0.21, 0.98, 0.43);
          innerEar.rotation.z = side * -0.32;
          group.add(innerEar);
        }

        // --- 4. REALISTIC MULTI-LAYER ACID CANISTER (Реалистичный кислотный бак) ---
        const tankX = 0;
        const tankY = 1.10;
        const tankZ = -0.15;

        // Inner Glowing Toxic Liquid Core
        const acidCoreGeo = this.getGeo('cyl_0.28_0.28_0.72_16', () => new THREE.CylinderGeometry(0.28, 0.28, 0.72, 16));
        const acidCoreMat = this.getMaterial('acid_green_core', () => new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x10b981,
          emissiveIntensity: 1.2,
          roughness: 0.1,
        }));
        const acidCore = new THREE.Mesh(acidCoreGeo, acidCoreMat);
        acidCore.position.set(tankX, tankY, tankZ);
        group.add(acidCore);

        // Floating Mutagen Bubbles
        const bubbleGeo = this.getGeo('sph_0.04_8_8', () => new THREE.SphereGeometry(0.04, 8, 8));
        const bubbleMat = this.getMaterial('acid_bubble_glow', () => new THREE.MeshBasicMaterial({ color: 0xa7f3d0 }));
        const bubbleOffsets = [
          { x: 0.10, y: 0.15, z: 0.08 },
          { x: -0.12, y: -0.10, z: -0.06 },
          { x: 0.05, y: -0.22, z: 0.10 },
          { x: -0.08, y: 0.24, z: -0.05 },
        ];
        for (const b of bubbleOffsets) {
          const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
          bubble.position.set(tankX + b.x, tankY + b.y, tankZ + b.z);
          group.add(bubble);
        }

        // Translucent Glass Cylinder Container
        const glassGeo = this.getGeo('cyl_0.32_0.32_0.78_16', () => new THREE.CylinderGeometry(0.32, 0.32, 0.78, 16));
        const glassMat = this.getMaterial('acid_container_glass', () => new THREE.MeshStandardMaterial({
          color: 0x6ee7b7,
          roughness: 0.05,
          metalness: 0.1,
          transparent: true,
          opacity: 0.42,
        }));
        const glassTank = new THREE.Mesh(glassGeo, glassMat);
        glassTank.position.set(tankX, tankY, tankZ);
        group.add(glassTank);

        // Steel Frame Cage & Caps
        const capMat = this.getMaterial('dark_slate_cap', () => new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.85, roughness: 0.2 }));
        const capGeo = this.getGeo('cyl_0.35_0.35_0.10_16', () => new THREE.CylinderGeometry(0.35, 0.35, 0.10, 16));

        const capTop = new THREE.Mesh(capGeo, capMat);
        capTop.position.set(tankX, tankY + 0.42, tankZ);

        const capBot = new THREE.Mesh(capGeo, capMat);
        capBot.position.set(tankX, tankY - 0.42, tankZ);

        group.add(capTop, capBot);

        // 4 Vertical Steel Cage Struts
        const strutGeo = this.getGeo('cyl_0.02_0.02_0.82_8', () => new THREE.CylinderGeometry(0.02, 0.02, 0.82, 8));
        for (let a = 0; a < 4; a++) {
          const angle = (a * Math.PI) / 2 + Math.PI / 4;
          const strut = new THREE.Mesh(strutGeo, capMat);
          strut.position.set(
            tankX + Math.cos(angle) * 0.34,
            tankY,
            tankZ + Math.sin(angle) * 0.34
          );
          group.add(strut);
        }

        // Pressure Gauge / Manometer Dial on Top Cap
        const gaugeBaseGeo = this.getGeo('cyl_0.08_0.08_0.04_12', () => new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12));
        const gaugeFaceGeo = this.getGeo('cyl_0.065_0.065_0.01_12', () => new THREE.CylinderGeometry(0.065, 0.065, 0.01, 12));
        const gaugeFaceMat = this.getMaterial('gauge_face_white', () => new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 }));

        const gaugeBase = new THREE.Mesh(gaugeBaseGeo, capMat);
        gaugeBase.position.set(tankX, tankY + 0.48, tankZ + 0.20);
        gaugeBase.rotation.x = Math.PI / 3;
        group.add(gaugeBase);

        const gaugeFace = new THREE.Mesh(gaugeFaceGeo, gaugeFaceMat);
        gaugeFace.position.set(tankX, tankY + 0.49, tankZ + 0.21);
        gaugeFace.rotation.x = Math.PI / 3;
        group.add(gaugeFace);

        // Needles / Warning Indicator
        const needleGeo = this.getGeo('box_0.01_0.05_0.01', () => new THREE.BoxGeometry(0.01, 0.05, 0.01));
        const needleMat = this.getMaterial('needle_red', () => new THREE.MeshBasicMaterial({ color: 0xef4444 }));
        const needle = new THREE.Mesh(needleGeo, needleMat);
        needle.position.set(tankX + 0.01, tankY + 0.50, tankZ + 0.215);
        needle.rotation.z = -Math.PI / 4;
        group.add(needle);

        // Brass Top Turn Valve Wheel
        const valveGeo = this.getGeo('torus_0.08_0.018_8_16', () => new THREE.TorusGeometry(0.08, 0.018, 8, 16));
        const brassMat = this.getMaterial('brass_valve', () => new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.2 }));
        const valveWheel = new THREE.Mesh(valveGeo, brassMat);
        valveWheel.position.set(tankX, tankY + 0.51, tankZ);
        valveWheel.rotation.x = Math.PI / 2;
        group.add(valveWheel);

        // --- 5. SMALL GREY SHOULDER CANNON WITH GREEN MICRO TANK (Маленькая серая пушка с микро-баком) ---
        const cannonGroup = new THREE.Group();
        cannonGroup.position.set(-0.30, 0.80, 0.36); // Mounted forward on shoulder
        cannonGroup.rotation.y = 0.08; // Pointing forward
        cannonGroup.rotation.x = -0.05;

        // Dark grey metal & green acid materials
        const cannonMetalMat = this.getMaterial('cannon_grey_metal', () => new THREE.MeshStandardMaterial({
          color: 0x475569, // Grey slate metal
          metalness: 0.8,
          roughness: 0.35,
        }));
        const cannonDarkMat = this.getMaterial('cannon_dark_steel', () => new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          metalness: 0.9,
          roughness: 0.25,
        }));
        const microTankGreenMat = this.getMaterial('micro_acid_green', () => new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x10b981,
          emissiveIntensity: 1.5,
          roughness: 0.1,
        }));

        // Shoulder Mount / Base Plate
        const mountGeo = this.getGeo('box_0.12_0.06_0.14', () => new THREE.BoxGeometry(0.12, 0.06, 0.14));
        const mount = new THREE.Mesh(mountGeo, cannonDarkMat);
        mount.position.set(0, 0, 0);
        cannonGroup.add(mount);

        // Cannon Receiver / Body
        const receiverGeo = this.getGeo('box_0.08_0.08_0.16', () => new THREE.BoxGeometry(0.08, 0.08, 0.16));
        const receiver = new THREE.Mesh(receiverGeo, cannonMetalMat);
        receiver.position.set(0, 0.06, 0.02);
        cannonGroup.add(receiver);

        // Cannon Barrel (pointing forward)
        const barrelGeo = this.getGeo('cyl_0.032_0.028_0.28_10', () => new THREE.CylinderGeometry(0.032, 0.028, 0.28, 10));
        const barrel = new THREE.Mesh(barrelGeo, cannonMetalMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.06, 0.20);
        cannonGroup.add(barrel);

        // Muzzle Ring
        const muzzleGeo = this.getGeo('torus_0.035_0.008_6_12', () => new THREE.TorusGeometry(0.035, 0.008, 6, 12));
        const muzzle = new THREE.Mesh(muzzleGeo, cannonDarkMat);
        muzzle.position.set(0, 0.06, 0.34);
        cannonGroup.add(muzzle);

        // Muzzle Hole
        const muzzleHoleGeo = this.getGeo('cyl_0.022_0.022_0.02_8', () => new THREE.CylinderGeometry(0.022, 0.022, 0.02, 8));
        const muzzleHole = new THREE.Mesh(muzzleHoleGeo, cannonDarkMat);
        muzzleHole.rotation.x = Math.PI / 2;
        muzzleHole.position.set(0, 0.06, 0.345);
        cannonGroup.add(muzzleHole);

        // GREEN MICRO TANK mounted on top of cannon
        const microTankGeo = this.getGeo('cyl_0.038_0.038_0.12_10', () => new THREE.CylinderGeometry(0.038, 0.038, 0.12, 10));
        const microTank = new THREE.Mesh(microTankGeo, microTankGreenMat);
        microTank.position.set(0, 0.13, 0.02);
        cannonGroup.add(microTank);

        // Micro Tank Caps (Top & Bottom)
        const microCapGeo = this.getGeo('cyl_0.042_0.042_0.025_10', () => new THREE.CylinderGeometry(0.042, 0.042, 0.025, 10));
        const topCap = new THREE.Mesh(microCapGeo, cannonDarkMat);
        topCap.position.set(0, 0.19, 0.02);
        cannonGroup.add(topCap);

        const bottomCap = new THREE.Mesh(microCapGeo, cannonDarkMat);
        bottomCap.position.set(0, 0.07, 0.02);
        cannonGroup.add(bottomCap);

        // Small Green Feed Tube connecting micro tank to barrel
        const feedTubeGeo = this.getGeo('cyl_0.012_0.012_0.08_6', () => new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6));
        const feedTube = new THREE.Mesh(feedTubeGeo, microTankGreenMat);
        feedTube.rotation.x = Math.PI / 3;
        feedTube.position.set(0, 0.09, 0.09);
        cannonGroup.add(feedTube);

        group.add(cannonGroup);

        break;
      }

      case 'spider_spitter': {
        // ДОМАН-ПАУК (Spider Spitter): Hyrax beast body with realistic doman face (snout, nose, ears, whiskers), 8 glossy arachnid eyes, venom fangs, and 8 arched 3-segment spider legs
        const bodyGeo = this.getGeo('sph_0.48_16_16', () => new THREE.SphereGeometry(0.48, 16, 16));
        const body = new THREE.Mesh(bodyGeo, stdFurMat);
        body.position.set(0, 0.58, 0);
        body.castShadow = true;
        group.add(body);

        // Cream Chest / Abdomen Patch
        const creamFurMat = this.getMaterial('cream_fur', () => new THREE.MeshStandardMaterial({ color: 0xebdbbe, roughness: 0.75 }));
        const chestGeo = this.getGeo('sph_0.26_10_10', () => new THREE.SphereGeometry(0.26, 10, 10));
        const chest = new THREE.Mesh(chestGeo, creamFurMat);
        chest.scale.set(0.9, 0.7, 1.3);
        chest.position.set(0, 0.48, 0.18);
        group.add(chest);

        // 1. Head Base
        const headGeo = this.getGeo('sph_0.32_14_14', () => new THREE.SphereGeometry(0.32, 14, 14));
        const head = new THREE.Mesh(headGeo, stdFurMat);
        head.position.set(0, 0.72, 0.42);
        head.castShadow = true;
        group.add(head);

        // 2. Realistic Face (Muzzle, Nose, Ears, Whiskers) - Мордочка, Ушки, Носик
        const snoutGeo = this.getGeo('sph_0.14_12_12', () => new THREE.SphereGeometry(0.14, 12, 12));
        const snout = new THREE.Mesh(snoutGeo, creamFurMat);
        snout.scale.set(1.3, 0.85, 1.4);
        snout.position.set(0, 0.68, 0.67);
        group.add(snout);

        // Dark Shiny Nose button (Носик)
        const noseMat = this.getMaterial('nose_black', () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.15 }));
        const noseGeo = this.getGeo('sph_0.042_8_8', () => new THREE.SphereGeometry(0.042, 8, 8));
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.scale.set(1.2, 0.8, 1.0);
        nose.position.set(0, 0.72, 0.80);
        group.add(nose);

        // Cute Hyrax Ears with Pink Lining (Ушки)
        const earGeo = this.getGeo('cone_0.08_0.22_8', () => new THREE.ConeGeometry(0.08, 0.22, 8));
        const innerEarGeo = this.getGeo('cone_0.048_0.16_8', () => new THREE.ConeGeometry(0.048, 0.16, 8));
        const pinkEarMat = this.getMaterial('ear_pink', () => new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.6 }));

        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(earGeo, stdFurMat);
          ear.position.set(side * 0.22, 0.98, 0.40);
          ear.rotation.z = side * -0.32;
          ear.rotation.x = -0.15;
          group.add(ear);

          const innerEar = new THREE.Mesh(innerEarGeo, pinkEarMat);
          innerEar.position.set(side * 0.21, 0.98, 0.41);
          innerEar.rotation.z = side * -0.32;
          innerEar.rotation.x = -0.15;
          group.add(innerEar);
        }

        // Whiskers (Усики)
        const whiskerMat = this.getMaterial('whisker_dark', () => new THREE.MeshBasicMaterial({ color: 0x222222 }));
        const whiskerGeo = this.getGeo('cyl_0.003_0.001_0.28_4', () => new THREE.CylinderGeometry(0.003, 0.001, 0.28, 4));
        for (const side of [-1, 1]) {
          for (let w = -1; w <= 1; w++) {
            const whisker = new THREE.Mesh(whiskerGeo, whiskerMat);
            whisker.rotation.z = Math.PI / 2 + side * 0.12;
            whisker.rotation.x = w * 0.18;
            whisker.position.set(side * 0.20, 0.68 + w * 0.025, 0.72);
            group.add(whisker);
          }
        }

        // 3. Realistic Spider Eyes Cluster (8 Glossy Eyes) - Паучьи глаза
        const eyeMat = this.getMaterial('purple_spider_eye_gloss', () => new THREE.MeshStandardMaterial({
          color: 0x3b0764,
          emissive: 0xa855f7,
          emissiveIntensity: 0.8,
          roughness: 0.05,
          metalness: 0.8,
        }));
        const glintMat = this.getMaterial('eye_glint_white', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));

        // Eye positions (2 Main central, 2 upper, 2 lower, 2 lateral)
        const eyeDefs = [
          { x: -0.07, y: 0.81, z: 0.68, r: 0.048 }, // Main L
          { x: 0.07, y: 0.81, z: 0.68, r: 0.048 },  // Main R
          { x: -0.14, y: 0.84, z: 0.64, r: 0.038 }, // Upper L
          { x: 0.14, y: 0.84, z: 0.64, r: 0.038 },  // Upper R
          { x: -0.16, y: 0.77, z: 0.65, r: 0.035 }, // Lower L
          { x: 0.16, y: 0.77, z: 0.65, r: 0.035 },  // Lower R
          { x: -0.22, y: 0.81, z: 0.58, r: 0.030 }, // Far L
          { x: 0.22, y: 0.81, z: 0.58, r: 0.030 },  // Far R
        ];

        for (const ed of eyeDefs) {
          const eGeo = this.getGeo(`sph_${ed.r}_8_8`, () => new THREE.SphereGeometry(ed.r, 8, 8));
          const eyeMesh = new THREE.Mesh(eGeo, eyeMat);
          eyeMesh.position.set(ed.x, ed.y, ed.z);
          group.add(eyeMesh);

          // Specular glint dot
          const glintR = ed.r * 0.3;
          const gGeo = this.getGeo(`sph_${glintR.toFixed(3)}_6_6`, () => new THREE.SphereGeometry(glintR, 6, 6));
          const glint = new THREE.Mesh(gGeo, glintMat);
          glint.position.set(ed.x + 0.012, ed.y + 0.012, ed.z + ed.r * 0.85);
          group.add(glint);
        }

        // Venom Pedipalps / Fangs (Ядовитые клыки)
        const fangGeo = this.getGeo('cone_0.035_0.22_8', () => new THREE.ConeGeometry(0.035, 0.22, 8));
        const fangMat = this.getMaterial('dark_purple_fang', () => new THREE.MeshStandardMaterial({ color: 0x581c87, roughness: 0.1 }));
        for (const side of [-1, 1]) {
          const fang = new THREE.Mesh(fangGeo, fangMat);
          fang.position.set(side * 0.07, 0.58, 0.74);
          fang.rotation.x = Math.PI / 1.8;
          fang.rotation.z = side * -0.15;
          group.add(fang);
        }

        // 4. Authentic Arched 3-Segment Spider Legs (8 Паучьих лапок)
        const legSegmentMat = this.getMaterial('dark_metal_spider_leg', () => new THREE.MeshStandardMaterial({
          color: 0x111827,
          metalness: 0.8,
          roughness: 0.2,
        }));
        const legJointMat = this.getMaterial('purple_spider_joint', () => new THREE.MeshStandardMaterial({
          color: 0x7e22ce,
          metalness: 0.9,
          roughness: 0.1,
        }));

        const jointSphereGeo = this.getGeo('sph_0.045_8_8', () => new THREE.SphereGeometry(0.045, 8, 8));
        const clawTipGeo = this.getGeo('cone_0.02_0.08_6', () => new THREE.ConeGeometry(0.02, 0.08, 6));

        for (const side of [-1, 1]) {
          for (let l = 0; l < 4; l++) {
            // Leg origin along body side
            const bodyZ = (l - 1.5) * 0.22;
            const legAngleY = (l - 1.5) * 0.26; // Spread legs outward forward/backward

            const legGroup = new THREE.Group();
            legGroup.position.set(side * 0.28, 0.45, bodyZ);
            legGroup.rotation.y = side * legAngleY;

            // Segment 1: Coxa / Hip (short horizontal connector)
            const coxaGeo = this.getGeo('cyl_0.04_0.038_0.18_8', () => new THREE.CylinderGeometry(0.04, 0.038, 0.18, 8));
            const coxa = new THREE.Mesh(coxaGeo, legSegmentMat);
            coxa.rotation.z = -side * (Math.PI / 2.2);
            coxa.position.set(side * 0.09, 0, 0);
            legGroup.add(coxa);

            // Joint 1 (Hip socket)
            const j1 = new THREE.Mesh(jointSphereGeo, legJointMat);
            j1.position.set(side * 0.18, 0, 0);
            legGroup.add(j1);

            // Segment 2: Femur (High Spider Arch extending UP and OUT)
            const femurLen = 0.50;
            const femurGeo = this.getGeo(`cyl_0.038_0.030_${femurLen}_8`, () => new THREE.CylinderGeometry(0.038, 0.030, femurLen, 8));
            const femurGroup = new THREE.Group();
            femurGroup.position.copy(j1.position);
            femurGroup.rotation.z = -side * (Math.PI / 4); // 45 deg arch upwards

            const femurMesh = new THREE.Mesh(femurGeo, legSegmentMat);
            femurMesh.position.y = femurLen / 2;
            femurGroup.add(femurMesh);

            // Joint 2 (Knee at peak of arch)
            const j2 = new THREE.Mesh(jointSphereGeo, legJointMat);
            j2.position.set(0, femurLen, 0);
            femurGroup.add(j2);

            // Segment 3: Tibia / Tarsus (Extends DOWNWARDS to ground)
            const tibiaLen = 0.65;
            const tibiaGeo = this.getGeo(`cyl_0.028_0.012_${tibiaLen}_8`, () => new THREE.CylinderGeometry(0.028, 0.012, tibiaLen, 8));
            const tibiaGroup = new THREE.Group();
            tibiaGroup.position.copy(j2.position);
            tibiaGroup.rotation.z = -side * (Math.PI * 0.65); // Bends sharply down toward floor

            const tibiaMesh = new THREE.Mesh(tibiaGeo, legSegmentMat);
            tibiaMesh.position.y = tibiaLen / 2;
            tibiaGroup.add(tibiaMesh);

            // Sharp Claw Tip resting on floor
            const claw = new THREE.Mesh(clawTipGeo, legJointMat);
            claw.position.set(0, tibiaLen + 0.03, 0);
            claw.rotation.x = Math.PI;
            tibiaGroup.add(claw);

            femurGroup.add(tibiaGroup);
            legGroup.add(femurGroup);
            group.add(legGroup);
          }
        }
        break;
      }

      // --- CHAPTER 3: MOBS 9-12 ---
      case 'doman_miner': {
        // ШАХТЁР-НАДЗИРАТЕЛЬ: armoured mine warden - plate cuirass, miner hardhat with a
        // burning headlamp, heavy pickaxe and a riveted tower shield.
        const plateMat = this.getMaterial('mine_plate_steel', () => new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.3 }));
        const trimMat = this.getMaterial('mine_plate_dark', () => new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.35 }));
        const amberMat = this.getMaterial('amber_helmet', () => new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.65, roughness: 0.25 }));
        const lampMat = this.getMaterial('headlamp_yellow', () => new THREE.MeshBasicMaterial({ color: 0xfef08a }));
        const woodMat = this.getMaterial('solid_wood_handle', () => new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 }));
        const eyeMat = this.getMaterial('eye_dark_shine', () => new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.08 }));

        this.buildArmoredBiped(group, { furMat: stdFurMat, plateMat, trimMat, eyeMat, spiked: false });

        // Miner hardhat: dome, wide brim, ridge and the lamp assembly
        const helmet = new THREE.Mesh(this.getGeo('miner_helm_dome', () => new THREE.SphereGeometry(0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9)), amberMat);
        helmet.position.set(0, 1.86, 0.06);
        group.add(helmet);

        const brim = new THREE.Mesh(this.getGeo('miner_helm_brim', () => new THREE.CylinderGeometry(0.42, 0.42, 0.045, 16)), amberMat);
        brim.position.set(0, 1.84, 0.06);
        group.add(brim);

        const ridge = new THREE.Mesh(this.getGeo('miner_helm_ridge', () => new THREE.BoxGeometry(0.06, 0.1, 0.6)), trimMat);
        ridge.position.set(0, 2.02, 0.06);
        group.add(ridge);

        const lampBracket = new THREE.Mesh(this.getGeo('miner_lamp_bracket', () => new THREE.BoxGeometry(0.14, 0.1, 0.06)), trimMat);
        lampBracket.position.set(0, 1.94, 0.32);
        group.add(lampBracket);

        const lampHousing = new THREE.Mesh(this.getGeo('miner_lamp_housing', () => new THREE.CylinderGeometry(0.11, 0.13, 0.12, 14)), boltMat);
        lampHousing.rotation.x = Math.PI / 2;
        lampHousing.position.set(0, 1.94, 0.42);
        group.add(lampHousing);

        const lampLens = new THREE.Mesh(this.getGeo('miner_lamp_lens', () => new THREE.CylinderGeometry(0.095, 0.095, 0.04, 14)), lampMat);
        lampLens.rotation.x = Math.PI / 2;
        lampLens.position.set(0, 1.94, 0.49);
        group.add(lampLens);

        // Ears poking out under the brim
        const earGeo = this.getGeo('miner_ear', () => new THREE.SphereGeometry(0.1, 8, 8));
        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(earGeo, stdFurMat);
          ear.position.set(side * 0.29, 1.76, 0.0);
          ear.scale.set(0.5, 0.95, 0.8);
          group.add(ear);
        }

        // Heavy pickaxe in the right hand
        const pickGroup = new THREE.Group();
        pickGroup.position.set(0.62, 1.0, 0.24);
        pickGroup.rotation.set(-0.5, 0, -0.25);
        group.add(pickGroup);

        const handle = new THREE.Mesh(this.getGeo('pick_handle', () => new THREE.CylinderGeometry(0.038, 0.045, 1.3, 8)), woodMat);
        pickGroup.add(handle);

        const grip = new THREE.Mesh(this.getGeo('pick_grip', () => new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8)), trimMat);
        grip.position.y = -0.5;
        pickGroup.add(grip);

        const collar = new THREE.Mesh(this.getGeo('pick_collar', () => new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10)), metalMat);
        collar.position.y = 0.6;
        pickGroup.add(collar);

        const pickSpike = new THREE.Mesh(this.getGeo('pick_spike', () => new THREE.ConeGeometry(0.07, 0.6, 8)), metalMat);
        pickSpike.rotation.z = Math.PI / 2;
        pickSpike.position.set(0.34, 0.66, 0);
        pickGroup.add(pickSpike);

        const pickBlade = new THREE.Mesh(this.getGeo('pick_blade', () => new THREE.BoxGeometry(0.34, 0.12, 0.07)), metalMat);
        pickBlade.position.set(-0.2, 0.66, 0);
        pickGroup.add(pickBlade);

        // Riveted tower shield in the left hand
        const shieldGroup = new THREE.Group();
        shieldGroup.position.set(-0.66, 1.0, 0.4);
        shieldGroup.rotation.y = 0.22;
        group.add(shieldGroup);

        const shieldPlank = new THREE.Mesh(this.getGeo('shield_plank', () => new THREE.BoxGeometry(0.82, 1.28, 0.1)), woodMat);
        shieldGroup.add(shieldPlank);

        const frameHGeo = this.getGeo('shield_frame_h', () => new THREE.BoxGeometry(0.86, 0.09, 0.13));
        const frameVGeo = this.getGeo('shield_frame_v', () => new THREE.BoxGeometry(0.09, 1.32, 0.13));
        for (const fy of [-0.6, 0.6]) {
          const bar = new THREE.Mesh(frameHGeo, metalMat);
          bar.position.set(0, fy, 0);
          shieldGroup.add(bar);
        }
        for (const fx of [-0.37, 0.37]) {
          const bar = new THREE.Mesh(frameVGeo, metalMat);
          bar.position.set(fx, 0, 0);
          shieldGroup.add(bar);
        }

        const hazardBand = new THREE.Mesh(this.getGeo('shield_hazard', () => new THREE.BoxGeometry(0.8, 0.16, 0.12)), hazardMat);
        hazardBand.position.set(0, 0.24, 0);
        shieldGroup.add(hazardBand);

        const shieldBoss = new THREE.Mesh(this.getGeo('shield_boss', () => new THREE.SphereGeometry(0.15, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2)), metalMat);
        shieldBoss.rotation.x = -Math.PI / 2;
        shieldBoss.position.set(0, -0.12, 0.08);
        shieldGroup.add(shieldBoss);

        const shieldRivetGeo = this.getGeo('bolt_022', () => new THREE.SphereGeometry(0.022, 8, 8));
        for (const rx of [-0.37, 0.37]) {
          for (const ry of [-0.45, -0.15, 0.15, 0.45]) {
            const rivet = new THREE.Mesh(shieldRivetGeo, boltMat);
            rivet.position.set(rx, ry, 0.08);
            shieldGroup.add(rivet);
          }
        }

        const shieldLamp = new THREE.Mesh(this.getGeo('shield_lamp', () => new THREE.SphereGeometry(0.05, 8, 8)), lampMat);
        shieldLamp.position.set(0, 0.55, 0.09);
        shieldGroup.add(shieldLamp);

        // Tool pouches on the belt
        const pouchGeo = this.getGeo('miner_pouch', () => new THREE.BoxGeometry(0.16, 0.2, 0.12));
        const leatherMat = this.getMaterial('leather_strap', () => new THREE.MeshStandardMaterial({ color: 0x44281a, roughness: 0.85 }));
        for (const px of [-0.3, 0.28]) {
          const pouch = new THREE.Mesh(pouchGeo, leatherMat);
          pouch.position.set(px, 0.74, 0.34);
          group.add(pouch);
        }
        break;
      }


      case 'doman_dynamiter': {
        // ГРЕМУЧИЙ ДОМАН: pack-animal hyrax carrying a strapped dynamite bundle with a
        // burning fuse, plus scavenged fuel canisters.
        const eyeMat = this.getMaterial('eye_dark_shine', () => new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.08 }));
        const tuskMat = this.getMaterial('tusk_ivory', () => new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.35 }));

        this.buildHyraxQuadruped(group, {
          furMat: stdFurMat,
          eyeMat,
          bodyR: 0.42,
          bodyL: 0.78,
          bodyY: 0.72,
          headR: 0.3,
          headZ: 0.68,
          legLen: 0.62,
          tuskMat,
        });

        const tntMat = this.getMaterial('tnt_red_stick', () => new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.55 }));
        const capMat = this.getMaterial('tnt_cap_dark', () => new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.5 }));
        const fuseMat = this.getMaterial('fuse_cord', () => new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.8 }));
        const sparkMat = this.getMaterial('fuse_spark', () => new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
        const leatherMat = this.getMaterial('leather_strap', () => new THREE.MeshStandardMaterial({ color: 0x44281a, roughness: 0.85 }));
        const woodMat = this.getMaterial('solid_wood_handle', () => new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 }));

        // Wooden pack frame
        const frameGeo = this.getGeo('dyn_frame', () => new THREE.BoxGeometry(0.5, 0.06, 0.62));
        const frame = new THREE.Mesh(frameGeo, woodMat);
        frame.position.set(0, 1.06, -0.04);
        group.add(frame);

        // Two rows of four dynamite sticks
        const stickGeo = this.getGeo('dyn_stick', () => new THREE.CylinderGeometry(0.075, 0.075, 0.46, 10));
        const capGeo = this.getGeo('dyn_stick_cap', () => new THREE.CylinderGeometry(0.078, 0.078, 0.04, 10));
        const fuseGeo = this.getGeo('dyn_fuse', () => new THREE.CylinderGeometry(0.012, 0.012, 0.18, 5));
        for (let row = 0; row < 2; row++) {
          for (let i = 0; i < 4; i++) {
            const sx = -0.24 + i * 0.16;
            const sy = 1.2 + row * 0.15;
            const sz = -0.06 + row * 0.06;

            const stick = new THREE.Mesh(stickGeo, tntMat);
            stick.position.set(sx, sy, sz);
            group.add(stick);

            for (const cy of [-0.23, 0.23]) {
              const cap = new THREE.Mesh(capGeo, capMat);
              cap.position.set(sx, sy + cy, sz);
              group.add(cap);
            }

            const fuse = new THREE.Mesh(fuseGeo, fuseMat);
            fuse.position.set(sx, sy + 0.32, sz);
            fuse.rotation.z = (i - 1.5) * 0.12;
            group.add(fuse);
          }
        }

        // The one lit fuse: spark bead + flame tip
        const spark = new THREE.Mesh(this.getGeo('dyn_spark', () => new THREE.SphereGeometry(0.055, 8, 8)), sparkMat);
        spark.position.set(0.24, 1.72, 0.0);
        group.add(spark);
        const flame = new THREE.Mesh(this.getGeo('dyn_flame', () => new THREE.ConeGeometry(0.05, 0.16, 7)), sparkMat);
        flame.position.set(0.24, 1.82, 0.0);
        group.add(flame);

        // Leather harness straps around the barrel
        const strapGeo = this.getGeo('dyn_strap', () => new THREE.TorusGeometry(0.44, 0.035, 6, 16));
        for (const sz of [-0.2, 0.22]) {
          const strap = new THREE.Mesh(strapGeo, leatherMat);
          strap.position.set(0, 0.72, sz);
          strap.rotation.y = Math.PI / 2;
          group.add(strap);
        }

        // Scavenged fuel canister slung on the flank
        const canMat = this.getMaterial('fuel_canister', () => new THREE.MeshStandardMaterial({ color: 0x4d7c0f, metalness: 0.55, roughness: 0.4 }));
        const canister = new THREE.Mesh(this.getGeo('dyn_canister', () => new THREE.CylinderGeometry(0.11, 0.11, 0.34, 12)), canMat);
        canister.position.set(-0.46, 0.78, -0.2);
        canister.rotation.z = 0.3;
        group.add(canister);
        const valve = new THREE.Mesh(this.getGeo('dyn_valve', () => new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8)), metalMat);
        valve.position.set(-0.52, 0.95, -0.2);
        valve.rotation.z = 0.3;
        group.add(valve);

        // A single stick clenched in the jaws, fuse already burning
        const held = new THREE.Mesh(stickGeo, tntMat);
        held.rotation.z = Math.PI / 2;
        held.position.set(0.16, 0.86, 1.02);
        group.add(held);
        const heldSpark = new THREE.Mesh(this.getGeo('dyn_spark', () => new THREE.SphereGeometry(0.055, 8, 8)), sparkMat);
        heldSpark.position.set(0.44, 0.86, 1.02);
        group.add(heldSpark);
        break;
      }


      case 'doman_archer': {
        // ГЕОЛОГИЧЕСКИЙ ПАРАЗИТ: animated crystal parasite - a rubble golem shot through
        // with glowing lime crystal clusters, wrapped in a faint gas haze.
        const rockMat = this.getMaterial('solid_slate_rock', () => new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 }));
        const rockLightMat = this.getMaterial('rock_light_grey', () => new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.95 }));
        const crystalMat = this.getMaterial('solid_lime_crystal', () => new THREE.MeshStandardMaterial({
          color: 0x84cc16,
          emissive: 0x84cc16,
          emissiveIntensity: 1.1,
          roughness: 0.12,
        }));
        const coreMat = this.getMaterial('crystal_core_bright', () => new THREE.MeshBasicMaterial({ color: 0xbef264 }));
        const hazeMat = this.getMaterial('crystal_gas_haze', () => new THREE.MeshBasicMaterial({
          color: 0x84cc16,
          transparent: true,
          opacity: 0.09,
          depthWrite: false,
        }));

        // Rubble torso: three stacked irregular chunks
        const chunkBigGeo = this.getGeo('rock_chunk_big', () => new THREE.DodecahedronGeometry(0.46, 0));
        const chunkMidGeo = this.getGeo('rock_chunk_mid', () => new THREE.DodecahedronGeometry(0.3, 0));
        const chunkSmallGeo = this.getGeo('rock_chunk_small', () => new THREE.IcosahedronGeometry(0.16, 0));

        const hips = new THREE.Mesh(chunkBigGeo, rockMat);
        hips.position.set(0, 0.82, 0);
        hips.scale.set(1.15, 0.85, 1.0);
        group.add(hips);

        const chest = new THREE.Mesh(chunkBigGeo, rockLightMat);
        chest.position.set(0, 1.4, 0.02);
        chest.scale.set(1.25, 1.05, 1.1);
        chest.rotation.y = 0.6;
        group.add(chest);

        const shoulderRock = new THREE.Mesh(chunkMidGeo, rockMat);
        shoulderRock.position.set(0, 1.82, -0.04);
        shoulderRock.scale.set(1.5, 0.7, 1.1);
        group.add(shoulderRock);

        // Head chunk with crystal eyes
        const head = new THREE.Mesh(chunkMidGeo, rockLightMat);
        head.position.set(0, 2.12, 0.06);
        head.scale.set(0.95, 0.9, 0.95);
        head.rotation.set(0.3, 0.8, 0.1);
        group.add(head);

        const eyeGeo = this.getGeo('crystal_eye', () => new THREE.OctahedronGeometry(0.06, 0));
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(eyeGeo, coreMat);
          eye.position.set(side * 0.12, 2.16, 0.26);
          group.add(eye);
        }

        // Glowing core in the chest cavity + containment shards
        const core = new THREE.Mesh(this.getGeo('crystal_core', () => new THREE.OctahedronGeometry(0.2, 1)), coreMat);
        core.position.set(0, 1.42, 0.34);
        group.add(core);

        const shardGeo = this.getGeo('crystal_shard_small', () => new THREE.ConeGeometry(0.055, 0.2, 6));
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const shard = new THREE.Mesh(shardGeo, crystalMat);
          shard.position.set(Math.cos(a) * 0.26, 1.42 + Math.sin(a) * 0.24, 0.3);
          shard.rotation.z = -a;
          group.add(shard);
        }

        // Back cluster: tall crystal spires
        const spireGeo = this.getGeo('crystal_spire', () => new THREE.ConeGeometry(0.11, 0.72, 6));
        for (let i = 0; i < 7; i++) {
          const spire = new THREE.Mesh(spireGeo, crystalMat);
          const a = (i / 7) * Math.PI * 2;
          spire.position.set(Math.cos(a) * 0.34, 1.75 + (i % 3) * 0.16, -0.3 + Math.sin(a) * 0.12);
          spire.rotation.set(-0.5 + (i % 2) * 0.3, 0, Math.cos(a) * 0.6);
          spire.scale.setScalar(0.75 + (i % 3) * 0.25);
          group.add(spire);
        }

        // Arms: chunk chain ending in a boulder fist, crystal growths on the shoulders
        for (const side of [-1, 1]) {
          const shoulder = new THREE.Mesh(chunkMidGeo, rockMat);
          shoulder.position.set(side * 0.55, 1.66, 0);
          shoulder.scale.setScalar(0.85);
          group.add(shoulder);

          const upper = new THREE.Mesh(chunkMidGeo, rockLightMat);
          upper.position.set(side * 0.66, 1.28, 0.05);
          upper.scale.set(0.6, 0.85, 0.6);
          group.add(upper);

          const fist = new THREE.Mesh(chunkMidGeo, rockMat);
          fist.position.set(side * 0.72, 0.9, 0.16);
          fist.scale.setScalar(0.95);
          group.add(fist);

          for (let k = 0; k < 3; k++) {
            const growth = new THREE.Mesh(shardGeo, crystalMat);
            growth.position.set(side * (0.6 + k * 0.06), 1.72 + k * 0.1, 0.1 - k * 0.12);
            growth.rotation.z = side * (0.6 + k * 0.3);
            group.add(growth);
          }
        }

        // Legs on hip pivots so the golem lumbers when it walks
        for (const [name, sx] of [['leg_FL', -1], ['leg_FR', 1]] as const) {
          const hip = new THREE.Group();
          hip.name = name;
          hip.position.set(sx * 0.26, 0.74, 0);
          group.add(hip);

          const thigh = new THREE.Mesh(chunkMidGeo, rockMat);
          thigh.position.y = -0.22;
          thigh.scale.set(0.8, 0.95, 0.8);
          hip.add(thigh);

          const shin = new THREE.Mesh(chunkMidGeo, rockLightMat);
          shin.position.y = -0.5;
          shin.scale.set(0.65, 0.8, 0.65);
          hip.add(shin);

          const foot = new THREE.Mesh(chunkSmallGeo, rockMat);
          foot.position.set(0, -0.7, 0.1);
          foot.scale.set(1.4, 0.7, 1.6);
          hip.add(foot);

          const kneeCrystal = new THREE.Mesh(shardGeo, crystalMat);
          kneeCrystal.position.set(sx * 0.14, -0.34, 0.14);
          kneeCrystal.rotation.x = -0.9;
          hip.add(kneeCrystal);
        }

        // Loose rubble around the feet
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const rubble = new THREE.Mesh(chunkSmallGeo, rockLightMat);
          rubble.position.set(Math.cos(a) * 0.5, 0.12, Math.sin(a) * 0.42);
          rubble.scale.setScalar(0.5 + (i % 3) * 0.2);
          rubble.rotation.set(i, i * 0.7, i * 0.3);
          group.add(rubble);
        }

        // Faint drug-gas haze it hides inside
        const hazeGeo = this.getGeo('crystal_haze', () => new THREE.SphereGeometry(0.62, 10, 8));
        for (const [hy, hs] of [[0.7, 1.0], [1.35, 0.85]] as const) {
          const haze = new THREE.Mesh(hazeGeo, hazeMat);
          haze.position.set(0, hy, 0);
          haze.scale.setScalar(hs);
          group.add(haze);
        }
        break;
      }


      // --- CHAPTER 4: MOBS 13-16 ---
      case 'imp_doman': {
        // АДСКИЙ ПРЕТОРИАНЕЦ: heavy legion commander - blackened spiked plate, horned helm,
        // burning sword and a bone-crested shield.
        const demonArmorMat = this.getMaterial('demon_armor_solid', () => new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.25, metalness: 0.85 }));
        const obsidianMat = this.getMaterial('obsidian_horn', () => new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.2 }));
        const emberEyeMat = this.getMaterial('ember_eye_glow', () => new THREE.MeshBasicMaterial({ color: 0xff2200 }));
        const boneMat = this.getMaterial('bone_pale', () => new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.7 }));
        const flameMat = this.getMaterial('flame_blade_mat', () => new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xff2200,
          emissiveIntensity: 1.4,
        }));
        const flameWispMat = this.getMaterial('flame_wisp', () => new THREE.MeshBasicMaterial({ color: 0xff7a18 }));

        this.buildArmoredBiped(group, {
          furMat: darkFurMat,
          plateMat: demonArmorMat,
          trimMat: obsidianMat,
          eyeMat: emberEyeMat,
          spiked: true,
        });

        // Horned helm with a glowing visor slit
        const helm = new THREE.Mesh(this.getGeo('imp_helm', () => new THREE.BoxGeometry(0.56, 0.5, 0.56)), demonArmorMat);
        helm.position.set(0, 1.9, 0.04);
        group.add(helm);

        const faceplate = new THREE.Mesh(this.getGeo('imp_faceplate', () => new THREE.BoxGeometry(0.42, 0.3, 0.12)), obsidianMat);
        faceplate.position.set(0, 1.84, 0.3);
        group.add(faceplate);

        const visor = new THREE.Mesh(this.getGeo('imp_visor', () => new THREE.BoxGeometry(0.34, 0.05, 0.04)), emberEyeMat);
        visor.position.set(0, 1.88, 0.37);
        group.add(visor);

        const crest = new THREE.Mesh(this.getGeo('imp_crest', () => new THREE.BoxGeometry(0.07, 0.2, 0.5)), obsidianMat);
        crest.position.set(0, 2.16, 0.02);
        group.add(crest);

        // Great curved horns (two segments each so they arc)
        const hornBaseGeo = this.getGeo('imp_horn_base', () => new THREE.ConeGeometry(0.1, 0.42, 8));
        const hornTipGeo = this.getGeo('imp_horn_tip', () => new THREE.ConeGeometry(0.055, 0.34, 8));
        for (const side of [-1, 1]) {
          const hornBase = new THREE.Mesh(hornBaseGeo, obsidianMat);
          hornBase.position.set(side * 0.3, 2.08, 0.04);
          hornBase.rotation.z = -side * 0.6;
          group.add(hornBase);

          const hornTip = new THREE.Mesh(hornTipGeo, obsidianMat);
          hornTip.position.set(side * 0.52, 2.28, 0.04);
          hornTip.rotation.z = -side * 1.05;
          group.add(hornTip);
        }

        // Tattered legion cape
        const capeGeo = this.getGeo('imp_cape', () => new THREE.BoxGeometry(0.24, 0.72, 0.05));
        for (let i = -1; i <= 1; i++) {
          const strip = new THREE.Mesh(capeGeo, obsidianMat);
          strip.position.set(i * 0.22, 1.06 - Math.abs(i) * 0.08, -0.36);
          strip.rotation.x = -0.12;
          strip.rotation.z = i * 0.08;
          group.add(strip);
        }

        // Burning sword in the right hand
        const swordGroup = new THREE.Group();
        swordGroup.position.set(0.66, 1.06, 0.34);
        swordGroup.rotation.set(-0.5, 0, -0.2);
        group.add(swordGroup);

        const grip = new THREE.Mesh(this.getGeo('imp_sword_grip', () => new THREE.CylinderGeometry(0.045, 0.05, 0.3, 8)), obsidianMat);
        grip.position.y = -0.2;
        swordGroup.add(grip);

        const pommel = new THREE.Mesh(this.getGeo('imp_sword_pommel', () => new THREE.SphereGeometry(0.07, 8, 8)), demonArmorMat);
        pommel.position.y = -0.38;
        swordGroup.add(pommel);

        const guard = new THREE.Mesh(this.getGeo('imp_sword_guard', () => new THREE.BoxGeometry(0.42, 0.08, 0.12)), demonArmorMat);
        guard.position.y = -0.02;
        swordGroup.add(guard);

        const blade = new THREE.Mesh(this.getGeo('imp_sword_blade', () => new THREE.BoxGeometry(0.13, 1.35, 0.06)), obsidianMat);
        blade.position.y = 0.68;
        swordGroup.add(blade);

        const edgeGeo = this.getGeo('imp_sword_edge', () => new THREE.BoxGeometry(0.045, 1.3, 0.08));
        for (const ex of [-0.075, 0.075]) {
          const edge = new THREE.Mesh(edgeGeo, flameMat);
          edge.position.set(ex, 0.68, 0);
          swordGroup.add(edge);
        }

        const wispGeo = this.getGeo('imp_flame_wisp', () => new THREE.ConeGeometry(0.07, 0.3, 6));
        for (let i = 0; i < 4; i++) {
          const wisp = new THREE.Mesh(wispGeo, flameWispMat);
          wisp.position.set((i % 2 ? 0.1 : -0.1), 0.35 + i * 0.3, 0);
          wisp.rotation.z = (i % 2 ? 0.3 : -0.3);
          wisp.scale.setScalar(1.0 - i * 0.12);
          swordGroup.add(wisp);
        }

        // Bone-crested shield in the left hand
        const shieldGroup = new THREE.Group();
        shieldGroup.position.set(-0.7, 1.02, 0.42);
        shieldGroup.rotation.y = 0.26;
        group.add(shieldGroup);

        const shieldPlate = new THREE.Mesh(this.getGeo('imp_shield_plate', () => new THREE.BoxGeometry(0.8, 1.18, 0.1)), demonArmorMat);
        shieldGroup.add(shieldPlate);

        const shieldRim = new THREE.Mesh(this.getGeo('imp_shield_rim', () => new THREE.TorusGeometry(0.52, 0.045, 6, 4)), obsidianMat);
        shieldRim.rotation.z = Math.PI / 4;
        shieldRim.position.z = 0.02;
        shieldGroup.add(shieldRim);

        const skull = new THREE.Mesh(this.getGeo('imp_skull', () => new THREE.SphereGeometry(0.19, 12, 10)), boneMat);
        skull.position.set(0, 0.16, 0.1);
        skull.scale.set(1.0, 1.05, 0.85);
        shieldGroup.add(skull);

        const jaw = new THREE.Mesh(this.getGeo('imp_skull_jaw', () => new THREE.BoxGeometry(0.2, 0.1, 0.16)), boneMat);
        jaw.position.set(0, -0.02, 0.14);
        shieldGroup.add(jaw);

        const socketGeo = this.getGeo('imp_skull_socket', () => new THREE.SphereGeometry(0.05, 8, 8));
        for (const sx of [-0.07, 0.07]) {
          const socket = new THREE.Mesh(socketGeo, emberEyeMat);
          socket.position.set(sx, 0.2, 0.24);
          shieldGroup.add(socket);
        }

        const shieldSpikeGeo = this.getGeo('imp_shield_spike', () => new THREE.ConeGeometry(0.05, 0.22, 6));
        for (const sy of [-0.5, 0.5]) {
          const spike = new THREE.Mesh(shieldSpikeGeo, obsidianMat);
          spike.position.set(0, sy, 0.1);
          spike.rotation.x = sy > 0 ? -Math.PI / 2 : Math.PI / 2;
          shieldGroup.add(spike);
        }
        break;
      }


      case 'winged_doman': {
        // ДОМАН-КАРАТЕЛЬ: reinforced hell bombardier - scarred dark hyrax hauling a rack of
        // glowing hell charges in a spiked iron harness.
        const emberEyeMat = this.getMaterial('ember_eye_glow', () => new THREE.MeshBasicMaterial({ color: 0xff2200 }));
        const tuskMat = this.getMaterial('tusk_ivory', () => new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.35 }));

        this.buildHyraxQuadruped(group, {
          furMat: darkFurMat,
          eyeMat: emberEyeMat,
          bodyR: 0.46,
          bodyL: 0.86,
          bodyY: 0.78,
          headR: 0.33,
          headZ: 0.74,
          legLen: 0.68,
          tuskMat,
        });

        const ironMat = this.getMaterial('spike_iron', () => new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8, roughness: 0.35 }));
        const canisterMat = this.getMaterial('hell_canister', () => new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.75, roughness: 0.3 }));
        const glowBandMat = this.getMaterial('hell_glow_band', () => new THREE.MeshBasicMaterial({ color: 0xf97316 }));

        // Spiked iron collar
        const collar = new THREE.Mesh(this.getGeo('hell_collar', () => new THREE.TorusGeometry(0.34, 0.05, 8, 16)), ironMat);
        collar.position.set(0, 0.92, 0.5);
        collar.rotation.x = Math.PI / 2.6;
        group.add(collar);

        const collarSpikeGeo = this.getGeo('hell_collar_spike', () => new THREE.ConeGeometry(0.05, 0.2, 6));
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const spike = new THREE.Mesh(collarSpikeGeo, ironMat);
          spike.position.set(Math.cos(a) * 0.34, 0.92 + Math.sin(a) * 0.3, 0.5 - Math.sin(a) * 0.1);
          spike.rotation.z = -a + Math.PI / 2;
          group.add(spike);
        }

        // Iron pack frame + rack of hell charges
        const rack = new THREE.Mesh(this.getGeo('hell_rack', () => new THREE.BoxGeometry(0.56, 0.08, 0.7)), ironMat);
        rack.position.set(0, 1.14, -0.06);
        group.add(rack);

        const canGeo = this.getGeo('hell_can', () => new THREE.CylinderGeometry(0.1, 0.1, 0.42, 12));
        const bandGeo = this.getGeo('hell_can_band', () => new THREE.TorusGeometry(0.103, 0.018, 6, 12));
        const capGeo = this.getGeo('hell_can_cap', () => new THREE.CylinderGeometry(0.055, 0.075, 0.08, 10));
        const ringGeo = this.getGeo('hell_can_ring', () => new THREE.TorusGeometry(0.04, 0.01, 5, 10));
        for (let i = 0; i < 5; i++) {
          const cx = -0.22 + i * 0.11;
          const cz = i % 2 === 0 ? -0.1 : 0.06;
          const cy = 1.4 + (i % 2 === 0 ? 0.0 : 0.07);

          const can = new THREE.Mesh(canGeo, canisterMat);
          can.position.set(cx, cy, cz);
          group.add(can);

          for (const by of [-0.1, 0.1]) {
            const band = new THREE.Mesh(bandGeo, glowBandMat);
            band.position.set(cx, cy + by, cz);
            band.rotation.x = Math.PI / 2;
            group.add(band);
          }

          const cap = new THREE.Mesh(capGeo, ironMat);
          cap.position.set(cx, cy + 0.25, cz);
          group.add(cap);

          const ring = new THREE.Mesh(ringGeo, ironMat);
          ring.position.set(cx, cy + 0.33, cz);
          ring.rotation.x = Math.PI / 2;
          group.add(ring);
        }

        // Harness straps
        const strapGeo = this.getGeo('hell_strap', () => new THREE.TorusGeometry(0.48, 0.04, 6, 16));
        for (const sz of [-0.24, 0.24]) {
          const strap = new THREE.Mesh(strapGeo, ironMat);
          strap.position.set(0, 0.78, sz);
          strap.rotation.y = Math.PI / 2;
          group.add(strap);
        }

        // Battle scars: riveted plates over the flanks
        const scarGeo = this.getGeo('hell_scar_plate', () => new THREE.BoxGeometry(0.04, 0.2, 0.3));
        for (const side of [-1, 1]) {
          const plate = new THREE.Mesh(scarGeo, ironMat);
          plate.position.set(side * 0.46, 0.8, -0.02);
          group.add(plate);
        }

        // Exhaust vents blowing embers along the rack
        const ventGeo = this.getGeo('hell_vent', () => new THREE.ConeGeometry(0.05, 0.14, 6));
        for (const vx of [-0.28, 0.28]) {
          const vent = new THREE.Mesh(ventGeo, glowBandMat);
          vent.position.set(vx, 1.2, -0.34);
          vent.rotation.x = Math.PI / 1.6;
          group.add(vent);
        }
        break;
      }


      case 'skeleton_doman': {
        // МАГМАТИЧЕСКИЙ ЖНЕЦ: magma golem of cracked basalt with a molten core, lava seams
        // and a burning maw.
        const basaltMat = this.getMaterial('solid_magma_stone', () => new THREE.MeshStandardMaterial({
          color: 0x1c1917,
          emissive: 0xff3300,
          emissiveIntensity: 0.35,
          roughness: 0.55,
        }));
        const basaltDarkMat = this.getMaterial('basalt_cold', () => new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 }));
        const lavaMat = this.getMaterial('lava_crack_glow', () => new THREE.MeshBasicMaterial({ color: 0xff5500 }));
        const coreMat = this.getMaterial('lava_core_bright', () => new THREE.MeshBasicMaterial({ color: 0xffb703 }));
        const lavaHornMat = this.getMaterial('lava_horn_mat', () => new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xf97316, emissiveIntensity: 1.2 }));

        const chunkGeo = this.getGeo('magma_chunk', () => new THREE.DodecahedronGeometry(0.42, 0));
        const chunkSmallGeo = this.getGeo('magma_chunk_small', () => new THREE.IcosahedronGeometry(0.2, 0));

        // Basalt torso built from welded chunks
        const hips = new THREE.Mesh(chunkGeo, basaltDarkMat);
        hips.position.set(0, 0.9, 0);
        hips.scale.set(1.2, 0.9, 1.0);
        group.add(hips);

        const chest = new THREE.Mesh(chunkGeo, basaltMat);
        chest.position.set(0, 1.52, 0.02);
        chest.scale.set(1.4, 1.15, 1.1);
        group.add(chest);

        const shoulders = new THREE.Mesh(chunkGeo, basaltDarkMat);
        shoulders.position.set(0, 1.94, -0.02);
        shoulders.scale.set(1.55, 0.6, 1.0);
        group.add(shoulders);

        // Molten core with a containment ring
        const core = new THREE.Mesh(this.getGeo('magma_core', () => new THREE.SphereGeometry(0.19, 12, 12)), coreMat);
        core.position.set(0, 1.5, 0.36);
        group.add(core);

        const coreRing = new THREE.Mesh(this.getGeo('magma_core_ring', () => new THREE.TorusGeometry(0.26, 0.035, 6, 16)), lavaMat);
        coreRing.position.set(0, 1.5, 0.34);
        group.add(coreRing);

        // Lava seams running across the body
        const seamGeo = this.getGeo('magma_seam', () => new THREE.BoxGeometry(0.5, 0.045, 0.045));
        for (let i = 0; i < 7; i++) {
          const seam = new THREE.Mesh(seamGeo, lavaMat);
          seam.position.set((i % 2 ? 0.1 : -0.1), 1.05 + i * 0.16, 0.3 - (i % 3) * 0.05);
          seam.rotation.z = (i % 2 ? 0.5 : -0.4);
          seam.scale.x = 0.5 + (i % 3) * 0.3;
          group.add(seam);
        }

        // Head with burning eyes and an open maw
        const head = new THREE.Mesh(chunkSmallGeo, basaltMat);
        head.position.set(0, 2.24, 0.06);
        head.scale.set(1.5, 1.4, 1.4);
        group.add(head);

        const eyeGeo = this.getGeo('magma_eye', () => new THREE.SphereGeometry(0.055, 8, 8));
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(eyeGeo, coreMat);
          eye.position.set(side * 0.11, 2.3, 0.26);
          group.add(eye);
        }

        const maw = new THREE.Mesh(this.getGeo('magma_maw', () => new THREE.BoxGeometry(0.2, 0.09, 0.06)), lavaMat);
        maw.position.set(0, 2.14, 0.27);
        group.add(maw);

        // Lava horns
        const hornGeo = this.getGeo('magma_horn', () => new THREE.ConeGeometry(0.08, 0.46, 8));
        for (const side of [-1, 1]) {
          const horn = new THREE.Mesh(hornGeo, lavaHornMat);
          horn.position.set(side * 0.24, 2.52, 0.06);
          horn.rotation.z = -side * 0.4;
          group.add(horn);
        }

        // Shoulder vents venting pressure
        const ventGeo = this.getGeo('magma_vent', () => new THREE.CylinderGeometry(0.09, 0.11, 0.14, 10));
        for (const side of [-1, 1]) {
          const vent = new THREE.Mesh(ventGeo, lavaMat);
          vent.position.set(side * 0.55, 2.0, -0.06);
          vent.rotation.z = side * 0.3;
          group.add(vent);
        }

        // Heavy arms with lava seams and boulder fists
        for (const side of [-1, 1]) {
          const upper = new THREE.Mesh(chunkSmallGeo, basaltDarkMat);
          upper.position.set(side * 0.66, 1.62, 0.02);
          upper.scale.set(1.3, 1.5, 1.3);
          group.add(upper);

          const fore = new THREE.Mesh(chunkSmallGeo, basaltMat);
          fore.position.set(side * 0.74, 1.16, 0.1);
          fore.scale.set(1.2, 1.4, 1.2);
          group.add(fore);

          const fist = new THREE.Mesh(chunkSmallGeo, basaltDarkMat);
          fist.position.set(side * 0.8, 0.82, 0.2);
          fist.scale.setScalar(1.5);
          group.add(fist);

          const armSeam = new THREE.Mesh(seamGeo, lavaMat);
          armSeam.position.set(side * 0.72, 1.4, 0.16);
          armSeam.rotation.z = Math.PI / 2;
          armSeam.scale.x = 0.55;
          group.add(armSeam);
        }

        // Legs on hip pivots
        for (const [name, sx] of [['leg_FL', -1], ['leg_FR', 1]] as const) {
          const hip = new THREE.Group();
          hip.name = name;
          hip.position.set(sx * 0.28, 0.82, 0);
          group.add(hip);

          const thigh = new THREE.Mesh(chunkSmallGeo, basaltDarkMat);
          thigh.position.y = -0.24;
          thigh.scale.set(1.4, 1.6, 1.4);
          hip.add(thigh);

          const shin = new THREE.Mesh(chunkSmallGeo, basaltMat);
          shin.position.y = -0.56;
          shin.scale.set(1.2, 1.4, 1.2);
          hip.add(shin);

          const foot = new THREE.Mesh(chunkSmallGeo, basaltDarkMat);
          foot.position.set(0, -0.76, 0.12);
          foot.scale.set(1.5, 0.8, 1.8);
          hip.add(foot);

          const kneeSeam = new THREE.Mesh(seamGeo, lavaMat);
          kneeSeam.position.set(0, -0.4, 0.16);
          kneeSeam.scale.x = 0.4;
          hip.add(kneeSeam);
        }

        // Molten slag pooling at its feet
        const slagGeo = this.getGeo('magma_slag', () => new THREE.SphereGeometry(0.1, 8, 6));
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const slag = new THREE.Mesh(slagGeo, lavaMat);
          slag.position.set(Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.38);
          slag.scale.set(1.3, 0.4, 1.3);
          group.add(slag);
        }
        break;
      }


      // --- BOSSES ---
      case 'boss_goliath': {
        // 5m Goliath Mech with dual rotating miniguns, shoulder missile pods & hydraulic legs
        const bodyGeo = this.getGeo('box_2.8_3.5_2.2', () => new THREE.BoxGeometry(2.8, 3.5, 2.2));
        const bodyMat = this.getMaterial('goliath_body_mat', () => new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.3, metalness: 0.9 }));
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 2.7;
        body.castShadow = true;
        group.add(body);

        // Armor Plate Bezel Trim & Rivets
        const trimGeo = this.getGeo('box_2.86_0.15_2.26', () => new THREE.BoxGeometry(2.86, 0.15, 2.26));
        const trimMat = this.getMaterial('goliath_trim_gold', () => new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2, metalness: 0.9 }));
        for (const ty of [1.8, 3.2]) {
          const trim = new THREE.Mesh(trimGeo, trimMat);
          trim.position.set(0, ty, 0);
          group.add(trim);
        }

        // Reactor Core in Chest
        const reactorGeo = this.getGeo('sph_0.6_14_14', () => new THREE.SphereGeometry(0.6, 14, 14));
        const reactorMat = this.getMaterial('goliath_reactor', () => new THREE.MeshStandardMaterial({
          color: 0xef4444, emissive: 0xff0000, emissiveIntensity: 1.5
        }));
        const reactor = new THREE.Mesh(reactorGeo, reactorMat);
        reactor.position.set(0, 2.8, 1.12);
        group.add(reactor);

        // Head Cockpit Visor
        const headGeo = this.getGeo('box_1.4_0.9_1.2', () => new THREE.BoxGeometry(1.4, 0.9, 1.2));
        const headMat = this.getMaterial('goliath_visor', () => new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.1, metalness: 0.95 }));
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 4.6, 0.2);
        group.add(head);

        // Dual Miniguns (Left & Right)
        const gunGeo = this.getGeo('cyl_0.45_0.45_2.8_12', () => new THREE.CylinderGeometry(0.45, 0.45, 2.8, 12));
        const gunMat = this.getMaterial('goliath_gun_dark', () => new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.95, roughness: 0.2 }));
        const podGeo = this.getGeo('box_0.8_0.8_1.2', () => new THREE.BoxGeometry(0.8, 0.8, 1.2));
        const tipGeo = this.getGeo('cone_0.12_0.3_8', () => new THREE.ConeGeometry(0.12, 0.3, 8));
        const legGeo = this.getGeo('cyl_0.5_0.6_2.2_10', () => new THREE.CylinderGeometry(0.5, 0.6, 2.2, 10));

        for (const side of [-1, 1]) {
          const gun = new THREE.Mesh(gunGeo, gunMat);
          gun.rotation.x = Math.PI / 2;
          gun.position.set(side * 2.0, 3.4, 1.1);
          group.add(gun);

          // Shoulder Missile Pod
          const pod = new THREE.Mesh(podGeo, hazardMat);
          pod.position.set(side * 2.0, 4.8, -0.2);
          group.add(pod);

          // 4 Red Missile Tips inside Pod
          for (let mx = -1; mx <= 1; mx += 2) {
            for (let my = -1; my <= 1; my += 2) {
              const tip = new THREE.Mesh(tipGeo, ledRedMat);
              tip.rotation.x = Math.PI / 2;
              tip.position.set(side * 2.0 + mx * 0.2, 4.8 + my * 0.2, 0.45);
              group.add(tip);
            }
          }

          // Heavy Hydraulic Legs
          const leg = new THREE.Mesh(legGeo, metalMat);
          leg.position.set(side * 1.2, 1.1, 0);
          group.add(leg);
        }
        break;
      }

      case 'boss_worm': {
        // ГИГАНТСКИЙ БЕЛЫЙ ЧЕРВЬ С ДОМАНОМ В КАСКЕ (Giant White Multi-detailed Worm with Helmeted Doman Rider)

        // --- Materials ---
        const greyChitinMat = this.getMaterial('boss_grey_chitin', () => new THREE.MeshStandardMaterial({
          color: 0x94a3b8, // Sleek grey chitin
          roughness: 0.28,
          metalness: 0.25,
        }));
        const greyPlateMat = this.getMaterial('boss_grey_plate', () => new THREE.MeshStandardMaterial({
          color: 0x64748b, // Darker slate carapace plates
          roughness: 0.35,
          metalness: 0.20,
        }));
        const darkMetalMat = this.getMaterial('boss_worm_dark_metal', () => new THREE.MeshStandardMaterial({
          color: 0x334155, // Dark slate steel joints & mechanics
          roughness: 0.25,
          metalness: 0.85,
        }));
        const glowCyanMat = this.getMaterial('boss_worm_cyan_glow', () => new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 1.6,
          roughness: 0.1,
        }));
        const mouthFleshMat = this.getMaterial('boss_worm_mouth_flesh', () => new THREE.MeshStandardMaterial({
          color: 0x450a0a, // Deep visceral red maw interior
          roughness: 0.5,
        }));
        const mouthInnerMat = this.getMaterial('boss_worm_mouth_dark', () => new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.8,
        }));
        const teethWhiteMat = this.getMaterial('boss_worm_teeth', () => new THREE.MeshStandardMaterial({
          color: 0xf8fafc, // Sharp ivory teeth
          roughness: 0.1,
          metalness: 0.3,
        }));

        // Doman Rider & Helmet Materials
        const domanFurMat = this.getMaterial('doman_fur_rider', () => new THREE.MeshStandardMaterial({
          color: 0x8a5229, // Classic Doman fur
          roughness: 0.7,
        }));
        const domanCreamMat = this.getMaterial('doman_cream_rider', () => new THREE.MeshStandardMaterial({
          color: 0xebdbbe,
          roughness: 0.75,
        }));
        const helmetSteelMat = this.getMaterial('doman_helmet_steel', () => new THREE.MeshStandardMaterial({
          color: 0x475569, // Military steel helmet (каска)
          metalness: 0.82,
          roughness: 0.3,
        }));
        const helmetBadgeMat = this.getMaterial('doman_helmet_badge', () => new THREE.MeshStandardMaterial({
          color: 0xeab308,
          emissive: 0xca8a04,
          emissiveIntensity: 0.9,
          metalness: 0.9,
        }));
        const visorCyanMat = this.getMaterial('doman_visor_cyan', () => new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          emissive: 0x0891b2,
          emissiveIntensity: 1.3,
          roughness: 0.1,
        }));
        const saddleMat = this.getMaterial('doman_saddle_leather', () => new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.6,
          metalness: 0.3,
        }));

        // Shared Geometries for Worm Body
        const segCoreGeo = this.getGeo('cyl_1.35_1.35_1.5_16', () => new THREE.CylinderGeometry(1.35, 1.35, 1.5, 16));
        const segRingGlowGeo = this.getGeo('torus_1.32_0.08_8_20', () => new THREE.TorusGeometry(1.32, 0.08, 8, 20));
        const segPlateGeo = this.getGeo('box_2.2_0.4_1.3', () => new THREE.BoxGeometry(2.2, 0.4, 1.3));
        const segSpineGeo = this.getGeo('cone_0.18_0.7_8', () => new THREE.ConeGeometry(0.18, 0.7, 8));
        const segBellyGeo = this.getGeo('box_2.1_0.15_1.1', () => new THREE.BoxGeometry(2.1, 0.15, 1.1));

        // Leg Geometries
        const legHipGeo = this.getGeo('sph_0.20_8_8', () => new THREE.SphereGeometry(0.20, 8, 8));
        const legFemurGeo = this.getGeo('cyl_0.14_0.11_1.1_8', () => new THREE.CylinderGeometry(0.14, 0.11, 1.1, 8));
        const legTibiaGeo = this.getGeo('cyl_0.11_0.06_1.3_8', () => new THREE.CylinderGeometry(0.11, 0.06, 1.3, 8));
        const legClawGeo = this.getGeo('cone_0.05_0.28_6', () => new THREE.ConeGeometry(0.05, 0.28, 6));

        // --- 1. GIANT MULTI-DETAILED WHITE WORM BODY (10 Segments) ---
        for (let i = 0; i < 10; i++) {
          const scale = 1.0 - i * 0.035; // Slight tail taper
          const segZ = -i * 1.5;
          const segY = 1.8 + Math.sin(i * 0.45) * 0.18; // Undulating body curve

          const segGroup = new THREE.Group();
          segGroup.position.set(0, segY, segZ);
          segGroup.scale.set(scale, scale, scale);

          // Grey Main Ring Body
          const coreMesh = new THREE.Mesh(segCoreGeo, greyChitinMat);
          coreMesh.rotation.x = Math.PI / 2;
          coreMesh.castShadow = true;
          segGroup.add(coreMesh);

          // Glowing Bio-Energy Ring between segments
          const glowRing = new THREE.Mesh(segRingGlowGeo, glowCyanMat);
          glowRing.position.set(0, 0, 0.75);
          segGroup.add(glowRing);

          // Overlapping Top Armor Carapace Scale
          const topPlate = new THREE.Mesh(segPlateGeo, greyPlateMat);
          topPlate.position.set(0, 1.25, -0.1);
          topPlate.rotation.x = -0.12;
          segGroup.add(topPlate);

          // Spine Ridges / Spikes with Glowing Tips
          for (const sx of [-0.45, 0.45]) {
            const spine = new THREE.Mesh(segSpineGeo, greyChitinMat);
            spine.position.set(sx, 1.6, -0.1);
            spine.rotation.x = -0.3;
            spine.rotation.z = (sx > 0 ? -1 : 1) * 0.2;
            segGroup.add(spine);

            const spineTip = new THREE.Mesh(
              this.getGeo('sph_0.06_6_6', () => new THREE.SphereGeometry(0.06, 6, 6)),
              glowCyanMat
            );
            spineTip.position.set(sx, 1.9, -0.2);
            segGroup.add(spineTip);
          }

          // Ventral Belly Armor Ribs
          const belly = new THREE.Mesh(segBellyGeo, greyPlateMat);
          belly.position.set(0, -1.25, 0);
          segGroup.add(belly);

          // --- Articulated Grey Chitin Legs on each side (Лапки) ---
          for (const side of [-1, 1]) {
            const legPhase = (i * 0.6 + (side > 0 ? 0 : Math.PI)) % (Math.PI * 2);
            const legZOff = Math.sin(legPhase) * 0.2;

            const legGroup = new THREE.Group();
            legGroup.position.set(side * 1.25, -0.3, legZOff);

            // Dark Socket Joint
            const hipSocket = new THREE.Mesh(legHipGeo, darkMetalMat);
            legGroup.add(hipSocket);

            // Femur (Upper leg extending out and up)
            const femurGroup = new THREE.Group();
            femurGroup.rotation.z = side * (Math.PI / 3.5);

            const femur = new THREE.Mesh(legFemurGeo, greyChitinMat);
            femur.position.y = -0.55;
            femurGroup.add(femur);

            // Knee Joint
            const knee = new THREE.Mesh(
              this.getGeo('sph_0.15_8_8', () => new THREE.SphereGeometry(0.15, 8, 8)),
              glowCyanMat
            );
            knee.position.y = -1.1;
            femurGroup.add(knee);

            // Tibia (Lower leg extending down to floor)
            const tibiaGroup = new THREE.Group();
            tibiaGroup.position.set(0, -1.1, 0);
            tibiaGroup.rotation.z = -side * (Math.PI / 2.2);

            const tibia = new THREE.Mesh(legTibiaGeo, greyChitinMat);
            tibia.position.y = -0.65;
            tibiaGroup.add(tibia);

            // Sharp Claws
            for (let c = -1; c <= 1; c++) {
              const claw = new THREE.Mesh(legClawGeo, greyChitinMat);
              claw.position.set(c * 0.08, -1.3, 0.08);
              claw.rotation.x = Math.PI / 2.2;
              tibiaGroup.add(claw);
            }

            femurGroup.add(tibiaGroup);
            legGroup.add(femurGroup);
            segGroup.add(legGroup);
          }

          group.add(segGroup);
        }

        // --- 2. GIANT WORM HEAD WITH REAL UPPER & LOWER JAWS AND TEETH (Front Segment Z = 0) ---
        const hY = 1.8;
        const hZ = 1.0;

        // Head Base Chitin Hood / Skull
        const headHoodGeo = this.getGeo('sph_1.5_16_16', () => new THREE.SphereGeometry(1.5, 16, 16));
        const headHood = new THREE.Mesh(headHoodGeo, greyChitinMat);
        headHood.scale.set(1.1, 0.9, 1.2);
        headHood.position.set(0, hY + 0.1, hZ);
        group.add(headHood);

        // Chitin Crest Horns on Head
        const crestGeo = this.getGeo('cone_0.35_1.4_8', () => new THREE.ConeGeometry(0.35, 1.4, 8));
        for (const side of [-1, 1]) {
          const crest = new THREE.Mesh(crestGeo, greyPlateMat);
          crest.position.set(side * 0.75, hY + 1.2, hZ - 0.2);
          crest.rotation.z = side * -0.4;
          crest.rotation.x = -0.4;
          group.add(crest);
        }

        // --- UPPER JAW & SNOUT (Верхняя челюсть и рыло) ---
        const upperJawGroup = new THREE.Group();
        upperJawGroup.position.set(0, hY + 0.2, hZ + 0.7);

        // Chitin Upper Snout Roof
        const snoutRoofGeo = this.getGeo('box_1.4_0.6_1.6', () => new THREE.BoxGeometry(1.4, 0.6, 1.6));
        const snoutRoof = new THREE.Mesh(snoutRoofGeo, greyChitinMat);
        snoutRoof.position.set(0, 0, 0.6);
        snoutRoof.rotation.x = -0.08;
        upperJawGroup.add(snoutRoof);

        // Upper Snout Armor Plate / Nose Ridge
        const noseRidgeGeo = this.getGeo('box_0.9_0.3_1.4', () => new THREE.BoxGeometry(0.9, 0.3, 1.4));
        const noseRidge = new THREE.Mesh(noseRidgeGeo, greyPlateMat);
        noseRidge.position.set(0, 0.3, 0.65);
        noseRidge.rotation.x = -0.12;
        upperJawGroup.add(noseRidge);

        // Nostril Vent Slits
        const nostrilGeo = this.getGeo('box_0.12_0.08_0.25', () => new THREE.BoxGeometry(0.12, 0.08, 0.25));
        for (const side of [-1, 1]) {
          const nostril = new THREE.Mesh(nostrilGeo, mouthInnerMat);
          nostril.position.set(side * 0.25, 0.32, 1.1);
          upperJawGroup.add(nostril);
        }

        // Upper Fleshy Gums / Palate
        const upperPalateGeo = this.getGeo('box_1.28_0.15_1.5', () => new THREE.BoxGeometry(1.28, 0.15, 1.5));
        const upperPalate = new THREE.Mesh(upperPalateGeo, mouthFleshMat);
        upperPalate.position.set(0, -0.28, 0.6);
        upperJawGroup.add(upperPalate);

        // Upper Teeth Row (8 teeth along upper jaw rim)
        const upperToothGeo = this.getGeo('cone_0.08_0.38_8', () => new THREE.ConeGeometry(0.08, 0.38, 8));
        const upperFangsGeo = this.getGeo('cone_0.12_0.60_8', () => new THREE.ConeGeometry(0.12, 0.60, 8));

        for (let i = 0; i < 8; i++) {
          const tFactor = (i / 7) * 2 - 1; // -1 to 1
          const tx = tFactor * 0.52;
          const tz = 1.32 - Math.abs(tFactor) * 0.25;

          const tooth = new THREE.Mesh(upperToothGeo, teethWhiteMat);
          tooth.position.set(tx, -0.38, tz);
          tooth.rotation.x = Math.PI; // Pointing straight down
          tooth.rotation.z = -tFactor * 0.15;
          upperJawGroup.add(tooth);
        }

        // 2 Massive Front Upper Fangs
        for (const side of [-1, 1]) {
          const fang = new THREE.Mesh(upperFangsGeo, teethWhiteMat);
          fang.position.set(side * 0.32, -0.45, 1.28);
          fang.rotation.x = Math.PI - 0.2; // Point down and slightly inward
          fang.rotation.z = side * -0.15;
          upperJawGroup.add(fang);
        }

        group.add(upperJawGroup);

        // --- LOWER JAW (Нижняя челюсть / подбородок) ---
        const lowerJawGroup = new THREE.Group();
        lowerJawGroup.position.set(0, hY - 0.4, hZ + 0.6);
        lowerJawGroup.rotation.x = 0.35; // Gaping mouth open angle!

        // Lower Jaw Chitin Base
        const lowerJawMesh = new THREE.Mesh(
          this.getGeo('box_1.3_0.5_1.5', () => new THREE.BoxGeometry(1.3, 0.5, 1.5)),
          greyChitinMat
        );
        lowerJawMesh.position.set(0, -0.1, 0.55);
        lowerJawGroup.add(lowerJawMesh);

        // Lower Fleshy Gums
        const lowerPalate = new THREE.Mesh(
          this.getGeo('box_1.2_0.15_1.4', () => new THREE.BoxGeometry(1.2, 0.15, 1.4)),
          mouthFleshMat
        );
        lowerPalate.position.set(0, 0.18, 0.55);
        lowerJawGroup.add(lowerPalate);

        // Muscular Red Tongue inside lower jaw
        const tongueGeo = this.getGeo('box_0.5_0.12_1.0', () => new THREE.BoxGeometry(0.5, 0.12, 1.0));
        const tongue = new THREE.Mesh(tongueGeo, mouthFleshMat);
        tongue.position.set(0, 0.22, 0.45);
        tongue.rotation.x = -0.15;
        lowerJawGroup.add(tongue);

        // Lower Teeth Row (8 teeth along lower jaw rim)
        const lowerToothGeo = this.getGeo('cone_0.07_0.32_8', () => new THREE.ConeGeometry(0.07, 0.32, 8));
        const lowerFangsGeo = this.getGeo('cone_0.11_0.55_8', () => new THREE.ConeGeometry(0.11, 0.55, 8));

        for (let i = 0; i < 8; i++) {
          const tFactor = (i / 7) * 2 - 1; // -1 to 1
          const tx = tFactor * 0.48;
          const tz = 1.22 - Math.abs(tFactor) * 0.22;

          const tooth = new THREE.Mesh(lowerToothGeo, teethWhiteMat);
          tooth.position.set(tx, 0.30, tz);
          tooth.rotation.x = 0.15; // Pointing up
          tooth.rotation.z = tFactor * 0.12;
          lowerJawGroup.add(tooth);
        }

        // 2 Massive Front Lower Fangs
        for (const side of [-1, 1]) {
          const fang = new THREE.Mesh(lowerFangsGeo, teethWhiteMat);
          fang.position.set(side * 0.28, 0.38, 1.20);
          fang.rotation.x = -0.15; // Pointing up and back
          fang.rotation.z = side * 0.12;
          lowerJawGroup.add(fang);
        }

        group.add(lowerJawGroup);

        // --- THROAT CAVITY & CHEEK MEMBRANES ---
        // Throat Back Cavity
        const throatGeo = this.getGeo('cyl_0.85_0.5_1.1_16', () => new THREE.CylinderGeometry(0.85, 0.5, 1.1, 16));
        const throat = new THREE.Mesh(throatGeo, mouthInnerMat);
        throat.rotation.x = Math.PI / 2;
        throat.position.set(0, hY - 0.1, hZ + 0.6);
        group.add(throat);

        // Fleshy Side Cheek Membranes bridging upper and lower jaws
        const cheekGeo = this.getGeo('box_0.08_0.65_0.8', () => new THREE.BoxGeometry(0.08, 0.65, 0.8));
        for (const side of [-1, 1]) {
          const cheek = new THREE.Mesh(cheekGeo, mouthFleshMat);
          cheek.position.set(side * 0.62, hY - 0.1, hZ + 1.1);
          group.add(cheek);
        }

        // 4 Outer Articulated Jaw Mandibles (Top, Bottom, Left, Right Pincers)
        const mandibleGeo = this.getGeo('cone_0.22_1.2_8', () => new THREE.ConeGeometry(0.22, 1.2, 8));
        const mandibles = [
          { x: 0, y: hY + 0.6, z: hZ + 1.3, rx: Math.PI / 2.2, ry: 0, rz: 0 },
          { x: 0, y: hY - 1.0, z: hZ + 1.3, rx: -Math.PI / 2.2, ry: 0, rz: 0 },
          { x: -0.9, y: hY - 0.2, z: hZ + 1.3, rx: 0, ry: Math.PI / 2.2, rz: Math.PI / 2 },
          { x: 0.9, y: hY - 0.2, z: hZ + 1.3, rx: 0, ry: -Math.PI / 2.2, rz: -Math.PI / 2 },
        ];

        for (const m of mandibles) {
          const mandible = new THREE.Mesh(mandibleGeo, greyChitinMat);
          mandible.position.set(m.x, m.y, m.z);
          mandible.rotation.set(m.rx, m.ry, m.rz);
          group.add(mandible);

          // Cyan Bio-Tip on Mandible
          const tip = new THREE.Mesh(
            this.getGeo('sph_0.08_6_6', () => new THREE.SphereGeometry(0.08, 6, 6)),
            glowCyanMat
          );
          tip.position.set(m.x, m.y, m.z + 0.55);
          group.add(tip);
        }

        // 8 Bio-Luminescent Cyan Eyes Clustered on Head Sides
        const eyeGeo = this.getGeo('sph_0.14_10_10', () => new THREE.SphereGeometry(0.14, 10, 10));
        for (const side of [-1, 1]) {
          for (let e = 0; e < 4; e++) {
            const eye = new THREE.Mesh(eyeGeo, glowCyanMat);
            const eyeX = side * (1.1 + (e % 2) * 0.15);
            const eyeY = hY + 0.2 + Math.floor(e / 2) * 0.28;
            const eyeZ = hZ + 0.4 + (e % 2) * 0.35;
            eye.position.set(eyeX, eyeY, eyeZ);
            group.add(eye);
          }
        }

        // --- 3. MOUNTED DOMAN RIDER IN HELMET (ДОМАН В КАСКЕ) ---
        // Mounted on top of Segment 1 (Z = -1.5, Y = 1.8)
        const riderSeatGroup = new THREE.Group();
        riderSeatGroup.position.set(0, 3.2, -1.2);

        // Saddle Seat & Control Rig
        const saddleMesh = new THREE.Mesh(
          this.getGeo('box_0.9_0.35_1.1', () => new THREE.BoxGeometry(0.9, 0.35, 1.1)),
          saddleMat
        );
        saddleMesh.position.set(0, 0, 0);
        riderSeatGroup.add(saddleMesh);

        // Saddle Straps wrapping around worm
        const strapGeo = this.getGeo('torus_1.4_0.06_8_16', () => new THREE.TorusGeometry(1.4, 0.06, 8, 16));
        const strap = new THREE.Mesh(strapGeo, darkMetalMat);
        strap.position.set(0, -0.8, 0);
        riderSeatGroup.add(strap);

        // Control Dashboard & Steering Levers
        const dashMesh = new THREE.Mesh(
          this.getGeo('box_0.6_0.25_0.3', () => new THREE.BoxGeometry(0.6, 0.25, 0.3)),
          darkMetalMat
        );
        dashMesh.position.set(0, 0.4, 0.5);
        riderSeatGroup.add(dashMesh);

        // Steering Levers / Handles
        const leverGeo = this.getGeo('cyl_0.025_0.025_0.35_6', () => new THREE.CylinderGeometry(0.025, 0.025, 0.35, 6));
        const leverKnobGeo = this.getGeo('sph_0.05_8_8', () => new THREE.SphereGeometry(0.05, 8, 8));
        for (const side of [-1, 1]) {
          const lever = new THREE.Mesh(leverGeo, darkMetalMat);
          lever.position.set(side * 0.22, 0.62, 0.55);
          lever.rotation.x = -0.3;
          riderSeatGroup.add(lever);

          const knob = new THREE.Mesh(leverKnobGeo, glowCyanMat);
          knob.position.set(side * 0.22, 0.78, 0.50);
          riderSeatGroup.add(knob);
        }

        // Reins / Control Cables running from levers to worm's head
        const reinCableGeo = this.getGeo('cyl_0.018_0.018_2.2_6', () => new THREE.CylinderGeometry(0.018, 0.018, 2.2, 6));
        for (const side of [-1, 1]) {
          const rein = new THREE.Mesh(reinCableGeo, glowCyanMat);
          rein.position.set(side * 0.35, -0.1, 1.2);
          rein.rotation.x = Math.PI / 3.8;
          riderSeatGroup.add(rein);
        }

        // --- THE DOMAN RIDER BODY (WEAKSPOT TARGET) ---
        const riderGroup = new THREE.Group();
        riderGroup.name = 'weakspot_rider'; // Weakspot name targeting
        riderGroup.position.set(0, 0.25, 0);

        // Torso / Body (Hyrax Chestnut Fur)
        const riderBodyGeo = this.getGeo('cap_0.34_0.58_10_12', () => new THREE.CapsuleGeometry(0.34, 0.58, 10, 12));
        const riderBody = new THREE.Mesh(riderBodyGeo, domanFurMat);
        riderBody.position.set(0, 0.45, 0);
        riderBody.name = 'weakspot_rider';
        riderGroup.add(riderBody);

        // Cream Chest Patch
        const riderChestGeo = this.getGeo('sph_0.22_10_10', () => new THREE.SphereGeometry(0.22, 10, 10));
        const riderChest = new THREE.Mesh(riderChestGeo, domanCreamMat);
        riderChest.scale.set(0.85, 0.85, 1.1);
        riderChest.position.set(0, 0.40, 0.16);
        riderGroup.add(riderChest);

        // Seated Legs (Bent forward into stirrups)
        const riderThighGeo = this.getGeo('cyl_0.075_0.06_0.32_8', () => new THREE.CylinderGeometry(0.075, 0.06, 0.32, 8));
        for (const side of [-1, 1]) {
          const thigh = new THREE.Mesh(riderThighGeo, domanFurMat);
          thigh.position.set(side * 0.28, 0.25, 0.10);
          thigh.rotation.z = side * -0.45;
          thigh.rotation.x = Math.PI / 3.5;
          riderGroup.add(thigh);
        }

        // Arms holding control levers
        const riderArmGeo = this.getGeo('cyl_0.06_0.045_0.38_8', () => new THREE.CylinderGeometry(0.06, 0.045, 0.38, 8));
        for (const side of [-1, 1]) {
          const arm = new THREE.Mesh(riderArmGeo, domanFurMat);
          arm.position.set(side * 0.24, 0.55, 0.28);
          arm.rotation.x = -Math.PI / 3;
          arm.rotation.z = side * -0.15;
          riderGroup.add(arm);
        }

        // Doman Head
        const riderHeadGeo = this.getGeo('sph_0.26_12_12', () => new THREE.SphereGeometry(0.26, 12, 12));
        const riderHead = new THREE.Mesh(riderHeadGeo, domanFurMat);
        riderHead.position.set(0, 0.92, 0.05);
        riderHead.name = 'weakspot_rider';
        riderGroup.add(riderHead);

        // Cute Muzzle & Dark Shiny Nose
        const riderSnoutGeo = this.getGeo('sph_0.12_10_10', () => new THREE.SphereGeometry(0.12, 10, 10));
        const riderSnout = new THREE.Mesh(riderSnoutGeo, domanCreamMat);
        riderSnout.scale.set(1.2, 0.8, 1.2);
        riderSnout.position.set(0, 0.88, 0.24);
        riderGroup.add(riderSnout);

        const riderNoseGeo = this.getGeo('sph_0.038_8_8', () => new THREE.SphereGeometry(0.038, 8, 8));
        const riderNose = new THREE.Mesh(riderNoseGeo, mouthInnerMat);
        riderNose.position.set(0, 0.91, 0.35);
        riderGroup.add(riderNose);

        // Shiny Eyes with Glints
        const riderEyeGeo = this.getGeo('sph_0.048_8_8', () => new THREE.SphereGeometry(0.048, 8, 8));
        const riderGlintGeo = this.getGeo('sph_0.016_6_6', () => new THREE.SphereGeometry(0.016, 6, 6));
        const whiteMat = this.getMaterial('rider_eye_white', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));

        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(riderEyeGeo, mouthInnerMat);
          eye.position.set(side * 0.12, 0.96, 0.24);
          riderGroup.add(eye);

          const glint = new THREE.Mesh(riderGlintGeo, whiteMat);
          glint.position.set(side * 0.12 + 0.015, 0.975, 0.28);
          riderGroup.add(glint);
        }

        // Cute Ears sticking out sideways under helmet
        const riderEarGeo = this.getGeo('cone_0.065_0.18_8', () => new THREE.ConeGeometry(0.065, 0.18, 8));
        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(riderEarGeo, domanFurMat);
          ear.position.set(side * 0.22, 1.05, 0.02);
          ear.rotation.z = side * -0.55;
          ear.rotation.x = -0.2;
          riderGroup.add(ear);
        }

        // Whiskers
        const riderWhiskerMat = this.getMaterial('rider_whisker', () => new THREE.MeshBasicMaterial({ color: 0x111111 }));
        const riderWhiskerGeo = this.getGeo('cyl_0.0025_0.001_0.22_4', () => new THREE.CylinderGeometry(0.0025, 0.001, 0.22, 4));
        for (const side of [-1, 1]) {
          for (let w = -1; w <= 1; w++) {
            const whisker = new THREE.Mesh(riderWhiskerGeo, riderWhiskerMat);
            whisker.rotation.z = Math.PI / 2 + side * 0.15;
            whisker.rotation.x = w * 0.15;
            whisker.position.set(side * 0.18, 0.88 + w * 0.02, 0.28);
            riderGroup.add(whisker);
          }
        }

        // --- 4. MILITARY HELMET ("КАСКА") ON DOMAN'S HEAD ---
        const helmetGroup = new THREE.Group();
        helmetGroup.position.set(0, 1.08, 0.04);

        // Helmet Main Dome (Каска)
        const helmetDomeGeo = this.getGeo('sph_0.31_14_14', () => new THREE.SphereGeometry(0.31, 14, 14, 0, Math.PI * 2, 0, Math.PI / 1.7));
        const helmetDome = new THREE.Mesh(helmetDomeGeo, helmetSteelMat);
        helmetDome.castShadow = true;
        helmetGroup.add(helmetDome);

        // Helmet Rim / Brim (Защитный козырек)
        const helmetBrimGeo = this.getGeo('torus_0.31_0.035_8_20', () => new THREE.TorusGeometry(0.31, 0.035, 8, 20));
        const helmetBrim = new THREE.Mesh(helmetBrimGeo, helmetSteelMat);
        helmetBrim.rotation.x = Math.PI / 2 + 0.1;
        helmetBrim.position.y = -0.05;
        helmetGroup.add(helmetBrim);

        // Gold Star / Emblem Badge on front of helmet
        const badgeGeo = this.getGeo('octa_0.07_0', () => new THREE.OctahedronGeometry(0.07, 0));
        const badge = new THREE.Mesh(badgeGeo, helmetBadgeMat);
        badge.position.set(0, 0.12, 0.31);
        badge.rotation.z = Math.PI / 4;
        helmetGroup.add(badge);

        // Tactical Cyan Headlamp / Visor on helmet
        const headlampGeo = this.getGeo('box_0.14_0.07_0.08', () => new THREE.BoxGeometry(0.14, 0.07, 0.08));
        const headlamp = new THREE.Mesh(headlampGeo, visorCyanMat);
        headlamp.position.set(0, 0.02, 0.32);
        helmetGroup.add(headlamp);

        // Chin Strap around Doman's chin
        const chinStrapGeo = this.getGeo('torus_0.26_0.018_6_16', () => new THREE.TorusGeometry(0.26, 0.018, 6, 16));
        const chinStrap = new THREE.Mesh(chinStrapGeo, darkMetalMat);
        chinStrap.position.set(0, -0.16, 0.02);
        chinStrap.rotation.x = Math.PI / 2.2;
        helmetGroup.add(chinStrap);

        riderGroup.add(helmetGroup);
        riderSeatGroup.add(riderGroup);
        group.add(riderSeatGroup);

        break;
      }

      case 'boss_miner': {
        // Heavy industrial excavator titan with massive drill arm, steam exhaust & hardhat dome
        const bodyGeo = this.getGeo('box_2.4_3.0_2.0', () => new THREE.BoxGeometry(2.4, 3.0, 2.0));
        const bodyMat = this.getMaterial('boss_miner_body', () => new THREE.MeshStandardMaterial({ color: 0x38220f, emissive: 0xff6600, emissiveIntensity: 0.7, roughness: 0.3 }));
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 2.2;
        group.add(body);

        // Massive Rotary Drill Arm (Right)
        const drillArmGeo = this.getGeo('cyl_0.4_0.4_2.0_10', () => new THREE.CylinderGeometry(0.4, 0.4, 2.0, 10));
        const drillArm = new THREE.Mesh(drillArmGeo, metalMat);
        drillArm.rotation.x = Math.PI / 2;
        drillArm.position.set(1.8, 2.2, 1.0);
        group.add(drillArm);

        const drillHeadGeo = this.getGeo('cone_0.7_1.8_12', () => new THREE.ConeGeometry(0.7, 1.8, 12));
        const drillHead = new THREE.Mesh(drillHeadGeo, metalMat);
        drillHead.rotation.x = Math.PI / 2;
        drillHead.position.set(1.8, 2.2, 2.4);
        group.add(drillHead);

        // Giant Excavator Shield (Left)
        const shieldGeo = this.getGeo('box_1.6_2.5_0.3', () => new THREE.BoxGeometry(1.6, 2.5, 0.3));
        const shield = new THREE.Mesh(shieldGeo, hazardMat);
        shield.position.set(-1.8, 2.2, 1.2);
        group.add(shield);
        break;
      }

      case 'boss_overlord': {
        // Gothic obsidian throne with cybernetic demon lord, plasma core & floating yellow eyes
        const throneGeo = this.getGeo('box_3.8_4.2_3.2', () => new THREE.BoxGeometry(3.8, 4.2, 3.2));
        const throneMat = this.getMaterial('boss_throne_mat', () => new THREE.MeshStandardMaterial({ color: 0x0f0202, emissive: 0xff1100, emissiveIntensity: 0.5, roughness: 0.2 }));
        const throne = new THREE.Mesh(throneGeo, throneMat);
        throne.position.y = 2.1;
        group.add(throne);

        const bodyGeo = this.getGeo('sph_1.9_16_16', () => new THREE.SphereGeometry(1.9, 16, 16));
        const bodyMat = this.getMaterial('boss_overlord_body', () => new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff0000, emissiveIntensity: 1.0, roughness: 0.2 }));
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 4.8, 0);
        group.add(body);

        const eyeMat = this.getMaterial('yellow_overlord_eye', () => new THREE.MeshBasicMaterial({ color: 0xffff00 }));
        const eyeGeo = this.getGeo('sph_0.22_8_8', () => new THREE.SphereGeometry(0.22, 8, 8));
        const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
        eye1.position.set(-0.55, 5.3, 1.7);
        const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
        eye2.position.set(0.55, 5.3, 1.7);
        group.add(eye1, eye2);
        break;
      }

      case 'boss_ultradoman': {
        // HYPER-REALISTIC ROBO-BOSS ULTRADOMAN (QUADRUPEDAL MECHA GOD)
        // 1. Core Materials & Geometries (Cached for maximum 60+ FPS performance!)
        const roboTex = TextureGenerator.getBossRoboTexture();
        const roboBump = TextureGenerator.getBossRoboBumpTexture();

        // Single Unified Dark Metallic Titanium Armor Material across ALL body panels
        const chassisMat = this.getMaterial('boss_chassis_mat', () => new THREE.MeshStandardMaterial({
          map: roboTex,
          bumpMap: roboBump,
          bumpScale: 0.12,
          roughness: 0.25,
          metalness: 0.85,
        }));

        const darkCarbonMat = this.getMaterial('boss_carbon_mat', () => new THREE.MeshStandardMaterial({
          color: 0x111827,
          roughness: 0.3,
          metalness: 0.7,
        }));

        const chromeMat = this.getMaterial('boss_chrome_mat', () => new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          roughness: 0.1,
          metalness: 0.95,
        }));

        const cyanGlowMat = this.getMaterial('boss_cyan_glow', () => new THREE.MeshBasicMaterial({ color: 0x00ffff }));
        const redGlowMat = this.getMaterial('boss_red_glow', () => new THREE.MeshBasicMaterial({ color: 0xff0044 }));

        const hazardMat = this.getMaterial('boss_hazard_mat', () => new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          roughness: 0.3,
          metalness: 0.5,
        }));

        const noseMat = this.getMaterial('boss_nose_black', () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.15 }));
        const darkEyeMat = this.getMaterial('boss_dark_eye', () => new THREE.MeshStandardMaterial({ color: 0x0a0a0f, roughness: 0.05 }));
        const eyeGlintMat = this.getMaterial('boss_eye_glint', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));
        const whiskerMat = this.getMaterial('boss_whisker', () => new THREE.MeshBasicMaterial({ color: 0x222222 }));
        const clawMat = this.getMaterial('boss_claw_dark', () => new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.3, metalness: 0.5 }));
        const tuskMat = this.getMaterial('boss_tusk_chrome', () => new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.1, metalness: 0.95 }));

        // --- 2. ROBO-DOMAN MECHA BODY CHASSIS & ARMOR ---
        // Main Horizontal Quadrupedal Capsule Torso Body Base at Y = 1.8
        const bodyGeo = this.getGeo('cap_1.1_2.4_14_20', () => {
          const g = new THREE.CapsuleGeometry(1.1, 2.4, 14, 20);
          g.rotateX(Math.PI / 2);
          return g;
        });
        const body = new THREE.Mesh(bodyGeo, chassisMat);
        body.position.set(0, 1.8, 0);
        body.castShadow = true;
        group.add(body);

        // Unified Chest & Belly Armor Cuirass Plate
        const armorPlateGeo = this.getGeo('box_1.8_1.4_0.5', () => new THREE.BoxGeometry(1.8, 1.4, 0.5));
        const armorPlate = new THREE.Mesh(armorPlateGeo, chassisMat);
        armorPlate.position.set(0, 1.9, 0.75);
        group.add(armorPlate);

        // Chest Glowing Reactor Core (Cyan Energy Ring)
        const reactorFrameGeo = this.getGeo('cyl_0.45_0.45_0.2_16', () => new THREE.CylinderGeometry(0.45, 0.45, 0.2, 16));
        const reactorFrame = new THREE.Mesh(reactorFrameGeo, chromeMat);
        reactorFrame.rotation.x = Math.PI / 2;
        reactorFrame.position.set(0, 2.1, 1.02);
        group.add(reactorFrame);

        const reactorCoreGeo = this.getGeo('cyl_0.32_0.32_0.22_16', () => new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16));
        const reactorCore = new THREE.Mesh(reactorCoreGeo, cyanGlowMat);
        reactorCore.rotation.x = Math.PI / 2;
        reactorCore.position.set(0, 2.1, 1.03);
        group.add(reactorCore);

        // Bionic Cybernetic Spine & Vertebrae
        const spineGeo = this.getGeo('box_0.5_2.8_0.5', () => new THREE.BoxGeometry(0.5, 2.8, 0.5));
        const spine = new THREE.Mesh(spineGeo, darkCarbonMat);
        spine.position.set(0, 1.9, -1.05);
        group.add(spine);

        for (let v = 0; v < 6; v++) {
          const vertGeo = this.getGeo('cyl_0.35_0.35_0.15_12', () => new THREE.CylinderGeometry(0.35, 0.35, 0.15, 12));
          const vert = new THREE.Mesh(vertGeo, chromeMat);
          vert.position.set(0, 0.8 + v * 0.45, -1.08);
          group.add(vert);
        }

        // --- 3. BIONIC CYBERNETIC TAIL ("ХВОСТ") ---
        const tailGroup = new THREE.Group();
        tailGroup.position.set(0, 1.5, -1.3);
        for (let t = 0; t < 7; t++) {
          const segGeo = this.getGeo('cyl_0.18_0.14_0.35_10', () => new THREE.CylinderGeometry(0.18, 0.14, 0.35, 10));
          const seg = new THREE.Mesh(segGeo, t % 2 === 0 ? darkCarbonMat : chassisMat);
          seg.position.set(0, -t * 0.12, -t * 0.26);
          seg.rotation.x = -0.3 - t * 0.08;
          tailGroup.add(seg);

          // Glowing Joint Ring on Tail
          const ringGeo = this.getGeo('torus_0.17_0.025_8_12', () => new THREE.TorusGeometry(0.17, 0.025, 8, 12));
          const ring = new THREE.Mesh(ringGeo, cyanGlowMat);
          ring.position.set(0, -t * 0.12, -t * 0.26);
          ring.rotation.x = -0.3 - t * 0.08;
          tailGroup.add(ring);
        }
        // Tail Tip Flame Core
        const tailTipGeo = this.getGeo('cone_0.14_0.35_8', () => new THREE.ConeGeometry(0.14, 0.35, 8));
        const tailTip = new THREE.Mesh(tailTipGeo, redGlowMat);
        tailTip.position.set(0, -0.9, -1.8);
        tailTip.rotation.x = -1.1;
        tailGroup.add(tailTip);
        group.add(tailGroup);

        // --- 4. 4 PROPERLY CONNECTED HYPER-DETAILED MECHA LEGS ("4 ЛАПКИ") WITH HYDRAULICS ---
        // Sockets, Upper Limbs, Knee Joints, Lower Limbs, Piston Shock Absorbers, and Paws
        const jointSocketGeo = this.getGeo('sph_0.45_12_12', () => new THREE.SphereGeometry(0.45, 12, 12));
        const upperLegGeo = this.getGeo('cyl_0.34_0.28_1.2_12', () => new THREE.CylinderGeometry(0.34, 0.28, 1.2, 12));
        const kneeJointGeo = this.getGeo('sph_0.36_12_12', () => new THREE.SphereGeometry(0.36, 12, 12));
        const lowerLegGeo = this.getGeo('cyl_0.28_0.22_1.1_12', () => new THREE.CylinderGeometry(0.28, 0.22, 1.1, 12));
        const pawMainGeo = this.getGeo('box_0.6_0.22_0.8', () => new THREE.BoxGeometry(0.6, 0.22, 0.8));
        const toeGeo = this.getGeo('sph_0.13_10_10', () => new THREE.SphereGeometry(0.13, 10, 10));
        const toeClawGeo = this.getGeo('cone_0.06_0.22_8', () => new THREE.ConeGeometry(0.06, 0.22, 8));

        const pistonCylinderGeo = this.getGeo('cyl_0.08_0.08_0.8_8', () => new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8));
        const pistonShaftGeo = this.getGeo('cyl_0.045_0.045_0.8_8', () => new THREE.CylinderGeometry(0.045, 0.045, 0.8, 8));

        // Leg Positions: Front-Left, Front-Right, Rear-Left, Rear-Right
        const legConfigs = [
          { tag: 'leg_FL', name: 'Front-Left',  x: -1.2, z:  0.8, rotX:  0.22 },
          { tag: 'leg_FR', name: 'Front-Right', x:  1.2, z:  0.8, rotX:  0.22 },
          { tag: 'leg_RL', name: 'Rear-Left',   x: -1.2, z: -0.8, rotX: -0.25 },
          { tag: 'leg_RR', name: 'Rear-Right',  x:  1.2, z: -0.8, rotX: -0.25 },
        ];

        legConfigs.forEach((cfg) => {
          const legGroup = new THREE.Group();
          legGroup.name = cfg.tag; // Named for quadruped walk gait animation!
          legGroup.position.set(cfg.x, 1.8, cfg.z);

          // 1) Shoulder / Hip Heavy Joint Socket attached directly into Torso Body
          const socket = new THREE.Mesh(jointSocketGeo, darkCarbonMat);
          legGroup.add(socket);

          // 2) Upper Leg Limb angled down from socket
          const upper = new THREE.Mesh(upperLegGeo, chassisMat);
          upper.position.set(cfg.x * 0.08, -0.6, cfg.rotX * 0.5);
          upper.rotation.x = cfg.rotX;
          upper.rotation.z = cfg.x > 0 ? -0.15 : 0.15;
          legGroup.add(upper);

          // Hydraulic Piston Shock Absorber along Upper Leg
          const pistonCyl = new THREE.Mesh(pistonCylinderGeo, darkCarbonMat);
          pistonCyl.position.set(cfg.x * 0.12 - 0.1, -0.5, cfg.rotX * 0.5 - 0.15);
          pistonCyl.rotation.x = cfg.rotX;
          const pistonRod = new THREE.Mesh(pistonShaftGeo, chromeMat);
          pistonRod.position.set(cfg.x * 0.12 - 0.1, -0.8, cfg.rotX * 0.5 - 0.25);
          pistonRod.rotation.x = cfg.rotX;
          legGroup.add(pistonCyl, pistonRod);

          // 3) Knee / Elbow Joint Sphere
          const knee = new THREE.Mesh(kneeJointGeo, chromeMat);
          knee.position.set(cfg.x * 0.12, -1.0, cfg.rotX * 0.9);
          legGroup.add(knee);

          // Armor Knee Guard Plate with Hazard Stripe
          const kneeGuardGeo = this.getGeo('box_0.4_0.35_0.25', () => new THREE.BoxGeometry(0.4, 0.35, 0.25));
          const kneeGuard = new THREE.Mesh(kneeGuardGeo, hazardMat);
          kneeGuard.position.set(cfg.x * 0.12, -1.0, cfg.rotX * 0.9 + 0.22);
          legGroup.add(kneeGuard);

          // 4) Lower Leg Shin Limb down to ground
          const lower = new THREE.Mesh(lowerLegGeo, chassisMat);
          lower.position.set(cfg.x * 0.12, -1.45, cfg.rotX * 0.9);
          legGroup.add(lower);

          // 5) Robotic Paw resting flat on the ground (Y = 0)
          const paw = new THREE.Mesh(pawMainGeo, chassisMat);
          paw.position.set(cfg.x * 0.12, -1.69, cfg.rotX * 0.9 + 0.15);
          legGroup.add(paw);

          // 3 Toes with Claws on each Paw
          for (let t = -1; t <= 1; t++) {
            const toe = new THREE.Mesh(toeGeo, chassisMat);
            toe.position.set(cfg.x * 0.12 + t * 0.17, -1.68, cfg.rotX * 0.9 + 0.48);

            const claw = new THREE.Mesh(toeClawGeo, clawMat);
            claw.rotation.x = Math.PI / 2;
            claw.position.set(cfg.x * 0.12 + t * 0.17, -1.7, cfg.rotX * 0.9 + 0.62);
            legGroup.add(toe, claw);
          }

          group.add(legGroup);
        });

        // --- 5. HYPER-DETAILED REALISTIC ROBO-DOMAN HEAD & EYES ---
        const headGroup = new THREE.Group();
        headGroup.position.set(0, 2.7, 1.1);

        // Head Skull & Armor (Unified Chassis Texture)
        const headGeo = this.getGeo('sph_0.85_16_16', () => new THREE.SphereGeometry(0.85, 16, 16));
        const headSkull = new THREE.Mesh(headGeo, chassisMat);
        headGroup.add(headSkull);

        // Armored Forehead Ridge Plate
        const headPlateGeo = this.getGeo('box_0.9_0.3_0.7', () => new THREE.BoxGeometry(0.9, 0.3, 0.7));
        const headPlate = new THREE.Mesh(headPlateGeo, chassisMat);
        headPlate.position.set(0, 0.45, 0.35);
        headPlate.rotation.x = 0.25;
        headGroup.add(headPlate);

        // Soft Snout / Muzzle Cheeks ("МОРДОЧКА") - Unified Chassis Color
        const snoutGeo = this.getGeo('sph_0.45_12_12', () => new THREE.SphereGeometry(0.45, 12, 12));
        const snout = new THREE.Mesh(snoutGeo, chassisMat);
        snout.scale.set(1.25, 0.85, 1.35);
        snout.position.set(0, -0.1, 0.65);
        headGroup.add(snout);

        // Dark Shiny Nose ("НОСИК")
        const noseGeo = this.getGeo('sph_0.14_10_10', () => new THREE.SphereGeometry(0.14, 10, 10));
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.scale.set(1.2, 0.8, 1.0);
        nose.position.set(0, 0.05, 1.15);
        headGroup.add(nose);

        // --- REALISTIC HIGH-TECH CYBERNETIC OPTIC EYES (NO PINK VISOR!) ---
        const eyeSocketGeo = this.getGeo('torus_0.22_0.05_12_16', () => new THREE.TorusGeometry(0.22, 0.05, 12, 16));
        const eyeLensGeo = this.getGeo('sph_0.18_16_16', () => new THREE.SphereGeometry(0.18, 16, 16));
        const pupilGeo = this.getGeo('sph_0.08_12_12', () => new THREE.SphereGeometry(0.08, 12, 12));
        const eyeGlintGeo = this.getGeo('sph_0.05_8_8', () => new THREE.SphereGeometry(0.05, 8, 8));

        [-0.42, 0.42].forEach((ex) => {
          // 1) Chrome Metal Eye Socket Ring
          const socket = new THREE.Mesh(eyeSocketGeo, chromeMat);
          socket.position.set(ex, 0.22, 0.72);
          headGroup.add(socket);

          // 2) Glowing Cyan Optical Iris Lens (Real eye sphere!)
          const iris = new THREE.Mesh(eyeLensGeo, cyanGlowMat);
          iris.position.set(ex, 0.22, 0.74);
          headGroup.add(iris);

          // 3) Deep Black Pupil Core Center
          const pupil = new THREE.Mesh(pupilGeo, darkEyeMat);
          pupil.position.set(ex, 0.22, 0.86);
          headGroup.add(pupil);

          // 4) Specular Glossy Glint
          const glint = new THREE.Mesh(eyeGlintGeo, eyeGlintMat);
          glint.position.set(ex + (ex > 0 ? -0.04 : 0.04), 0.27, 0.89);
          headGroup.add(glint);

          // 5) Laser Sight Micro-Diode below eye
          const diodeGeo = this.getGeo('cyl_0.03_0.03_0.12_8', () => new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8));
          const diode = new THREE.Mesh(diodeGeo, redGlowMat);
          diode.rotation.x = Math.PI / 2;
          diode.position.set(ex, 0.02, 0.82);
          headGroup.add(diode);
        });

        // Whiskers ("УСЫ")
        const whiskerGeo = this.getGeo('cyl_0.008_0.003_0.75_4', () => new THREE.CylinderGeometry(0.008, 0.003, 0.75, 4));
        for (const side of [-1, 1]) {
          for (let w = -1; w <= 1; w++) {
            const whisker = new THREE.Mesh(whiskerGeo, whiskerMat);
            whisker.rotation.z = Math.PI / 2 + side * 0.12;
            whisker.rotation.x = w * 0.16;
            whisker.position.set(side * 0.58, -0.08 + w * 0.06, 0.98);
            headGroup.add(whisker);
          }
        }

        // Cute Ears (Unified Chassis Color)
        const earGeo = this.getGeo('cone_0.22_0.55_10', () => new THREE.ConeGeometry(0.22, 0.55, 10));
        [-0.55, 0.55].forEach((side) => {
          const ear = new THREE.Mesh(earGeo, chassisMat);
          ear.position.set(side, 0.75, 0.2);
          ear.rotation.z = side > 0 ? -0.32 : 0.32;
          headGroup.add(ear);
        });

        // Aviator Cyber Goggles on Forehead
        const goggleFrameGeo = this.getGeo('torus_0.28_0.05_8_16', () => new THREE.TorusGeometry(0.28, 0.05, 8, 16));
        const lensGeo = this.getGeo('cyl_0.22_0.22_0.04_12', () => new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12));
        const goggleLensMat = this.getMaterial('boss_goggle_lens', () => new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.1, metalness: 0.9 }));

        [-0.32, 0.32].forEach((gx) => {
          const frame = new THREE.Mesh(goggleFrameGeo, chromeMat);
          frame.position.set(gx, 0.58, 0.65);

          const lens = new THREE.Mesh(lensGeo, goggleLensMat);
          lens.rotation.x = Math.PI / 2;
          lens.position.set(gx, 0.58, 0.67);

          headGroup.add(frame, lens);
        });

        // --- 6. LOWER JAW WITH ANIMATED MOUTH OPENING & ROBOTIC TUSKS ("РОБО БИВНИ") ---
        const jawGroup = new THREE.Group();
        jawGroup.name = 'boss_mouth_jaw';
        jawGroup.position.set(0, -0.25, 0.2); // Hinge pivot point for mouth opening animation

        const jawGeo = this.getGeo('box_0.9_0.32_0.8', () => new THREE.BoxGeometry(0.9, 0.32, 0.8));
        const jawMesh = new THREE.Mesh(jawGeo, darkCarbonMat);
        jawMesh.position.set(0, 0, 0.25);
        jawGroup.add(jawMesh);

        // Robotic Tusks / Fangs ("РОБО БИВНИ") on Jaw & Upper Mouth
        const tuskGeo = this.getGeo('cone_0.08_0.42_10', () => new THREE.ConeGeometry(0.08, 0.42, 10));
        [-0.32, 0.32].forEach((tx) => {
          // Lower Curved Robotic Tusks on Jaw
          const tuskBot = new THREE.Mesh(tuskGeo, tuskMat);
          tuskBot.position.set(tx, 0.15, 0.55);
          tuskBot.rotation.x = -Math.PI / 6;
          jawGroup.add(tuskBot);

          // Upper Robotic Tusks inside upper mouth
          const tuskTop = new THREE.Mesh(tuskGeo, tuskMat);
          tuskTop.position.set(tx, 0.05, 0.72);
          tuskTop.rotation.x = Math.PI / 1.2;
          headGroup.add(tuskTop);
        });

        headGroup.add(jawGroup);

        // Deployable RPG Launcher Unit inside Mouth Cavity!
        const mouthRpgGroup = new THREE.Group();
        mouthRpgGroup.name = 'mouth_rpg'; // Animate position.z forward when launching rockets!
        mouthRpgGroup.position.set(0, -0.1, 0.2); // Retracted default position

        // Dual Rocket Launcher Barrel Tube
        const rpgTubeGeo = this.getGeo('box_0.65_0.35_0.9', () => new THREE.BoxGeometry(0.65, 0.35, 0.9));
        const rpgTube = new THREE.Mesh(rpgTubeGeo, darkCarbonMat);
        mouthRpgGroup.add(rpgTube);

        // 2 Warhead Rockets inside Launcher Tube
        const rocketGeo = this.getGeo('cyl_0.12_0.12_0.8_12', () => new THREE.CylinderGeometry(0.12, 0.12, 0.8, 12));
        const warheadGeo = this.getGeo('cone_0.12_0.3_12', () => new THREE.ConeGeometry(0.12, 0.3, 12));

        [-0.18, 0.18].forEach((rx) => {
          const rocketBody = new THREE.Mesh(rocketGeo, chromeMat);
          rocketBody.rotation.x = Math.PI / 2;
          rocketBody.position.set(rx, 0, 0.25);

          const warhead = new THREE.Mesh(warheadGeo, redGlowMat);
          warhead.rotation.x = Math.PI / 2;
          warhead.position.set(rx, 0, 0.72);

          mouthRpgGroup.add(rocketBody, warhead);
        });

        headGroup.add(mouthRpgGroup);
        group.add(headGroup);

        // --- 7. LEFT SHOULDER: ROTATING HEAVY MINIGUN ---
        const leftShoulderGroup = new THREE.Group();
        leftShoulderGroup.position.set(-1.45, 2.7, 0);

        // Shoulder Pauldron Armor
        const pauldronGeo = this.getGeo('box_0.9_0.8_1.2', () => new THREE.BoxGeometry(0.9, 0.8, 1.2));
        const leftPauldron = new THREE.Mesh(pauldronGeo, hazardMat);
        leftShoulderGroup.add(leftPauldron);

        // Minigun Housing Base
        const minigunBodyGeo = this.getGeo('box_0.55_0.55_1.3', () => new THREE.BoxGeometry(0.55, 0.55, 1.3));
        const minigunBody = new THREE.Mesh(minigunBodyGeo, darkCarbonMat);
        minigunBody.position.set(-0.35, 0.2, 0.5);
        leftShoulderGroup.add(minigunBody);

        // 6-Barrel Rotating Assembly (named "minigun_barrels" for animation)
        const barrelsGroup = new THREE.Group();
        barrelsGroup.name = 'minigun_barrels';
        barrelsGroup.position.set(-0.35, 0.2, 1.3);

        const barrelGeo = this.getGeo('cyl_0.055_0.055_1.5_8', () => new THREE.CylinderGeometry(0.055, 0.055, 1.5, 8));
        for (let b = 0; b < 6; b++) {
          const angle = (b / 6) * Math.PI * 2;
          const barrel = new THREE.Mesh(barrelGeo, chromeMat);
          barrel.rotation.x = Math.PI / 2;
          barrel.position.set(Math.cos(angle) * 0.18, Math.sin(angle) * 0.18, 0.75);
          barrelsGroup.add(barrel);
        }
        leftShoulderGroup.add(barrelsGroup);

        // Flexible Ammo Feed Belt
        const beltGeo = this.getGeo('box_0.2_0.1_1.2', () => new THREE.BoxGeometry(0.2, 0.1, 1.2));
        const belt = new THREE.Mesh(beltGeo, chromeMat);
        belt.position.set(-0.1, -0.1, -0.1);
        leftShoulderGroup.add(belt);

        group.add(leftShoulderGroup);

        // --- 8. RIGHT SHOULDER: ULTRA FAN 3000 ---
        const rightShoulderGroup = new THREE.Group();
        rightShoulderGroup.position.set(1.45, 2.7, 0);

        // Right Shoulder Pauldron Armor
        const rightPauldron = new THREE.Mesh(pauldronGeo, hazardMat);
        rightShoulderGroup.add(rightPauldron);

        // Heavy Turbine Casing
        const turbineCaseGeo = this.getGeo('cyl_0.75_0.75_0.65_20', () => new THREE.CylinderGeometry(0.75, 0.75, 0.65, 20));
        const turbineCase = new THREE.Mesh(turbineCaseGeo, darkCarbonMat);
        turbineCase.rotation.x = Math.PI / 2;
        turbineCase.position.set(0.35, 0.25, 0.4);
        rightShoulderGroup.add(turbineCase);

        // Glowing Cyan Turbine Interior Heat Exhaust Core
        const turbineCoreGeo = this.getGeo('cyl_0.58_0.58_0.42_16', () => new THREE.CylinderGeometry(0.58, 0.58, 0.42, 16));
        const turbineCore = new THREE.Mesh(turbineCoreGeo, cyanGlowMat);
        turbineCore.rotation.x = Math.PI / 2;
        turbineCore.position.set(0.35, 0.25, 0.38);
        rightShoulderGroup.add(turbineCore);

        // 6-Blade Aerodynamic Rotor Assembly (named "ultrafan_blades" for high-speed continuous spinning!)
        const fanRotorGroup = new THREE.Group();
        fanRotorGroup.name = 'ultrafan_blades';
        fanRotorGroup.position.set(0.35, 0.25, 0.75);

        const bladeGeo = this.getGeo('box_0.14_0.65_0.035', () => new THREE.BoxGeometry(0.14, 0.65, 0.035));
        for (let bl = 0; bl < 6; bl++) {
          const blade = new THREE.Mesh(bladeGeo, chromeMat);
          blade.rotation.z = (bl / 6) * Math.PI * 2;
          blade.position.y = 0.28 * Math.cos((bl / 6) * Math.PI * 2);
          blade.position.x = 0.28 * Math.sin((bl / 6) * Math.PI * 2);
          fanRotorGroup.add(blade);
        }
        rightShoulderGroup.add(fanRotorGroup);

        // Protective Honeycomb Grille Ring
        const grilleRingGeo = this.getGeo('torus_0.72_0.045_12_20', () => new THREE.TorusGeometry(0.72, 0.045, 12, 20));
        const grilleRing = new THREE.Mesh(grilleRingGeo, chromeMat);
        grilleRing.position.set(0.35, 0.25, 0.76);
        rightShoulderGroup.add(grilleRing);

        group.add(rightShoulderGroup);
        break;
      }

      default: {
        const bodyGeo = this.getGeo('box_0.85_1.1_0.65', () => new THREE.BoxGeometry(0.85, 1.1, 0.65));
        const bodyMat = this.getMaterial('default_dark_mob', () => new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xff0000, emissiveIntensity: 0.5 }));
        group.add(new THREE.Mesh(bodyGeo, bodyMat));
        break;
      }
    }

    return group;
  }

  // Helper to build realistic human hands and forearms holding weapons naturally
  private static createRealisticArmAndHand(
    isRightArm: boolean,
    pose: 'grip' | 'forend' | 'pistol_twohand',
    customOffset?: { x: number; y: number; z: number }
  ): THREE.Group {
    const armGroup = new THREE.Group();

    // High-definition Athletic Skin & Muscle Materials
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xd49673, // Warm athletic tanned skin tone
      roughness: 0.58,
      metalness: 0.02,
    });

    const muscleHighlightMat = new THREE.MeshStandardMaterial({
      color: 0xdc9f7d, // Defined muscle crest tone
      roughness: 0.52,
      metalness: 0.0,
    });

    const skinJointMat = new THREE.MeshStandardMaterial({
      color: 0xc18360, // Warm knuckle & flexor crease tone
      roughness: 0.68,
      metalness: 0.0,
    });

    const palmSkinMat = new THREE.MeshStandardMaterial({
      color: 0xe8bca6, // Lighter palm pad tone
      roughness: 0.72,
      metalness: 0.0,
    });

    const veinMat = new THREE.MeshStandardMaterial({
      color: 0xc28666, // Raised vascular vein tone blending into skin
      roughness: 0.45,
      metalness: 0.05,
    });

    const nailMat = new THREE.MeshStandardMaterial({
      color: 0xdbad98, // Clean fingernail tone
      roughness: 0.35,
      metalness: 0.05,
    });

    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c20, // Tactical dark rolled-up sleeve fabric
      roughness: 0.88,
    });

    let palmPos = { x: 0, y: 0, z: 0 };
    let palmRot = { x: 0, y: 0, z: 0 };
    let sleeveStart = { x: 0, y: 0, z: 0 };

    if (isRightArm) {
      palmPos = { x: 0.022, y: -0.102, z: -0.018 };
      palmRot = { x: -0.32, y: -0.08, z: -0.12 };
      sleeveStart = { x: 0.15, y: -0.28, z: 0.25 };
    } else {
      if (pose === 'pistol_twohand') {
        palmPos = { x: -0.012, y: -0.112, z: -0.008 };
        palmRot = { x: -0.28, y: 0.36, z: 0.22 };
        sleeveStart = { x: -0.15, y: -0.28, z: 0.25 };
      } else {
        const offset = customOffset || { x: 0, y: -0.035, z: -0.32 };
        palmPos = { x: offset.x - 0.012, y: offset.y - 0.01, z: offset.z };
        palmRot = { x: 0.16, y: 0.24, z: 0.32 };
        sleeveStart = { x: -0.16, y: -0.25, z: offset.z + 0.38 };
      }
    }

    // 1. Vector setup from sleeve origin to palm junction
    const startVec = new THREE.Vector3(sleeveStart.x, sleeveStart.y, sleeveStart.z);
    const endVec = new THREE.Vector3(palmPos.x, palmPos.y, palmPos.z);
    const dir = new THREE.Vector3().subVectors(endVec, startVec);
    const armLength = dir.length();
    const dirNorm = dir.clone().normalize();

    // Midpoint between sleeve start and palm center
    const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);

    // Quaternion alignment
    const alignQuaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dirNorm
    );

    // Rolled Combat Sleeve Cuff with layered fabric folds
    const sleeveGroup = new THREE.Group();
    const cuff1 = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.05, 0.06, 16), sleeveMat);
    sleeveGroup.add(cuff1);

    const cuffRoll = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.012, 12, 20), sleeveMat);
    cuffRoll.rotation.x = Math.PI / 2;
    cuffRoll.position.y = -0.025;
    sleeveGroup.add(cuffRoll);

    const cuffPos = startVec.clone().add(dir.clone().multiplyScalar(0.12));
    sleeveGroup.position.copy(cuffPos);
    sleeveGroup.quaternion.copy(alignQuaternion);
    armGroup.add(sleeveGroup);

    // 2. Muscular Forearm Geometry
    // Core Tapered Shaft
    const forearmCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.042, armLength * 0.92, 16),
      skinMat
    );
    forearmCore.position.copy(midPoint);
    forearmCore.quaternion.copy(alignQuaternion);
    armGroup.add(forearmCore);

    // Brachioradialis Muscle Belly (Bulging top-outer upper forearm)
    const brachioGroup = new THREE.Group();
    const brachioMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 16, 16),
      muscleHighlightMat
    );
    brachioMesh.scale.set(1.25, 2.6, 0.92);
    brachioGroup.add(brachioMesh);

    const brachioPos = startVec.clone().add(dir.clone().multiplyScalar(0.38));
    const brachioOffset = new THREE.Vector3(isRightArm ? 0.012 : -0.012, 0.012, 0);
    brachioOffset.applyQuaternion(alignQuaternion);
    brachioGroup.position.copy(brachioPos).add(brachioOffset);
    brachioGroup.quaternion.copy(alignQuaternion);
    armGroup.add(brachioGroup);

    // Flexor Muscle Mass (Underbelly forearm thickness)
    const flexorGroup = new THREE.Group();
    const flexorMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.023, 16, 16),
      skinMat
    );
    flexorMesh.scale.set(1.1, 2.4, 0.85);
    flexorGroup.add(flexorMesh);

    const flexorPos = startVec.clone().add(dir.clone().multiplyScalar(0.42));
    const flexorOffset = new THREE.Vector3(0, -0.012, 0);
    flexorOffset.applyQuaternion(alignQuaternion);
    flexorGroup.position.copy(flexorPos).add(flexorOffset);
    flexorGroup.quaternion.copy(alignQuaternion);
    armGroup.add(flexorGroup);

    // Vascular Veins (Raised 3D skin veins along forearm)
    const veinCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(isRightArm ? 0.008 : -0.008, -armLength * 0.35, 0.018),
      new THREE.Vector3(isRightArm ? 0.014 : -0.014, -armLength * 0.1, 0.02),
      new THREE.Vector3(isRightArm ? 0.006 : -0.006, armLength * 0.2, 0.016),
    ]);
    const veinGeo = new THREE.TubeGeometry(veinCurve, 12, 0.0018, 8, false);
    const veinMesh = new THREE.Mesh(veinGeo, veinMat);
    veinMesh.position.copy(midPoint);
    veinMesh.quaternion.copy(alignQuaternion);
    armGroup.add(veinMesh);

    // Anatomical Oval Wrist Joint
    const wristJoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 16, 16),
      skinJointMat
    );
    wristJoint.position.copy(endVec);
    wristJoint.scale.set(1.15, 0.75, 1.2);
    wristJoint.quaternion.copy(alignQuaternion);
    armGroup.add(wristJoint);

    // Ulna Bone Head (Prominent wrist bone knob)
    const wristBone = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 12, 12),
      skinJointMat
    );
    const ulnaOffset = new THREE.Vector3(isRightArm ? 0.015 : -0.015, 0.008, -0.005);
    ulnaOffset.applyQuaternion(alignQuaternion);
    wristBone.position.copy(endVec).add(ulnaOffset);
    armGroup.add(wristBone);

    // Tactical Watch / Wrist HUD on Left Arm
    if (!isRightArm) {
      const watchGroup = new THREE.Group();
      
      // Strap
      const strap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.028, 16),
        new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.7 })
      );
      watchGroup.add(strap);

      // Digital Watch Case
      const watchBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.028, 0.016, 0.028),
        new THREE.MeshStandardMaterial({ color: 0x22242a, metalness: 0.8, roughness: 0.2 })
      );
      watchBody.position.set(0, 0.02, 0);
      watchGroup.add(watchBody);

      // Glowing Tactical Screen
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.02, 0.02),
        new THREE.MeshBasicMaterial({ color: 0x00ffcc })
      );
      screen.rotation.x = -Math.PI / 2;
      screen.position.set(0, 0.029, 0);
      watchGroup.add(screen);

      const watchPos = endVec.clone().sub(dir.clone().multiplyScalar(0.18));
      watchGroup.position.copy(watchPos);
      watchGroup.quaternion.copy(alignQuaternion);
      armGroup.add(watchGroup);
    }

    // 3. Muscular Human Hand Group
    const handGroup = new THREE.Group();
    handGroup.position.set(palmPos.x, palmPos.y, palmPos.z);
    handGroup.rotation.set(palmRot.x, palmRot.y, palmRot.z);

    // Main Muscular Palm Box
    const palmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.030, 0.058), skinMat);
    handGroup.add(palmMesh);

    // Soft Inner Palm Cushion
    const palmPad = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.008, 0.050), palmSkinMat);
    palmPad.position.set(0, -0.014, 0);
    handGroup.add(palmPad);

    // Thenar Eminence (Thumb Base Muscle Pad)
    const thenarPad = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 12), palmSkinMat);
    thenarPad.scale.set(1.2, 0.7, 1.5);
    thenarPad.position.set(isRightArm ? 0.016 : -0.016, -0.008, 0.012);
    handGroup.add(thenarPad);

    // Knuckle Ridge (Back of Hand)
    const knuckleRidge = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.008, 0.02), skinJointMat);
    knuckleRidge.position.set(0, 0.014, -0.012);
    handGroup.add(knuckleRidge);

    // Helper to build realistic 3-jointed finger with nail
    const createFinger = (
      width: number,
      lengths: [number, number, number],
      rotations: [number, number, number],
      hasNail = true
    ) => {
      const fGroup = new THREE.Group();

      // Proximal Phalanx
      const p1 = new THREE.Mesh(
        new THREE.CylinderGeometry(width, width * 0.9, lengths[0], 10),
        skinMat
      );
      p1.rotation.x = rotations[0];
      p1.position.set(0, -lengths[0] * 0.4, -lengths[0] * 0.3);
      fGroup.add(p1);

      // Knuckle Joint 1
      const j1 = new THREE.Mesh(new THREE.SphereGeometry(width * 1.05, 10, 10), skinJointMat);
      j1.position.set(0, -lengths[0] * 0.8, -lengths[0] * 0.6);
      fGroup.add(j1);

      // Middle Phalanx
      const p2 = new THREE.Mesh(
        new THREE.CylinderGeometry(width * 0.88, width * 0.78, lengths[1], 10),
        skinMat
      );
      p2.rotation.x = rotations[1];
      p2.position.set(0, -lengths[0] * 0.8 - lengths[1] * 0.35, -lengths[0] * 0.6 - lengths[1] * 0.45);
      fGroup.add(p2);

      // Knuckle Joint 2
      const j2 = new THREE.Mesh(new THREE.SphereGeometry(width * 0.9, 10, 10), skinJointMat);
      j2.position.set(0, -lengths[0] * 0.8 - lengths[1] * 0.7, -lengths[0] * 0.6 - lengths[1] * 0.85);
      fGroup.add(j2);

      // Distal Phalanx (Fingertip)
      const p3 = new THREE.Mesh(
        new THREE.CylinderGeometry(width * 0.75, width * 0.6, lengths[2], 10),
        skinJointMat
      );
      p3.rotation.x = rotations[2];
      p3.position.set(0, -lengths[0] * 0.8 - lengths[1] * 0.7 - lengths[2] * 0.35, -lengths[0] * 0.6 - lengths[1] * 0.85 - lengths[2] * 0.35);
      fGroup.add(p3);

      // Fingernail
      if (hasNail) {
        const nail = new THREE.Mesh(new THREE.BoxGeometry(width * 1.1, 0.002, lengths[2] * 0.55), nailMat);
        nail.position.set(
          0,
          -lengths[0] * 0.8 - lengths[1] * 0.7 - lengths[2] * 0.35 + width * 0.6,
          -lengths[0] * 0.6 - lengths[1] * 0.85 - lengths[2] * 0.35
        );
        nail.rotation.x = rotations[2];
        fGroup.add(nail);
      }

      return fGroup;
    };

    // 3. Pose Fingers according to hand position
    if (isRightArm) {
      // Index / Trigger Finger (Curled into trigger guard, tip resting on trigger)
      const indexFinger = createFinger(
        0.0055,
        [0.024, 0.018, 0.014],
        [-0.4, -0.9, -1.2]
      );
      indexFinger.position.set(-0.015, 0.004, -0.026);
      indexFinger.rotation.z = -0.15;
      handGroup.add(indexFinger);

      // Middle Finger (Wrapped around upper grip handle)
      const middleFinger = createFinger(
        0.0058,
        [0.026, 0.02, 0.015],
        [-0.8, -1.3, -1.5]
      );
      middleFinger.position.set(-0.005, -0.004, -0.026);
      middleFinger.rotation.z = -0.28;
      handGroup.add(middleFinger);

      // Ring Finger (Wrapped around mid grip handle)
      const ringFinger = createFinger(
        0.0054,
        [0.024, 0.018, 0.014],
        [-0.9, -1.4, -1.6]
      );
      ringFinger.position.set(0.006, -0.008, -0.024);
      ringFinger.rotation.z = -0.32;
      handGroup.add(ringFinger);

      // Pinky Finger (Wrapped around lower grip handle)
      const pinkyFinger = createFinger(
        0.0048,
        [0.02, 0.015, 0.012],
        [-1.0, -1.5, -1.7]
      );
      pinkyFinger.position.set(0.016, -0.012, -0.022);
      pinkyFinger.rotation.z = -0.38;
      handGroup.add(pinkyFinger);

      // Thumb (Posed resting tightly along top left frame/safety)
      const thumbGroup = new THREE.Group();
      thumbGroup.position.set(0.02, 0.008, 0.008);
      const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.006, 0.025, 10), skinMat);
      t1.rotation.set(-0.2, 0.4, -0.5);
      t1.position.set(-0.006, -0.006, -0.01);
      thumbGroup.add(t1);

      const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0058, 0.0048, 0.02, 10), skinJointMat);
      t2.rotation.set(-0.4, 0.6, -0.7);
      t2.position.set(-0.012, -0.012, -0.024);
      thumbGroup.add(t2);

      const tNail = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 0.008), nailMat);
      tNail.position.set(-0.012, -0.008, -0.028);
      thumbGroup.add(tNail);

      handGroup.add(thumbGroup);
    } else if (pose === 'pistol_twohand') {
      // Support hand wrapping around right hand for pistols
      for (let f = 0; f < 4; f++) {
        const finger = createFinger(
          0.0054 - f * 0.0002,
          [0.024 - f * 0.001, 0.018, 0.014],
          [-0.75 - f * 0.05, -1.25, -1.45]
        );
        finger.position.set(-0.015 + f * 0.01, -0.004 - f * 0.002, -0.022);
        finger.rotation.z = 0.22;
        handGroup.add(finger);
      }

      const thumbGroup = new THREE.Group();
      thumbGroup.position.set(-0.018, 0.01, 0.008);
      const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.006, 0.026, 10), skinMat);
      t1.rotation.set(-0.2, -0.4, 0.45);
      t1.position.set(0.006, 0.002, -0.01);
      thumbGroup.add(t1);

      const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0058, 0.0048, 0.02, 10), skinJointMat);
      t2.rotation.set(-0.3, -0.5, 0.6);
      t2.position.set(0.012, -0.002, -0.022);
      thumbGroup.add(t2);

      handGroup.add(thumbGroup);
    } else {
      // Support hand holding forend/pump/rifle handguard
      for (let f = 0; f < 4; f++) {
        const finger = createFinger(
          0.0056 - f * 0.0003,
          [0.025 - f * 0.001, 0.019, 0.014],
          [-0.95 - f * 0.05, -1.35, -1.55]
        );
        finger.position.set(-0.015 + f * 0.01, -0.004 - f * 0.002, -0.022);
        finger.rotation.z = 0.35;
        handGroup.add(finger);
      }

      const thumbGroup = new THREE.Group();
      thumbGroup.position.set(-0.02, 0.01, 0.008);
      const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0068, 0.006, 0.028, 10), skinMat);
      t1.rotation.set(0.2, -0.5, 0.38);
      t1.position.set(0.01, 0.008, -0.012);
      thumbGroup.add(t1);

      const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0058, 0.0048, 0.022, 10), skinJointMat);
      t2.rotation.set(0.3, -0.6, 0.5);
      t2.position.set(0.018, 0.012, -0.024);
      thumbGroup.add(t2);

      handGroup.add(thumbGroup);
    }

    armGroup.add(handGroup);
    return armGroup;
  }

  // Standalone Bare Muscular Human Fist for Heavy Charging & Punching
  public static createBarePunchFist(): THREE.Group {
    const fistGroup = new THREE.Group();

    // Materials
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xd49673, // Athletic warm skin
      roughness: 0.55,
      metalness: 0.02,
    });
    const muscleMat = new THREE.MeshStandardMaterial({
      color: 0xdc9f7d,
      roughness: 0.50,
    });
    const skinJointMat = new THREE.MeshStandardMaterial({
      color: 0xc18360,
      roughness: 0.65,
    });
    const cuffMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c20,
      roughness: 0.88,
    });

    // 1. Rolled Sleeve Cuff at Base
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.07, 16), cuffMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, 0, 0.28);
    fistGroup.add(cuff);

    // 2. Muscular Forearm Shaft
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.044, 0.28, 16), skinMat);
    forearm.rotation.x = Math.PI / 2;
    forearm.position.set(0, -0.01, 0.14);
    fistGroup.add(forearm);

    // Brachioradialis Muscle Bulge
    const brachio = new THREE.Mesh(new THREE.SphereGeometry(0.028, 14, 14), muscleMat);
    brachio.scale.set(1.2, 0.9, 2.2);
    brachio.position.set(-0.012, 0.01, 0.18);
    fistGroup.add(brachio);

    // Tactical Watch on Wrist
    const watchGroup = new THREE.Group();
    const strap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.028, 16),
      new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.7 })
    );
    strap.rotation.x = Math.PI / 2;
    watchGroup.add(strap);

    const watchBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.030, 0.016, 0.030),
      new THREE.MeshStandardMaterial({ color: 0x22242a, metalness: 0.8, roughness: 0.2 })
    );
    watchBody.position.set(0, 0.022, 0);
    watchGroup.add(watchBody);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.022, 0.022),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc })
    );
    screen.rotation.x = -Math.PI / 2;
    screen.position.set(0, 0.031, 0);
    watchGroup.add(screen);

    watchGroup.position.set(0, -0.005, 0.04);
    fistGroup.add(watchGroup);

    // 3. Clenched Fist Block
    const fistBlock = new THREE.Group();
    fistBlock.position.set(0, -0.005, -0.02);

    // Main Palm & Metacarpals Box
    const metacarpalBox = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.042, 0.050), skinMat);
    fistBlock.add(metacarpalBox);

    // Hardened Knuckle Crests (Front Impact Area facing -Z)
    const knuckleGlowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    
    for (let k = 0; k < 4; k++) {
      const knuckleX = -0.018 + k * 0.012;
      const knuckleBall = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 12, 12), skinJointMat);
      knuckleBall.scale.set(1.1, 1.2, 1.1);
      knuckleBall.position.set(knuckleX, 0.008, -0.026);
      fistBlock.add(knuckleBall);

      // Glowing cyber/power line on each knuckle
      const glowNode = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.004), knuckleGlowMat);
      glowNode.position.set(knuckleX, 0.008, -0.032);
      fistBlock.add(glowNode);

      // Curled Finger Segments wrapped tightly into palm
      const fingerFold = new THREE.Group();
      fingerFold.position.set(knuckleX, 0.002, -0.022);

      // Proximal phalanx folded down
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0055, 0.022, 10), skinMat);
      p1.rotation.x = Math.PI / 2.2;
      p1.position.set(0, -0.008, -0.008);
      fingerFold.add(p1);

      // Middle & distal phalanx tucked inward
      const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0048, 0.018, 10), skinJointMat);
      p2.rotation.x = -Math.PI / 3;
      p2.position.set(0, -0.016, 0.002);
      fingerFold.add(p2);

      fistBlock.add(fingerFold);
    }

    // Thumb folded tightly over index and middle fingers
    const thumbFold = new THREE.Group();
    thumbFold.position.set(-0.026, 0.002, -0.005);

    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0068, 0.028, 10), skinMat);
    t1.rotation.set(0.2, 0.4, -Math.PI / 3);
    t1.position.set(0.01, 0.006, -0.01);
    thumbFold.add(t1);

    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0068, 0.0058, 0.022, 10), skinJointMat);
    t2.rotation.set(-0.3, 0.8, -Math.PI / 2);
    t2.position.set(0.022, 0.002, -0.016);
    thumbFold.add(t2);

    fistBlock.add(thumbFold);
    fistGroup.add(fistBlock);

    return fistGroup;
  }

  // --- FIRST PERSON WEAPON MODELS (CS2 PRO QUALITY) ---

  public static createWeaponMesh(type: string): THREE.Group {
    const group = new THREE.Group();
    group.name = `viewmodel_${type}`;

    // Add Right Arm
    const rightArm = this.createRealisticArmAndHand(true, 'grip');
    group.add(rightArm);

    if (type === 'peacemaker') {
      const leftArm = this.createRealisticArmAndHand(false, 'pistol_twohand');
      group.add(leftArm);
      // P-1 PEACEMAKER CHROME HEAVY REVOLVER (CS2 Deagle / Magnum Style)
      const chromeMat = new THREE.MeshStandardMaterial({
        color: 0xfcfcfc,
        map: this.metalTexture,
        metalness: 0.98,
        roughness: 0.03,
      });

      const darkSteelMat = new THREE.MeshStandardMaterial({
        color: 0x121212,
        metalness: 0.95,
        roughness: 0.15,
      });

      const brassMat = new THREE.MeshStandardMaterial({
        color: 0xebbe12,
        metalness: 0.94,
        roughness: 0.18,
      });

      const redDotMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });

      // Fluted Octagonal Heavy Barrel
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.068, 0.42), chromeMat);
      barrel.position.set(0, -0.01, -0.28);
      group.add(barrel);

      // Barrel Under-Weight Rail / Compensator
      const compensator = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.025, 0.14), darkSteelMat);
      compensator.position.set(0, -0.048, -0.42);
      group.add(compensator);

      // Top Vented Heat Rib
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.016, 0.4), chromeMat);
      vent.position.set(0, 0.032, -0.28);
      group.add(vent);

      // 3 Vented slots along top rib
      for (let v = 0; v < 3; v++) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.05), darkSteelMat);
        slot.position.set(0, 0.035, -0.38 + v * 0.1);
        group.add(slot);
      }

      // Front Fiber Optic Sight (CS2 Green Tritium)
      const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.028), darkSteelMat);
      frontSight.position.set(0, 0.048, -0.47);
      group.add(frontSight);

      const fiberDot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003, 0.003, 0.025),
        redDotMat
      );
      fiberDot.rotation.x = Math.PI / 2;
      fiberDot.position.set(0, 0.051, -0.47);
      group.add(fiberDot);

      // Fluted Revolver Cylinder Drum
      const drumGeo = new THREE.CylinderGeometry(0.056, 0.056, 0.15, 16);
      const drum = new THREE.Mesh(drumGeo, darkSteelMat);
      drum.rotation.x = Math.PI / 2;
      drum.position.set(0, -0.01, -0.14);
      group.add(drum);

      // 6 Gold Brass Bullet Tips visible inside cylinder with dark primer centers
      for (let b = 0; b < 6; b++) {
        const angle = (b * Math.PI * 2) / 6;
        const bullet = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 8), brassMat);
        bullet.rotation.x = Math.PI / 2;
        bullet.position.set(Math.cos(angle) * 0.031, -0.01 + Math.sin(angle) * 0.031, -0.14);
        group.add(bullet);
      }

      // Receiver Frame & Ejection Pin Latch
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.095, 0.14), chromeMat);
      frame.position.set(0, -0.02, -0.06);
      group.add(frame);

      const cylinderRelease = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.018, 0.025), darkSteelMat);
      cylinderRelease.position.set(-0.028, 0.01, -0.08);
      group.add(cylinderRelease);

      const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 8, 16), darkSteelMat);
      triggerGuard.position.set(0, -0.07, -0.07);
      group.add(triggerGuard);

      const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.024, 0.012), chromeMat);
      trigger.position.set(0, -0.065, -0.07);
      group.add(trigger);

      // Serrated Hammer
      const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.032, 0.016), darkSteelMat);
      hammer.position.set(0, 0.025, 0.01);
      hammer.rotation.x = -0.4;
      group.add(hammer);

      // Ergonomic Stippled Rubber Grip with Carbon Inlay
      const gripMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 });
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.17, 0.072), gripMat);
      grip.position.set(0, -0.11, 0.0);
      grip.rotation.x = -0.32;
      group.add(grip);

      const carbonInlay = new THREE.Mesh(
        new THREE.BoxGeometry(0.048, 0.1, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x220000, metalness: 0.8, roughness: 0.2 })
      );
      carbonInlay.position.set(0, -0.11, 0.0);
      carbonInlay.rotation.x = -0.32;
      group.add(carbonInlay);

      // CS2 Style Micro Reflex Sight
      const scopeBody = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.048, 0.085), darkSteelMat);
      scopeBody.position.set(0, 0.055, -0.2);
      group.add(scopeBody);

      const glassLens = new THREE.Mesh(
        new THREE.BoxGeometry(0.028, 0.038, 0.004),
        new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.85 })
      );
      glassLens.position.set(0, 0.055, -0.24);
      group.add(glassLens);

      // Underbarrel Laser Sight Module
      const laserBox = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.14), darkSteelMat);
      laserBox.position.set(0, -0.065, -0.28);
      group.add(laserBox);

      const laserLens = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
      laserLens.position.set(0, -0.065, -0.35);
      group.add(laserLens);

      // Muzzle Flash Effect
      const flashGeo = new THREE.ConeGeometry(0.08, 0.25, 8);
      const flashMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0 });
      const flash = new THREE.Mesh(flashGeo, flashMat);
      flash.rotation.x = -Math.PI / 2;
      flash.position.set(0, -0.01, -0.5);
      flash.name = 'muzzle_flash';
      group.add(flash);

      const flashLight = new THREE.PointLight(0xffaa00, 0, 10);
      flashLight.position.copy(flash.position);
      flashLight.name = 'muzzle_light';
      group.add(flashLight);
    } else if (type === 'trembler') {
      // Add Left Arm holding pump forend naturally
      const leftArm = this.createRealisticArmAndHand(false, 'forend', { x: 0, y: -0.032, z: -0.32 });
      group.add(leftArm);

      // SG-8 TREMBLER TACTICAL SHOTGUN (CS2 XM1014 / Benelli M4 / SPAS Tier)
      const steelMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        map: this.metalTexture,
        metalness: 0.96,
        roughness: 0.08,
      });

      const chromeMat = new THREE.MeshStandardMaterial({
        color: 0xeeeeee,
        metalness: 0.98,
        roughness: 0.04,
      });

      const darkMat = new THREE.MeshStandardMaterial({
        color: 0x080808,
        roughness: 0.92,
      });

      const polymerMat = new THREE.MeshStandardMaterial({
        color: 0x181818,
        roughness: 0.7,
      });

      // 1. Slanted Receiver Body with Top Picatinny Rail
      const receiverBase = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.105, 0.22), steelMat);
      receiverBase.position.set(0, -0.005, -0.08);
      group.add(receiverBase);

      // Angled Receiver Back Tang / Stock Adapter
      const receiverBack = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.09, 0.08), steelMat);
      receiverBack.position.set(0, -0.02, 0.05);
      receiverBack.rotation.x = -0.22;
      group.add(receiverBack);

      // Tactical Buffer Tube / Skeleton Stock Mount
      const stockTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 12), steelMat);
      stockTube.rotation.x = Math.PI / 2 + 0.15;
      stockTube.position.set(0, -0.04, 0.14);
      group.add(stockTube);

      const cheekPad = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.05, 0.12), polymerMat);
      cheekPad.position.set(0, -0.02, 0.16);
      cheekPad.rotation.x = -0.15;
      group.add(cheekPad);

      // Ejection Port Cutout & Chrome Shell Elevator / Bolt Carrier
      const ejectPort = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.038, 0.09), chromeMat);
      ejectPort.position.set(0.034, 0.01, -0.08);
      group.add(ejectPort);

      const boltChargingHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.03, 8), chromeMat);
      boltChargingHandle.rotation.z = Math.PI / 2;
      boltChargingHandle.position.set(0.048, 0.015, -0.09);
      group.add(boltChargingHandle);

      // 2. Heavy Dual Shotgun Barrels & Tubular Magazine
      const mainBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.54, 16), steelMat);
      mainBarrel.rotation.x = Math.PI / 2;
      mainBarrel.position.set(0, 0.02, -0.36);
      group.add(mainBarrel);

      const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 16), steelMat);
      magTube.rotation.x = Math.PI / 2;
      magTube.position.set(0, -0.022, -0.34);
      group.add(magTube);

      // Muzzle Choke / Crown
      const muzzleChoke = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.025, 0.04, 16), chromeMat);
      muzzleChoke.rotation.x = Math.PI / 2;
      muzzleChoke.position.set(0, 0.02, -0.62);
      group.add(muzzleChoke);

      // Barrel & Magazine Clamp Ring
      const tubeClamp = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.08, 0.03), darkMat);
      tubeClamp.position.set(0, -0.001, -0.52);
      group.add(tubeClamp);

      // 3. Ghost Ring Sights
      const rearSight = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 8, 16), steelMat);
      rearSight.position.set(0, 0.06, -0.02);
      group.add(rearSight);

      const frontSightPost = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.04, 0.025), steelMat);
      frontSightPost.position.set(0, 0.052, -0.6);
      group.add(frontSightPost);

      const tritiumDot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
      tritiumDot.position.set(0, 0.062, -0.59);
      group.add(tritiumDot);

      // 4. Perforated Heat Shield Shroud with Vent Slots
      const shroud = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.038, 0.32, 16, 1, false, 0, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x0c0c0c, metalness: 0.9, roughness: 0.2 })
      );
      shroud.rotation.x = Math.PI / 2;
      shroud.position.set(0, 0.02, -0.34);
      group.add(shroud);

      for (let v = 0; v < 6; v++) {
        const ventCut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.022), darkMat);
        ventCut.position.set(0, 0.058, -0.44 + v * 0.042);
        group.add(ventCut);
      }

      // 5. Side Shell Saddle (6 Crimson 12G Shells angled in carrier)
      const shellRedMat = new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.2, metalness: 0.1 });
      const capGoldMat = new THREE.MeshStandardMaterial({ color: 0xebbe12, metalness: 0.95, roughness: 0.1 });
      const primerMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.98 });

      const saddleBase = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.08, 0.18), darkMat);
      saddleBase.position.set(0.04, 0.005, -0.08);
      group.add(saddleBase);

      for (let s = 0; s < 6; s++) {
        const shellGroup = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.068, 12), shellRedMat);
        shell.rotation.z = Math.PI / 2;
        shellGroup.add(shell);

        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0102, 0.0102, 0.018, 12), capGoldMat);
        cap.rotation.z = Math.PI / 2;
        cap.position.set(0.03, 0, 0);
        shellGroup.add(cap);

        const primer = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.019, 8), primerMat);
        primer.rotation.z = Math.PI / 2;
        primer.position.set(0.031, 0, 0);
        shellGroup.add(primer);

        shellGroup.position.set(0.048, 0.03 - s * 0.011, -0.14 + s * 0.024);
        shellGroup.rotation.z = -0.15; // Realistic angled shell insertion
        group.add(shellGroup);
      }

      // 6. Ergonomic Tactical Pump Forend with Ridges & M-LOK Slots
      const pumpMat = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.95 });
      const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.22, 16), pumpMat);
      pump.rotation.x = Math.PI / 2;
      pump.position.set(0, -0.022, -0.32);
      group.add(pump);

      // Angled Hand-Stop Flange on pump
      const handStop = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.04, 0.025), darkMat);
      handStop.position.set(0, -0.05, -0.42);
      handStop.rotation.x = -0.3;
      group.add(handStop);

      // 7. Tactical Flashlight / Cyan Laser Combo
      const flashlight = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.14, 12),
        new THREE.MeshStandardMaterial({ color: 0x1c1c1c, metalness: 0.92 })
      );
      flashlight.rotation.x = Math.PI / 2;
      flashlight.position.set(-0.046, 0.01, -0.34);
      group.add(flashlight);

      const lightLens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lightLens.position.set(-0.046, 0.01, -0.411);
      group.add(lightLens);

      // 8. EMP Flashbang Module
      const fbModule = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.18, 16),
        new THREE.MeshStandardMaterial({ color: 0x12061c, emissive: 0x8b5cf6, emissiveIntensity: 0.9 })
      );
      fbModule.rotation.x = Math.PI / 2;
      fbModule.position.set(0, -0.065, -0.3);
      group.add(fbModule);

      // 9. Ergonomic Pistol Grip & Trigger Assembly
      const tGuard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 8, 16), steelMat);
      tGuard.position.set(0, -0.065, -0.08);
      group.add(tGuard);

      const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.024, 0.012), chromeMat);
      trigger.position.set(0, -0.06, -0.08);
      group.add(trigger);

      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.16, 0.068), polymerMat);
      grip.position.set(0, -0.11, -0.02);
      grip.rotation.x = -0.35;
      group.add(grip);

      // Muzzle Flash
      const flashGeo = new THREE.ConeGeometry(0.12, 0.32, 8);
      const flashMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0 });
      const flash = new THREE.Mesh(flashGeo, flashMat);
      flash.rotation.x = -Math.PI / 2;
      flash.position.set(0, 0.02, -0.65);
      flash.name = 'muzzle_flash';
      group.add(flash);

      const flashLight = new THREE.PointLight(0x00ffff, 0, 12);
      flashLight.position.copy(flash.position);
      flashLight.name = 'muzzle_light';
      group.add(flashLight);
    } else if (type === 'punisher') {
      // Add Left Supporting Arm holding foregrip
      const leftArm = this.createRealisticArmAndHand(false, 'forend', { x: 0, y: -0.09, z: -0.42 });
      group.add(leftArm);

      // AR-47 PUNISHER CYBER KALASHNIKOV (CS2 AK-47 / Vulcan / Neon Rider Tier)
      const steelMat = new THREE.MeshStandardMaterial({
        color: 0x0c0c0c,
        map: this.metalTexture,
        metalness: 0.98,
        roughness: 0.06,
      });

      const woodBakeliteMat = new THREE.MeshStandardMaterial({
        color: 0x3d0c02, // Rich dark mahogany wood / bakelite finish
        roughness: 0.28,
        metalness: 0.12,
      });

      const chromeMat = new THREE.MeshStandardMaterial({
        color: 0xf5f5f5,
        metalness: 0.98,
        roughness: 0.04,
      });

      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xebbe12,
        metalness: 0.95,
        roughness: 0.1,
      });

      const darkPolymer = new THREE.MeshStandardMaterial({
        color: 0x141414,
        roughness: 0.8,
      });

      // 1. Stamped Steel AK Receiver with Angular Front Trunnion
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.115, 0.38), steelMat);
      receiver.position.set(0, -0.01, -0.22);
      group.add(receiver);

      // Front Trunnion Block (where barrel connects)
      const trunnion = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.118, 0.08), steelMat);
      trunnion.position.set(0, -0.005, -0.38);
      group.add(trunnion);

      // Slotted Ribbed Steel Dust Cover (Curved top half-cylinder)
      const dustCover = new THREE.Mesh(
        new THREE.CylinderGeometry(0.033, 0.033, 0.32, 16, 1, false, 0, Math.PI),
        steelMat
      );
      dustCover.rotation.x = Math.PI / 2;
      dustCover.position.set(0, 0.048, -0.22);
      group.add(dustCover);

      // Rear Sight Block & Adjustable Leaf Sight
      const rearSightBlock = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.04, 0.07), steelMat);
      rearSightBlock.position.set(0, 0.052, -0.37);
      group.add(rearSightBlock);

      const sightLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.06), steelMat);
      sightLeaf.position.set(0, 0.07, -0.37);
      sightLeaf.rotation.x = -0.1;
      group.add(sightLeaf);

      // 2. Iconic 45-Degree AK Gas Block & Barrel Assembly
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 16), steelMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, -0.005, -0.58);
      group.add(barrel);

      const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.22, 12), chromeMat);
      gasTube.rotation.x = Math.PI / 2;
      gasTube.position.set(0, 0.024, -0.48);
      group.add(gasTube);

      // 45-Degree AK Gas Block Connector
      const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.052, 0.045), steelMat);
      gasBlock.position.set(0, 0.015, -0.57);
      gasBlock.rotation.x = -0.35; // Iconic slanted AK gas block angle!
      group.add(gasBlock);

      // Upper & Lower Mahogany Wood / Bakelite Handguards
      const lowerHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.068, 0.2), woodBakeliteMat);
      lowerHandguard.position.set(0, -0.018, -0.48);
      group.add(lowerHandguard);

      const upperHandguard = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 12, 1, false, 0, Math.PI), woodBakeliteMat);
      upperHandguard.rotation.x = Math.PI / 2;
      upperHandguard.position.set(0, 0.026, -0.48);
      group.add(upperHandguard);

      // Lower Handguard Steel Retaining Cap
      const hgCap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.018), steelMat);
      hgCap.position.set(0, -0.01, -0.58);
      group.add(hgCap);

      // 3. Hooded Front Sight Block & Slanted AK Muzzle Brake
      const frontSightBlock = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.06, 0.028), steelMat);
      frontSightBlock.position.set(0, 0.02, -0.72);
      group.add(frontSightBlock);

      const sightHood = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 12), steelMat);
      sightHood.position.set(0, 0.048, -0.72);
      group.add(sightHood);

      const frontSightPin = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.018, 8), new THREE.MeshBasicMaterial({ color: 0x00ff66 }));
      frontSightPin.position.set(0, 0.046, -0.72);
      group.add(frontSightPin);

      // Iconic Slanted AK-47 Muzzle Brake / Compensator
      const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.07, 12), steelMat);
      muzzleBrake.rotation.x = Math.PI / 2;
      muzzleBrake.position.set(0, -0.005, -0.78);
      group.add(muzzleBrake);

      const brakeCut = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.01, 0.025), chromeMat);
      brakeCut.position.set(0, 0.008, -0.79);
      group.add(brakeCut);

      // 4. ICONIC CURVED BANANA MAGAZINE (30-Round 7.62x39mm Curved Geometry)
      const bananaMagGroup = new THREE.Group();
      const magSegments = 5;
      for (let i = 0; i < magSegments; i++) {
        const seg = new THREE.Mesh(
          new THREE.BoxGeometry(0.042, 0.06, 0.095 - i * 0.003),
          new THREE.MeshStandardMaterial({ color: 0xb00f1f, roughness: 0.25 })
        );
        const segAngle = -0.12 - i * 0.09;
        seg.position.set(0, -i * 0.048, -i * 0.015);
        seg.rotation.x = segAngle;
        bananaMagGroup.add(seg);
      }
      bananaMagGroup.position.set(0, -0.06, -0.22);
      group.add(bananaMagGroup);

      // Steel Magazine Floorplate
      const magBaseplate = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.01, 0.08), steelMat);
      magBaseplate.position.set(0, -0.28, -0.32);
      group.add(magBaseplate);

      // Magazine Release Catch Paddle
      const magCatch = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.032, 0.018), steelMat);
      magCatch.position.set(0, -0.065, -0.17);
      magCatch.rotation.x = 0.35;
      group.add(magCatch);

      // Top Visible Gold Bullet Cartridge in Mag Well
      const topRound = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.052, 8), goldMat);
      topRound.rotation.x = Math.PI / 2;
      topRound.position.set(0, -0.038, -0.22);
      group.add(topRound);

      // 5. Chrome AK Bolt Carrier Assembly & Safety Selector Lever
      const ejectPort = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.028, 0.08), goldMat);
      ejectPort.position.set(0.034, 0.02, -0.22);
      group.add(ejectPort);

      const boltHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.04, 8), chromeMat);
      boltHandle.rotation.z = -Math.PI / 2;
      boltHandle.position.set(0.05, 0.025, -0.2);
      group.add(boltHandle);

      // AK Safety Lever
      const safetyLever = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.018, 0.1), steelMat);
      safetyLever.position.set(-0.034, 0.01, -0.2);
      safetyLever.rotation.z = 0.25;
      group.add(safetyLever);

      // 6. Picatinny Rail & EOTech Cyber Holographic Sight
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.014, 0.42), steelMat);
      rail.position.set(0, 0.062, -0.28);
      group.add(rail);

      const scopeFrame = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.06, 0.11), darkPolymer);
      scopeFrame.position.set(0, 0.098, -0.28);
      group.add(scopeFrame);

      const holoGlass = new THREE.Mesh(
        new THREE.BoxGeometry(0.036, 0.048, 0.004),
        new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.88 })
      );
      holoGlass.position.set(0, 0.098, -0.335);
      group.add(holoGlass);

      const reticleRing = new THREE.Mesh(
        new THREE.RingGeometry(0.008, 0.012, 16),
        new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide })
      );
      reticleRing.position.set(0, 0.098, -0.334);
      group.add(reticleRing);

      // 7. Angled Ergonomic Foregrip & Pistol Grip
      const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.038), darkPolymer);
      foregrip.position.set(0, -0.092, -0.44);
      foregrip.rotation.x = 0.25;
      group.add(foregrip);

      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.15, 0.065), woodBakeliteMat);
      grip.position.set(0, -0.11, -0.06);
      grip.rotation.x = -0.32;
      group.add(grip);

      const tGuard = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 8, 16), steelMat);
      tGuard.position.set(0, -0.065, -0.1);
      group.add(tGuard);

      const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.022, 0.012), chromeMat);
      trigger.position.set(0, -0.06, -0.1);
      group.add(trigger);

      // Muzzle Flash
      const flashGeo = new THREE.ConeGeometry(0.1, 0.3, 8);
      const flashMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0 });
      const flash = new THREE.Mesh(flashGeo, flashMat);
      flash.rotation.x = -Math.PI / 2;
      flash.position.set(0, -0.005, -0.82);
      flash.name = 'muzzle_flash';
      group.add(flash);

      const flashLight = new THREE.PointLight(0xff3300, 0, 10);
      flashLight.position.copy(flash.position);
      flashLight.name = 'muzzle_light';
      group.add(flashLight);
    } else if (type === 'grapple') {
      // WRIST GRAPPLE GAUNTLET
      const gauntletMat = new THREE.MeshStandardMaterial({
        color: 0x121212,
        map: this.metalTexture,
        metalness: 0.96,
        roughness: 0.1,
      });

      const gauntlet = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.28), gauntletMat);
      gauntlet.position.set(0, -0.04, -0.22);
      group.add(gauntlet);

      // Hydraulic Side Pistons
      for (let side = -1; side <= 1; side += 2) {
        const piston = new THREE.Mesh(
          new THREE.CylinderGeometry(0.008, 0.008, 0.22, 8),
          new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.98 })
        );
        piston.rotation.x = Math.PI / 2;
        piston.position.set(side * 0.075, -0.03, -0.22);
        group.add(piston);
      }

      // Glowing Plasma Reactor Core
      const coreGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.055, 12);
      const coreMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.0 });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.rotation.z = Math.PI / 2;
      core.position.set(0, 0.025, -0.22);
      group.add(core);

      // Glowing Power Cables
      const cableMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26), cableMat);
      cable.rotation.x = Math.PI / 2;
      cable.position.set(0, 0.015, -0.22);
      group.add(cable);

      // 4 Titanium Grapple Harpoon Claws with Barbed Hooks
      for (let c = 0; c < 4; c++) {
        const prong = new THREE.Mesh(
          new THREE.ConeGeometry(0.022, 0.18, 4),
          new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.98, roughness: 0.05 })
        );
        prong.rotation.x = Math.PI / 2;
        const angle = (c * Math.PI * 2) / 4;
        prong.position.set(Math.cos(angle) * 0.048, -0.04 + Math.sin(angle) * 0.048, -0.38);
        group.add(prong);
      }
    }

    return group;
  }

  // --- 3D STANDALONE GRAPPLE HOOK PROJECTILE MESH ---
  public static createGrappleHookMesh(): THREE.Group {
    const group = new THREE.Group();
    group.scale.set(1.8, 1.8, 1.8);

    // PERF/LEAK: shared cached geometry/materials. This factory used to allocate 11 fresh
    // geometries + 11 fresh materials per grapple press (0.5 s cooldown!) and nothing ever
    // disposed them once the hook retracted.
    // Central metallic spindle shaft
    const shaft = new THREE.Mesh(
      this.getGeo('grapple:shaft', () => new THREE.CylinderGeometry(0.06, 0.08, 0.5, 12)),
      this.getMaterial('grapple:shaft', () => new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.95, roughness: 0.15 }))
    );
    shaft.rotation.x = Math.PI / 2;
    group.add(shaft);

    // Rear cable attachment anchor ring
    const ring = new THREE.Mesh(
      this.getGeo('grapple:ring', () => new THREE.TorusGeometry(0.1, 0.025, 8, 16)),
      this.getMaterial('grapple:ring', () => new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.9 }))
    );
    ring.position.z = 0.25;
    group.add(ring);

    // Dark metallic core sphere
    const core = new THREE.Mesh(
      this.getGeo('grapple:core', () => new THREE.SphereGeometry(0.1, 12, 12)),
      this.getMaterial('grapple:core', () => new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9, roughness: 0.2 }))
    );
    group.add(core);

    // 4 Curved Steel Claws / Prongs angled outward
    const armGeo = this.getGeo('grapple:arm', () => new THREE.BoxGeometry(0.03, 0.03, 0.25));
    const armMat = this.getMaterial('grapple:arm', () => new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.92, roughness: 0.2 }));
    const tipGeo = this.getGeo('grapple:tip', () => new THREE.ConeGeometry(0.04, 0.18, 4));
    const tipMat = this.getMaterial('grapple:tip', () => new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.95, roughness: 0.15 }));
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI * 2) / 4;
      const prongGroup = new THREE.Group();
      prongGroup.rotation.z = angle;

      // Base arm spreading out
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.position.set(0, 0.1, -0.1);
      arm.rotation.x = -0.35; // Angle outward

      // Sharp barbed hook tip pointing forward
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.set(0, 0.14, -0.25);
      tip.rotation.x = Math.PI / 2 + 0.2; // Curve inwards slightly

      prongGroup.add(arm, tip);
      group.add(prongGroup);
    }

    return group;
  }

  public static createGrappleCableLine(): THREE.Line {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)];
    // Geometry stays per-instance (its position attribute is mutated every frame while
    // the hook flies); the material is shared.
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = this.getMaterial('grapple:cable', () => new THREE.LineBasicMaterial({
      color: 0xaaaaaa,
      linewidth: 3,
    }));
    return new THREE.Line(geometry, material);
  }

  public static createFlashbangGrenadeMesh(): THREE.Group {
    const group = new THREE.Group();

    // PERF/LEAK: shared cached geometry/materials (was ~10 fresh geo + mat per throw,
    // never disposed). Only one grenade is airborne at a time, so even the animated LED
    // material can be shared safely.
    // Steel Canister Body
    const body = new THREE.Mesh(
      this.getGeo('flashbang:body', () => new THREE.CylinderGeometry(0.09, 0.09, 0.32, 16)),
      this.getMaterial('flashbang:body', () => new THREE.MeshStandardMaterial({ color: 0x4a4a5a, metalness: 0.8, roughness: 0.3 }))
    );
    group.add(body);

    // Purple / Warning Stripes around center
    const stripe = new THREE.Mesh(
      this.getGeo('flashbang:stripe', () => new THREE.CylinderGeometry(0.092, 0.092, 0.10, 16)),
      this.getMaterial('flashbang:stripe', () => new THREE.MeshStandardMaterial({ color: 0x8b5cf6, emissive: 0x6d28d9, emissiveIntensity: 0.6, metalness: 0.5 }))
    );
    group.add(stripe);

    // Metal Top Cap & Fuse Pin Mechanism
    const cap = new THREE.Mesh(
      this.getGeo('flashbang:cap', () => new THREE.CylinderGeometry(0.06, 0.08, 0.08, 12)),
      this.getMaterial('flashbang:cap', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.2 }))
    );
    cap.position.y = 0.18;
    group.add(cap);

    // Safety Pin Pull Ring
    const ring = new THREE.Mesh(
      this.getGeo('flashbang:ring', () => new THREE.TorusGeometry(0.035, 0.008, 8, 12)),
      this.getMaterial('flashbang:ring', () => new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95 }))
    );
    ring.position.set(0.06, 0.21, 0);
    ring.rotation.y = Math.PI / 2;
    group.add(ring);

    // Glowing Blinking Fuse LED Top Dot
    const led = new THREE.Mesh(
      this.getGeo('flashbang:led', () => new THREE.SphereGeometry(0.025, 8, 8)),
      this.getMaterial('flashbang:led', () => new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true }))
    );
    led.name = 'flashbang_led';
    led.position.set(0, 0.23, 0);
    group.add(led);

    return group;
  }

  public static createIceBlock(type: EnemyType): THREE.Group {
    const group = new THREE.Group();

    let width = 1.6;
    let height = 2.2;
    let depth = 1.6;
    let posY = 1.0;

    if (type === 'boss_goliath') { width = 4.2; height = 5.8; depth = 3.6; posY = 2.7; }
    else if (type === 'boss_worm') { width = 3.8; height = 3.8; depth = 12.0; posY = 1.8; }
    else if (type === 'boss_miner') { width = 4.5; height = 4.8; depth = 3.5; posY = 2.2; }
    else if (type === 'boss_overlord') { width = 5.2; height = 6.2; depth = 4.2; posY = 3.0; }
    else if (type === 'boss_ultradoman') { width = 3.2; height = 4.8; depth = 3.2; posY = 2.4; }
    else if (type === 'drone' || type === 'winged_doman') { width = 2.0; height = 2.0; depth = 2.0; posY = 0.0; }
    else if (type === 'skeleton_doman' || type === 'centipede' || type === 'worm') { width = 2.0; height = 2.4; depth = 2.0; posY = 1.1; }

    const iceGeo = new THREE.BoxGeometry(width, height, depth);
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });
    const iceCube = new THREE.Mesh(iceGeo, iceMat);
    iceCube.position.y = posY;
    group.add(iceCube);

    const wireGeo = new THREE.BoxGeometry(width + 0.06, height + 0.06, depth + 0.06);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
    const wireCube = new THREE.Mesh(wireGeo, wireMat);
    wireCube.position.y = posY;
    group.add(wireCube);

    const spikeGeo = new THREE.ConeGeometry(width * 0.18, height * 0.35, 6);
    const spikeMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85,
    });

    const spikePositions = [
      [width * 0.45, posY + height * 0.2, depth * 0.45, 0.4, 0.4],
      [-width * 0.45, posY - height * 0.2, -depth * 0.45, -0.4, -0.4],
      [width * 0.4, posY - height * 0.3, -depth * 0.4, 0.5, -0.3],
      [-width * 0.4, posY + height * 0.3, depth * 0.4, -0.5, 0.3],
    ];

    for (const [sx, sy, sz, rx, rz] of spikePositions) {
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.set(sx, sy, sz);
      spike.rotation.set(rx, 0, rz);
      group.add(spike);
    }

    return group;
  }
}


