import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { WeaponId } from '../types';

export class PlayerEngine {
  public camera: THREE.PerspectiveCamera;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;

  // Stats
  public hp: number = 100;
  public maxHp: number = 100;
  public isDead: boolean = false;

  // Dash (3 charges, 0.8s recharge each)
  public dashCharges: number = 3;
  public maxDashCharges: number = 3;
  private dashRechargeTimers: number[] = [0, 0, 0];
  public isDashing: boolean = false;
  private dashTime: number = 0;

  // Slide
  public isSliding: boolean = false;

  // Jump & Wall Kick
  public isGrounded: boolean = false;
  public jumpCount: number = 0;
  public maxJumps: number = 2;
  public isNearWall: boolean = false;
  public wallNormal: THREE.Vector3 = new THREE.Vector3();

  // Ground Pound / Slam
  public isGroundPounding: boolean = false;

  // HVB Charged Punch (Key F)
  public hvbCooldown: number = 0;
  public maxHvbCd: number = 0.1; // Minimal cooldown (0.1s)
  public isChargingPunch: boolean = false;
  public punchChargeTimer: number = 0;
  public punchChargeRatio: number = 0;
  public maxPunchChargeTime: number = 0.25; // Super fast 0.25s full charge

  // Grapple Hook (Key Q)
  public grappleCooldown: number = 0;
  public maxGrappleCd: number = 3.0;
  public isGrappling: boolean = false;
  public grappleTargetPoint: THREE.Vector3 | null = null;

  // Weapons & Skills
  public currentWeapon: WeaponId = 'peacemaker';
  public unlockedWeapons: Record<WeaponId, boolean> = {
    peacemaker: true,
    trembler: false,
    punisher: false,
    grapple: false,
  };

  // Skill CDs
  public coinCd: number = 0; // 4s
  public flashbangCd: number = 0; // 8s
  public berserkCd: number = 0; // 25s
  public isBerserkActive: boolean = false;
  public berserkTimer: number = 0;

  // Flashbang overlay
  public flashbangIntensity: number = 0;

  // Controls input state
  public moveInput = { forward: false, backward: false, left: false, right: false };
  public mouseDelta = { x: 0, y: 0 };
  public sensitivity: number = 0.002;

  // Camera pitch/yaw
  public pitch: number = 0;
  public yaw: number = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.01, 1000);
    this.position = new THREE.Vector3(0, 1.8, 5);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.camera.position.copy(this.position);
  }

  public reset(spawnPos: THREE.Vector3) {
    this.hp = 100;
    this.isDead = false;
    this.position.copy(spawnPos);
    this.velocity.set(0, 0, 0);
    this.dashCharges = 3;
    this.dashRechargeTimers = [0, 0, 0];
    this.isDashing = false;
    this.isSliding = false;
    this.isGroundPounding = false;
    this.isGrappling = false;
    this.grappleTargetPoint = null;
    this.hvbCooldown = 0;
    this.isChargingPunch = false;
    this.punchChargeTimer = 0;
    this.punchChargeRatio = 0;
    this.coinCd = 0;
    this.flashbangCd = 0;
    this.berserkCd = 0;
    this.isBerserkActive = false;
    this.pitch = 0;
    this.yaw = 0;
    this.camera.position.copy(this.position);
  }

  public update(delta: number, sceneObjects: THREE.Object3D[]): {
    groundPoundShockwave?: THREE.Vector3;
    hvbPunch?: boolean;
    flashbangGrenade?: boolean;
    coinToss?: boolean;
  } {
    if (this.isDead) return {};

    const actionsTriggered: {
      groundPoundShockwave?: THREE.Vector3;
      hvbPunch?: boolean;
      flashbangGrenade?: boolean;
      coinToss?: boolean;
    } = {};

    // 1. Recharge Dash Charges (0.8s each)
    for (let i = 0; i < 3; i++) {
      if (this.dashRechargeTimers[i] > 0) {
        this.dashRechargeTimers[i] -= delta;
        if (this.dashRechargeTimers[i] <= 0) {
          this.dashRechargeTimers[i] = 0;
          if (this.dashCharges < 3) this.dashCharges++;
        }
      }
    }

    // Cooldowns tick
    if (this.hvbCooldown > 0) this.hvbCooldown -= delta;
    if (this.grappleCooldown > 0) this.grappleCooldown -= delta;
    if (this.coinCd > 0) this.coinCd -= delta;
    if (this.flashbangCd > 0) this.flashbangCd -= delta;
    if (this.berserkCd > 0) this.berserkCd -= delta;

    // Punch Charge Logic
    if (this.isChargingPunch) {
      this.punchChargeTimer = Math.min(this.maxPunchChargeTime, this.punchChargeTimer + delta);
      this.punchChargeRatio = this.punchChargeTimer / this.maxPunchChargeTime;
    } else {
      this.punchChargeTimer = 0;
      this.punchChargeRatio = 0;
    }

    if (this.isBerserkActive) {
      this.berserkTimer -= delta;
      if (this.berserkTimer <= 0) {
        this.isBerserkActive = false;
      }
    }

    if (this.flashbangIntensity > 0) {
      this.flashbangIntensity -= delta * 1.5;
    }

    // 2. Camera Rotation
    this.yaw -= this.mouseDelta.x * this.sensitivity;
    this.pitch -= this.mouseDelta.y * this.sensitivity;
    this.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch));
    this.mouseDelta = { x: 0, y: 0 };

    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Direction Vectors
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    // WASD Input Vector
    const moveDir = new THREE.Vector3();
    if (this.moveInput.forward) moveDir.add(forward);
    if (this.moveInput.backward) moveDir.sub(forward);
    if (this.moveInput.right) moveDir.add(right);
    if (this.moveInput.left) moveDir.sub(right);
    moveDir.normalize();

    // 3. Ground Pound Plunge Physics
    if (this.isGroundPounding) {
      this.velocity.y = -45; // Rapid purple streak downward slam
      this.position.y += this.velocity.y * delta;

      if (this.position.y <= 1.8) {
        this.position.y = 1.8;
        this.isGroundPounding = false;
        this.isGrounded = true;
        this.velocity.set(0, 0, 0);
        AudioEngine.playGroundPoundSlam();
        actionsTriggered.groundPoundShockwave = this.position.clone();
      }
      this.camera.position.copy(this.position);
      return actionsTriggered;
    }

    // 4. Grapple Reel Physics
    if (this.isGrappling && this.grappleTargetPoint) {
      const pullDir = new THREE.Vector3().subVectors(this.grappleTargetPoint, this.position).normalize();
      this.velocity.addScaledVector(pullDir, 60 * delta);
      if (this.position.distanceTo(this.grappleTargetPoint) < 2.0) {
        this.isGrappling = false;
        this.grappleTargetPoint = null;
      }
    }

    // 5. Standard Physics & Acceleration
    const accel = this.isGrounded ? (this.isSliding ? 15 : 45) : 25;
    const friction = this.isGrounded ? (this.isSliding ? 0.98 : 0.85) : 0.96;

    if (moveDir.lengthSq() > 0 && !this.isDashing) {
      const targetSpeed = this.isSliding ? 22 : 14;
      this.velocity.x += moveDir.x * accel * delta;
      this.velocity.z += moveDir.z * accel * delta;
    }

    // Apply friction
    this.velocity.x *= Math.pow(friction, delta * 60);
    this.velocity.z *= Math.pow(friction, delta * 60);

    // Gravity
    if (!this.isGrounded && !this.isDashing) {
      this.velocity.y -= 32 * delta;
    }

    // Move Player
    this.position.addScaledVector(this.velocity, delta);

    // Ground check
    if (this.position.y <= 1.8) {
      this.position.y = 1.8;
      this.velocity.y = 0;
      this.isGrounded = true;
      this.jumpCount = 0;
    } else {
      this.isGrounded = false;
    }

    // Slide Height Adjustment
    const targetCamHeight = this.isSliding ? 1.0 : 1.8;
    this.camera.position.set(this.position.x, this.position.y - (1.8 - targetCamHeight), this.position.z);

    // Raycast Wall Check for Wall Kick
    this.checkWalls(sceneObjects);

    return actionsTriggered;
  }

  private checkWalls(sceneObjects: THREE.Object3D[]) {
    this.isNearWall = false;
    if (!sceneObjects || sceneObjects.length === 0) return;

    const raycaster = new THREE.Raycaster();
    raycaster.camera = this.camera; // Required by Three.js sprite raycasting

    const directions = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];

    // Filter to valid non-null visible objects only
    const candidates = sceneObjects.filter((obj) => obj && obj.visible && obj !== this.camera);

    for (const dir of directions) {
      raycaster.set(this.position, dir);
      try {
        const intersects = raycaster.intersectObjects(candidates, true);
        if (intersects && intersects.length > 0 && intersects[0] && intersects[0].distance < 1.5) {
          this.isNearWall = true;
          this.wallNormal.copy(intersects[0].face?.normal || dir.clone().negate());
          break;
        }
      } catch {
        // Guard against transient scene mutations during raycast
      }
    }
  }

  // --- ACTIONS ---

  public triggerDash() {
    if (this.dashCharges <= 0 || this.isDead) return;

    this.dashCharges--;
    // Start recharge timer for the charge
    for (let i = 0; i < 3; i++) {
      if (this.dashRechargeTimers[i] === 0) {
        this.dashRechargeTimers[i] = 0.8;
        break;
      }
    }

    AudioEngine.playDash();

    // Dash in move direction or forward
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const dashDir = new THREE.Vector3();
    if (this.moveInput.forward) dashDir.add(forward);
    if (this.moveInput.backward) dashDir.sub(forward);
    if (this.moveInput.right) dashDir.add(right);
    if (this.moveInput.left) dashDir.sub(right);
    if (dashDir.lengthSq() === 0) dashDir.copy(forward);
    dashDir.normalize();

    this.velocity.copy(dashDir.multiplyScalar(35));
    if (!this.isGrounded) {
      this.velocity.y = 2; // Air micro-hover
    }
  }

  public triggerJump() {
    if (this.isDead) return;

    if (this.isGrounded) {
      this.velocity.y = 14;
      this.isGrounded = false;
      this.jumpCount = 1;
    } else if (this.isNearWall) {
      // Wall Kick!
      this.velocity.y = 16;
      this.velocity.addScaledVector(this.wallNormal, 20);
      this.jumpCount = 1; // Reset double jump
      AudioEngine.playDash();
    } else if (this.jumpCount < this.maxJumps) {
      // Double Jump
      this.velocity.y = 14;
      this.jumpCount++;
      AudioEngine.playDash();
    }
  }

  public startGroundPoundOrSlide() {
    if (this.isDead) return;

    if (!this.isGrounded) {
      // Ground Pound Slam in air
      this.isGroundPounding = true;
    } else {
      // Ground Slide
      this.isSliding = true;
    }
  }

  public stopSlide() {
    this.isSliding = false;
  }

  public startChargingPunch(): boolean {
    if (this.hvbCooldown > 0 || this.isDead || this.isChargingPunch) return false;
    this.isChargingPunch = true;
    this.punchChargeTimer = 0;
    this.punchChargeRatio = 0;
    return true;
  }

  public releaseChargedPunch(): { chargeRatio: number } | null {
    if (!this.isChargingPunch || this.isDead) return null;
    const ratio = Math.max(0.2, this.punchChargeRatio);
    this.isChargingPunch = false;
    this.punchChargeTimer = 0;
    this.punchChargeRatio = 0;
    this.hvbCooldown = this.maxHvbCd;
    AudioEngine.playHvbPunch(ratio);
    return { chargeRatio: ratio };
  }

  public triggerHvbPunch(): boolean {
    if (this.hvbCooldown > 0 || this.isDead) return false;
    this.hvbCooldown = this.maxHvbCd;
    AudioEngine.playHvbPunch(0.5);
    return true;
  }

  public triggerSecondarySkill(): { coinToss?: boolean; flashbang?: boolean; berserk?: boolean } {
    if (this.isDead) return {};

    if (this.currentWeapon === 'peacemaker' && this.coinCd <= 0) {
      this.coinCd = 4.0;
      AudioEngine.playCoinToss();
      return { coinToss: true };
    } else if (this.currentWeapon === 'trembler' && this.flashbangCd <= 0) {
      this.flashbangCd = 8.0;
      this.flashbangIntensity = 1.0;
      AudioEngine.playFlashbang();
      return { flashbang: true };
    } else if (this.currentWeapon === 'punisher' && this.berserkCd <= 0) {
      this.berserkCd = 25.0;
      this.isBerserkActive = true;
      this.berserkTimer = 6.0;
      AudioEngine.playRifleShot(true);
      return { berserk: true };
    }
    return {};
  }

  public takeDamage(amount: number) {
    if (this.isDead) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
    }
  }

  public heal(amount: number) {
    if (this.isDead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    AudioEngine.playHealNanoFluid();
  }
}
