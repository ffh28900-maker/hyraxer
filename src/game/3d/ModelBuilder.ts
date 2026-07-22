import * as THREE from 'three';
import { EnemyType } from '../../types';
import { TextureGenerator } from './TextureGenerator';

export class ModelBuilder {
  private static metalTexture = TextureGenerator.getMetalArmorTexture();

  private static createEmissiveMaterial(color: number, emissiveColor: number, emissiveIntensity: number = 0.5) {
    return new THREE.MeshStandardMaterial({
      color,
      map: this.metalTexture,
      emissive: emissiveColor,
      emissiveIntensity,
      roughness: 0.25,
      metalness: 0.85,
    });
  }

  // --- ENEMY 3D MODELS ---

  public static createEnemyMesh(type: EnemyType): THREE.Group {
    const group = new THREE.Group();

    switch (type) {
      case 'robo_doman': {
        // Detailed Cyber Doman
        const bodyGeo = new THREE.BoxGeometry(0.85, 1.1, 0.65);
        const bodyMat = this.createEmissiveMaterial(0x222222, 0xff1100, 0.4);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.7;
        body.castShadow = true;
        group.add(body);

        // Armor Plate
        const armorGeo = new THREE.BoxGeometry(0.7, 0.6, 0.2);
        const armor = new THREE.Mesh(armorGeo, new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.9 }));
        armor.position.set(0, 0.75, 0.35);
        group.add(armor);

        // Head with ears
        const headGeo = new THREE.SphereGeometry(0.42, 16, 16);
        const headMat = this.createEmissiveMaterial(0x333333, 0xff0000, 0.7);
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.45;
        head.castShadow = true;
        group.add(head);

        // Glowing Visor
        const visorGeo = new THREE.BoxGeometry(0.55, 0.16, 0.2);
        const visorMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 1.45, 0.32);
        group.add(visor);

        // Robotic Ears
        const earGeo = new THREE.ConeGeometry(0.12, 0.55, 8);
        const earMat = this.createEmissiveMaterial(0x111111, 0xff0000, 0.3);
        const ear1 = new THREE.Mesh(earGeo, earMat);
        ear1.position.set(-0.28, 1.88, 0);
        ear1.rotation.z = -0.25;
        const ear2 = new THREE.Mesh(earGeo, earMat);
        ear2.position.set(0.28, 1.88, 0);
        ear2.rotation.z = 0.25;
        group.add(ear1, ear2);

        // Steel Limbs with Shoulder Pads
        const padGeo = new THREE.BoxGeometry(0.3, 0.2, 0.3);
        const padMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9 });
        const p1 = new THREE.Mesh(padGeo, padMat);
        p1.position.set(-0.55, 1.1, 0);
        const p2 = new THREE.Mesh(padGeo, padMat);
        p2.position.set(0.55, 1.1, 0);
        group.add(p1, p2);

        const armGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.75, 12);
        const armMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.95 });
        const leftArm = new THREE.Mesh(armGeo, armMat);
        leftArm.position.set(-0.55, 0.7, 0);
        const rightArm = new THREE.Mesh(armGeo, armMat);
        rightArm.position.set(0.55, 0.7, 0);
        group.add(leftArm, rightArm);
        break;
      }

      case 'doman_sniper': {
        // High-tech Sniper
        const bodyGeo = new THREE.CylinderGeometry(0.32, 0.22, 1.5, 12);
        const bodyMat = this.createEmissiveMaterial(0x0a0a1a, 0x0088ff, 0.5);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.95;
        group.add(body);

        // Head with large optic scope lens
        const headGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
        const headMat = this.createEmissiveMaterial(0x1a1a2e, 0x00ffff, 0.9);
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.85;
        group.add(head);

        // Scope Lens
        const lensGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16);
        const lensMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        const lens = new THREE.Mesh(lensGeo, lensMat);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 1.85, 0.25);
        group.add(lens);

        // Long Precision Rifle
        const rifleGeo = new THREE.BoxGeometry(0.12, 0.12, 1.8);
        const rifleMat = new THREE.MeshStandardMaterial({ color: 0x080808, metalness: 0.95, roughness: 0.1 });
        const rifle = new THREE.Mesh(rifleGeo, rifleMat);
        rifle.position.set(0.3, 1.25, 0.5);
        group.add(rifle);
        break;
      }

      case 'drone': {
        // Floating Scout Drone with rotating ring
        const coreGeo = new THREE.SphereGeometry(0.5, 20, 20);
        const coreMat = this.createEmissiveMaterial(0x222222, 0xffaa00, 0.8);
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.y = 1.3;
        group.add(core);

        const ringGeo = new THREE.TorusGeometry(0.75, 0.05, 12, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = 1.3;
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
        break;
      }

      case 'centipede': {
        // Multi-segmented crawler
        for (let i = 0; i < 6; i++) {
          const segGeo = new THREE.SphereGeometry(0.38 - i * 0.04, 12, 12);
          const segMat = this.createEmissiveMaterial(0x122412, 0x00ff44, 0.6);
          const seg = new THREE.Mesh(segGeo, segMat);
          seg.position.set(0, 0.42, -i * 0.45);
          group.add(seg);
        }
        break;
      }

      case 'worm': {
        const bodyGeo = new THREE.CylinderGeometry(0.65, 0.85, 2.4, 16);
        const bodyMat = this.createEmissiveMaterial(0x261226, 0xcc00ff, 0.6);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.2;
        group.add(body);
        break;
      }

      case 'doman_dynamiter': {
        // Suicide Doman with glowing TNT
        const bodyGeo = new THREE.SphereGeometry(0.5, 16, 16);
        const bodyMat = this.createEmissiveMaterial(0xff2200, 0xff0000, 0.9);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.65;
        group.add(body);

        // TNT Bundle
        const tntGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.7);
        const tntMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
        for (let b = 0; b < 4; b++) {
          const tnt = new THREE.Mesh(tntGeo, tntMat);
          tnt.position.set(-0.2 + b * 0.13, 0.75, -0.45);
          group.add(tnt);
        }
        break;
      }

      case 'imp_doman': {
        // Fiery Hell Imp
        const bodyGeo = new THREE.ConeGeometry(0.55, 1.3, 8);
        const bodyMat = this.createEmissiveMaterial(0x380000, 0xff3300, 0.9);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.65;
        group.add(body);

        const hornGeo = new THREE.ConeGeometry(0.1, 0.45, 6);
        const hornMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
        const h1 = new THREE.Mesh(hornGeo, hornMat);
        h1.position.set(-0.22, 1.35, 0);
        h1.rotation.z = -0.3;
        const h2 = new THREE.Mesh(hornGeo, hornMat);
        h2.position.set(0.22, 1.35, 0);
        h2.rotation.z = 0.3;
        group.add(h1, h2);
        break;
      }

      case 'skeleton_doman': {
        // Bone warrior
        const bodyGeo = new THREE.CylinderGeometry(0.28, 0.22, 1.3, 10);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.75;
        group.add(body);

        const shieldGeo = new THREE.BoxGeometry(1.0, 1.3, 0.12);
        const shieldMat = this.createEmissiveMaterial(0x2b1500, 0xffaa00, 0.4);
        const shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.position.set(0, 0.85, 0.45);
        group.add(shield);
        break;
      }

      // --- BOSSES ---
      case 'boss_goliath': {
        // 5m Goliath Mech with rotating minigun
        const bodyGeo = new THREE.BoxGeometry(2.8, 3.5, 2.2);
        const bodyMat = this.createEmissiveMaterial(0x181818, 0xff2200, 0.7);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 2.7;
        body.castShadow = true;
        group.add(body);

        const headGeo = new THREE.BoxGeometry(1.4, 0.9, 1.2);
        const headMat = this.createEmissiveMaterial(0x0a0a0a, 0xff0000, 1.0);
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 4.6, 0.2);
        group.add(head);

        // Left Minigun
        const gunGeo = new THREE.CylinderGeometry(0.45, 0.45, 2.8, 16);
        const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.95 });
        const gun = new THREE.Mesh(gunGeo, gunMat);
        gun.rotation.x = Math.PI / 2;
        gun.position.set(-2.0, 3.4, 1.1);
        group.add(gun);
        break;
      }

      case 'boss_worm': {
        for (let i = 0; i < 9; i++) {
          const r = 1.3 - i * 0.08;
          const segGeo = new THREE.CylinderGeometry(r, r, 1.6, 16);
          const segMat = this.createEmissiveMaterial(0x221122, 0xaa00ff, 0.7);
          const seg = new THREE.Mesh(segGeo, segMat);
          seg.position.set(0, 1.6, -i * 1.4);
          group.add(seg);
        }
        const riderGeo = new THREE.SphereGeometry(0.65, 12, 12);
        const riderMat = this.createEmissiveMaterial(0xff0055, 0xff0000, 1.0);
        const rider = new THREE.Mesh(riderGeo, riderMat);
        rider.position.set(0, 3.0, -1.0);
        rider.name = 'weakspot_rider';
        group.add(rider);
        break;
      }

      case 'boss_miner': {
        const bodyGeo = new THREE.BoxGeometry(2.4, 3.0, 2.0);
        const bodyMat = this.createEmissiveMaterial(0x38220f, 0xff6600, 0.7);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 2.2;
        group.add(body);
        break;
      }

      case 'boss_overlord': {
        const throneGeo = new THREE.BoxGeometry(3.8, 4.2, 3.2);
        const throneMat = this.createEmissiveMaterial(0x0f0202, 0xff1100, 0.5);
        const throne = new THREE.Mesh(throneGeo, throneMat);
        throne.position.y = 2.1;
        group.add(throne);

        const bodyGeo = new THREE.SphereGeometry(1.9, 20, 20);
        const bodyMat = this.createEmissiveMaterial(0x400000, 0xff0000, 1.0);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 4.8, 0);
        group.add(body);

        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), eyeMat);
        eye1.position.set(-0.55, 5.3, 1.7);
        const eye2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), eyeMat);
        eye2.position.set(0.55, 5.3, 1.7);
        group.add(eye1, eye2);
        break;
      }

      case 'boss_ultradoman': {
        const bodyGeo = new THREE.CylinderGeometry(0.45, 0.35, 3.0, 20);
        const bodyMat = this.createEmissiveMaterial(0xffffff, 0x00ffff, 1.0);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.5;
        group.add(body);

        const haloGeo = new THREE.TorusGeometry(0.9, 0.06, 16, 36);
        const haloMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.set(0, 3.2, 0);
        halo.rotation.x = Math.PI / 2;
        group.add(halo);
        break;
      }

      default: {
        const bodyGeo = new THREE.BoxGeometry(0.85, 1.1, 0.65);
        const bodyMat = this.createEmissiveMaterial(0x333333, 0xff0000, 0.5);
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
}

