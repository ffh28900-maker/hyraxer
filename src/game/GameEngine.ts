import * as THREE from 'three';
import { LevelGenerator, LevelData } from './3d/LevelGenerator';
import { ModelBuilder } from './3d/ModelBuilder';
import { DamageNumbers } from './3d/DamageNumbers';
import { HitSplashes } from './3d/HitSplashes';
import { PlayerEngine } from './PlayerEngine';
import { EnemyEngine } from './EnemyEngine';
import { AudioEngine } from '../audio/AudioEngine';
import { LevelResult, RankGrade, STYLE_RANKS, StyleRating, WeaponId } from '../types';

export interface HudState {
  hp: number;
  maxHp: number;
  dashCharges: number;
  currentWeapon: WeaponId;
  hvbCdRatio: number;
  grappleCdRatio: number;
  skillCdRatio: number;
  styleScore: number;
  styleRank: StyleRating;
  styleActionText: string;
  flashbangIntensity: number;
  berserkActive: boolean;
  isChargingPunch: boolean;
  punchChargeRatio: number;
  bossHpRatio?: number;
  bossName?: string;
  levelTimeSec: number;
  hasFlashlight: boolean;
}

export class GameEngine {
  private container: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private levelData!: LevelData;
  public player!: PlayerEngine;
  public enemies!: EnemyEngine;
  private damageNumbers!: DamageNumbers;
  private hitSplashes!: HitSplashes;

  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastTime: number = 0;

  // Viewmodel & Weapon Animations
  private viewmodelGroup: THREE.Group = new THREE.Group();
  private bareFistGroup: THREE.Group;
  private activeWeaponId: WeaponId | null = null;
  private recoilZ: number = 0;
  private recoilPitch: number = 0;
  private recoilYaw: number = 0;
  private muzzleFlashTimer: number = 0;
  private bobbingTimer: number = 0;

  // Skill Animation FX (Bare Hand Punch & Charge)
  private punchAnimTimer: number = 0;
  private punchAnimDuration: number = 0.28;
  private punchAnimRatio: number = 0.2;
  private punchImpactTriggered: boolean = false;

  private activeCoinMesh: THREE.Mesh | null = null;
  private coinVelocity: THREE.Vector3 = new THREE.Vector3();

  private activeGrenadeMesh: THREE.Mesh | null = null;
  private grenadeVelocity: THREE.Vector3 = new THREE.Vector3();
  private grenadeTimer: number = 0;

  private grappleLineMesh: THREE.Line | null = null;

  // Level stats
  public currentLevelNumber: number = 1;
  public killsCount: number = 0;
  public totalEnemiesCount: number = 0;
  public styleScore: number = 0;
  public styleActionText: string = 'DESTRUCTIVE';
  public levelTimeSec: number = 0;
  public damageTaken: number = 0;

  // Callbacks
  private onHudUpdate: (hud: HudState) => void;
  private onLevelFinish: (result: LevelResult, unlockedNewWeapon?: WeaponId) => void;
  private onPlayerDeath: () => void;

  constructor(
    container: HTMLDivElement,
    onHudUpdate: (hud: HudState) => void,
    onLevelFinish: (result: LevelResult, unlockedNewWeapon?: WeaponId) => void,
    onPlayerDeath: () => void
  ) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.onLevelFinish = onLevelFinish;
    this.onPlayerDeath = onPlayerDeath;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.player = new PlayerEngine();

    // Dedicated viewmodel lights attached to camera for bright high-detail viewmodel rendering
    const vmDirLight = new THREE.DirectionalLight(0xffffff, 2.2);
    vmDirLight.position.set(0.6, 1.0, 0.8);
    this.player.camera.add(vmDirLight);

    const vmAmbientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.player.camera.add(vmAmbientLight);

    // Attach Viewmodel Group & Bare Fist to Player Camera
    this.player.camera.add(this.viewmodelGroup);

    this.bareFistGroup = ModelBuilder.createBarePunchFist();
    this.bareFistGroup.visible = false;
    this.player.camera.add(this.bareFistGroup);

    window.addEventListener('resize', this.onWindowResize);
  }

  public loadLevel(levelNum: number, unlockedWeapons: Record<WeaponId, boolean>) {
    this.currentLevelNumber = levelNum;
    this.levelData = LevelGenerator.generateLevel(levelNum);

    // Add camera to scene graph so all camera children (viewmodels, hands, lights) are rendered
    this.levelData.scene.add(this.player.camera);

    this.player.unlockedWeapons = unlockedWeapons;
    this.player.reset(this.levelData.playerSpawn);

    this.enemies = new EnemyEngine(this.levelData.scene);
    this.damageNumbers = new DamageNumbers(this.levelData.scene);
    this.hitSplashes = new HitSplashes(this.levelData.scene);
    this.enemies.onDamageNumber = (pos, amount, isCrit) => this.damageNumbers.spawn(pos, amount, isCrit);
    this.enemies.onHitSplash = (pos, isCrit) => this.hitSplashes.spawn(pos, isCrit);

    // Reset viewmodel & skill props
    this.activeWeaponId = null;
    this.updateViewmodelMesh();

    if (this.activeCoinMesh) {
      this.levelData.scene.remove(this.activeCoinMesh);
      this.activeCoinMesh = null;
    }
    if (this.activeGrenadeMesh) {
      this.levelData.scene.remove(this.activeGrenadeMesh);
      this.activeGrenadeMesh = null;
    }
    if (this.grappleLineMesh) {
      this.levelData.scene.remove(this.grappleLineMesh);
      this.grappleLineMesh = null;
    }

    // Spawn enemies from level layout
    for (const spawn of this.levelData.enemySpawns) {
      this.enemies.spawnEnemy(spawn.type, spawn.position);
    }

    this.killsCount = 0;
    this.totalEnemiesCount = this.enemies.enemies.length;
    this.styleScore = 0;
    this.levelTimeSec = 0;
    this.damageTaken = 0;

    AudioEngine.startMusic(this.levelData.isBossLevel, this.levelData.isSecretLevel);
  }

  private updateViewmodelMesh() {
    if (this.activeWeaponId === this.player.currentWeapon) return;

    // Clear previous weapon
    while (this.viewmodelGroup.children.length > 0) {
      this.viewmodelGroup.remove(this.viewmodelGroup.children[0]);
    }

    // Create new detailed weapon mesh with hands
    const weaponMesh = ModelBuilder.createWeaponMesh(this.player.currentWeapon);
    this.viewmodelGroup.add(weaponMesh);
    this.activeWeaponId = this.player.currentWeapon;

    // Trigger weapon draw animation
    this.recoilPitch = -0.3;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  public stop() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    AudioEngine.stopMusic();
  }

  private loop = (now: number) => {
    if (!this.isRunning) return;

    const delta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (!this.player.isDead) {
      this.levelTimeSec += delta;

      // Update damage floating numbers & hit splashes
      if (this.damageNumbers) {
        this.damageNumbers.update(delta);
      }
      if (this.hitSplashes) {
        this.hitSplashes.update(delta);
      }

      // Update player
      const sceneObjects = this.levelData.scene.children;
      const actions = this.player.update(delta, sceneObjects);

      if (actions.groundPoundShockwave) {
        this.enemies.applyGroundPoundShockwave(actions.groundPoundShockwave, this.addStylePoints);
      }

      // Update enemies
      this.enemies.update(
        delta,
        this.player.position,
        (dmg) => {
          this.player.takeDamage(dmg);
          this.damageTaken += dmg;
          if (this.player.isDead) {
            this.onPlayerDeath();
          }
        },
        this.addStylePoints,
        (healAmount) => {
          this.player.heal(healAmount);
        }
      );

      // Check level completion (finish zone or boss death)
      this.checkLevelCompletion();

      // Update Viewmodel & Weapon Animations
      this.updateViewmodelAnimations(delta, now);
    }

    // Render 3D Scene
    this.renderer.render(this.levelData.scene, this.player.camera);

    // Send HUD state update
    this.updateHud();

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private updateViewmodelAnimations(delta: number, now: number) {
    // 1. Weapon Switch Check
    this.updateViewmodelMesh();

    // 2. Recoil Decay
    this.recoilZ = THREE.MathUtils.lerp(this.recoilZ, 0, delta * 22);
    this.recoilPitch = THREE.MathUtils.lerp(this.recoilPitch, 0, delta * 20);
    this.recoilYaw = THREE.MathUtils.lerp(this.recoilYaw, 0, delta * 20);

    // 3. Muzzle Flash Decay
    const flashMesh = this.viewmodelGroup.getObjectByName('muzzle_flash') as THREE.Mesh;
    const flashLight = this.viewmodelGroup.getObjectByName('muzzle_light') as THREE.PointLight;

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= delta;
      if (flashMesh && flashMesh.material) {
        (flashMesh.material as THREE.Material).opacity = 1.0;
      }
      if (flashLight) {
        flashLight.intensity = this.player.isBerserkActive ? 15.0 : 8.0;
      }
    } else {
      if (flashMesh && flashMesh.material) {
        (flashMesh.material as THREE.Material).opacity = 0;
      }
      if (flashLight) {
        flashLight.intensity = 0;
      }
    }

    // 4. Movement Bobbing & Sway
    const playerSpeed = this.player.velocity.length();
    if (playerSpeed > 0.5 && this.player.isGrounded) {
      this.bobbingTimer += delta * (this.player.isSliding ? 18 : 12);
    } else {
      this.bobbingTimer += delta * 2; // Subtle idle breath
    }

    const bobX = Math.cos(this.bobbingTimer * 0.5) * (playerSpeed > 0.5 ? 0.008 : 0.002);
    const bobY = Math.abs(Math.sin(this.bobbingTimer)) * (playerSpeed > 0.5 ? 0.012 : 0.003);

    // Berserk vibration
    const berserkShake = this.player.isBerserkActive ? Math.sin(now * 0.06) * 0.008 : 0;

    // CS2-style weapon viewmodel placement (Tucked comfortably bottom-right)
    let posX = 0.18 + bobX + berserkShake;
    let posY = -0.13 - bobY + berserkShake;
    let posZ = -0.16 + recoilZPosition(this.recoilZ);

    let rotPitch = this.recoilPitch;
    let rotYaw = this.recoilYaw;
    let rotRoll = this.recoilYaw * 0.5;

    // Retract/lower weapon hand out of center when charging or punching with bare fist
    if (this.player.isChargingPunch || this.punchAnimTimer > 0) {
      posX += 0.12;
      posY -= 0.15;
      posZ += 0.10;
      rotPitch -= 0.2;
    }

    this.viewmodelGroup.scale.set(0.58, 0.58, 0.58);
    this.viewmodelGroup.position.set(posX, posY, posZ);
    this.viewmodelGroup.rotation.set(rotPitch, rotYaw, rotRoll);

    // --- BARE HUMAN FIST PUNCH & CHARGE ANIMATIONS ---
    if (this.player.isChargingPunch) {
      this.bareFistGroup.visible = true;
      const charge = this.player.punchChargeRatio;

      // Bare fist pulls back into a heavy chambered stance on the left side
      let fistX = -0.22 - 0.08 * charge;
      let fistY = -0.14 + 0.04 * charge;
      let fistZ = -0.20 + 0.12 * charge; // Wind-up back

      let fistRotX = -0.2 - 0.35 * charge;
      let fistRotY = 0.25 + 0.25 * charge;
      let fistRotZ = -0.2;

      // Muscle vibration/jitter while charging
      const jitter = 0.002 + 0.010 * charge;
      fistX += (Math.random() - 0.5) * jitter;
      fistY += (Math.random() - 0.5) * jitter;
      fistZ += (Math.random() - 0.5) * jitter;

      this.bareFistGroup.scale.set(1.0, 1.0, 1.0);
      this.bareFistGroup.position.set(fistX, fistY, fistZ);
      this.bareFistGroup.rotation.set(fistRotX, fistRotY, fistRotZ);
    } else if (this.punchAnimTimer > 0) {
      this.bareFistGroup.visible = true;
      this.punchAnimTimer -= delta;
      const progress = Math.min(1.0, 1.0 - this.punchAnimTimer / this.punchAnimDuration);

      // Trigger impact at ~25% of punch stroke
      if (progress >= 0.25 && !this.punchImpactTriggered) {
        this.punchImpactTriggered = true;
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
        this.enemies.applyHvbToEnemies(this.player.position, forward, this.punchAnimRatio, this.addStylePoints);

        // Screen shake & camera kick
        this.recoilPitch = 0.25 * (0.6 + 0.6 * this.punchAnimRatio);
        this.recoilZ = 0.15 * (0.6 + 0.6 * this.punchAnimRatio);
      }

      const power = 0.8 + 0.5 * this.punchAnimRatio;
      let fistX = -0.22;
      let fistY = -0.10;
      let fistZ = -0.15;
      let fistRotX = 0;
      let fistRotY = 0;
      let fistRotZ = 0;

      if (progress <= 0.30) {
        // Phase 1: Violent Forward Thrust into Screen Center
        const p = progress / 0.30;
        const flex = Math.sin(p * Math.PI * 0.5);

        fistX = -0.22 * (1.0 - flex);
        fistY = -0.10 + 0.12 * flex;
        fistZ = -0.08 - 0.65 * flex * power; // THRUST into crosshair!

        fistRotX = 0.45 * flex;
        fistRotY = -0.35 * flex;
        fistRotZ = 0.25 * flex;
      } else {
        // Phase 2: Elastic Snap-Back
        const p = (progress - 0.30) / 0.70;
        const decay = Math.exp(-p * 6.0);

        fistX = -0.22 * (1.0 - decay);
        fistY = -0.10 + 0.12 * decay;
        fistZ = -0.08 - 0.65 * decay * power;

        fistRotX = 0.45 * decay;
        fistRotY = -0.35 * decay;
        fistRotZ = 0.25 * decay;
      }

      this.bareFistGroup.scale.set(1.0, 1.0, 1.0);
      this.bareFistGroup.position.set(fistX, fistY, fistZ);
      this.bareFistGroup.rotation.set(fistRotX, fistRotY, fistRotZ);
    } else {
      this.bareFistGroup.visible = false;
    }

    // 6. Coin Toss Animation Update
    if (this.activeCoinMesh) {
      this.activeCoinMesh.position.addScaledVector(this.coinVelocity, delta);
      this.coinVelocity.y -= 18 * delta; // Gravity
      this.activeCoinMesh.rotation.x += delta * 30;
      this.activeCoinMesh.rotation.y += delta * 20;

      if (this.activeCoinMesh.position.y <= 0.2) {
        this.levelData.scene.remove(this.activeCoinMesh);
        this.activeCoinMesh = null;
      }
    }

    // 7. Flashbang Grenade Physics Update
    if (this.activeGrenadeMesh) {
      this.activeGrenadeMesh.position.addScaledVector(this.grenadeVelocity, delta);
      this.grenadeTimer -= delta;
      this.activeGrenadeMesh.rotation.x += delta * 15;

      if (this.grenadeTimer <= 0) {
        // Detonate Flashbang in 3D scene!
        AudioEngine.playFlashbang();
        this.levelData.scene.remove(this.activeGrenadeMesh);
        this.activeGrenadeMesh = null;
      }
    }

    // 8. Grapple Hook Line Update
    if (this.player.isGrappling && this.player.grappleTargetPoint) {
      if (!this.grappleLineMesh) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          this.player.position,
          this.player.grappleTargetPoint,
        ]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 3 });
        this.grappleLineMesh = new THREE.Line(lineGeo, lineMat);
        this.levelData.scene.add(this.grappleLineMesh);
      } else {
        const positions = this.grappleLineMesh.geometry.attributes.position as THREE.BufferAttribute;
        positions.setXYZ(0, this.player.position.x, this.player.position.y - 0.2, this.player.position.z);
        positions.setXYZ(
          1,
          this.player.grappleTargetPoint.x,
          this.player.grappleTargetPoint.y,
          this.player.grappleTargetPoint.z
        );
        positions.needsUpdate = true;
      }
    } else if (this.grappleLineMesh) {
      this.levelData.scene.remove(this.grappleLineMesh);
      this.grappleLineMesh = null;
    }
  }

  public handlePrimaryFire() {
    if (this.player.isDead) return;

    if (this.player.currentWeapon === 'peacemaker') {
      AudioEngine.playPistolShot();
      this.recoilZ = 0.12;
      this.recoilPitch = 0.22;
      this.recoilYaw = (Math.random() - 0.5) * 0.04;
      this.muzzleFlashTimer = 0.06;

      // Check Coin Shot Trick
      if (this.activeCoinMesh && this.activeCoinMesh.position.distanceTo(this.player.position) < 25) {
        // ULTRARICOSHET!
        AudioEngine.playCoinToss();
        this.addStylePoints(300, 'ULTRA RICOSHET COIN');
        this.levelData.scene.remove(this.activeCoinMesh);
        this.activeCoinMesh = null;

        // Auto headshot nearest enemy
        const nearest = this.enemies.enemies.find((e) => !e.isDead);
        if (nearest) {
          nearest.hp -= 150;
          this.damageNumbers.spawn(nearest.position, 150, true);
          this.hitSplashes.spawn(nearest.position, true);
          if (nearest.hp <= 0) this.enemies.killEnemy(nearest, true, this.addStylePoints);
        }
      } else {
        this.shootRaycastDamage(25);
      }
    } else if (this.player.currentWeapon === 'trembler') {
      AudioEngine.playShotgun();
      this.recoilZ = 0.22;
      this.recoilPitch = 0.35;
      this.recoilYaw = (Math.random() - 0.5) * 0.08;
      this.muzzleFlashTimer = 0.08;
      this.shootRaycastDamage(60);
    } else if (this.player.currentWeapon === 'punisher') {
      AudioEngine.playRifleShot(this.player.isBerserkActive);
      this.recoilZ = this.player.isBerserkActive ? 0.05 : 0.08;
      this.recoilPitch = this.player.isBerserkActive ? 0.08 : 0.12;
      this.recoilYaw = (Math.random() - 0.5) * 0.03;
      this.muzzleFlashTimer = 0.05;
      this.shootRaycastDamage(this.player.isBerserkActive ? 40 : 18);
    }
  }

  public handlePunchStart() {
    this.player.startChargingPunch();
  }

  public handlePunchRelease() {
    const result = this.player.releaseChargedPunch();
    if (result) {
      this.punchAnimDuration = 0.28;
      this.punchAnimTimer = this.punchAnimDuration;
      this.punchAnimRatio = result.chargeRatio;
      this.punchImpactTriggered = false;
    }
  }

  public handleHvbPunch() {
    if (this.player.isChargingPunch) {
      this.handlePunchRelease();
    } else {
      this.handlePunchStart();
      setTimeout(() => this.handlePunchRelease(), 50);
    }
  }

  public handleSecondarySkill() {
    const skill = this.player.triggerSecondarySkill();
    if (skill.coinToss) {
      this.addStylePoints(150, 'COIN TOSS TRICK');

      // Spawn 3D Shiny Coin in front of camera
      const coinGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16);
      const coinMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
      this.activeCoinMesh = new THREE.Mesh(coinGeo, coinMat);

      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
      this.activeCoinMesh.position.copy(this.player.position).addScaledVector(forward, 0.8);
      this.activeCoinMesh.position.y += 0.2;

      this.coinVelocity.copy(forward).multiplyScalar(6);
      this.coinVelocity.y = 7;

      this.levelData.scene.add(this.activeCoinMesh);
    } else if (skill.flashbang) {
      // Spawn Flashbang Grenade Model
      const fbGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.28, 12);
      const fbMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, emissive: 0x8b5cf6 });
      this.activeGrenadeMesh = new THREE.Mesh(fbGeo, fbMat);

      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
      this.activeGrenadeMesh.position.copy(this.player.position).addScaledVector(forward, 1.0);

      this.grenadeVelocity.copy(forward).multiplyScalar(15);
      this.grenadeVelocity.y = 4;
      this.grenadeTimer = 0.6;

      this.levelData.scene.add(this.activeGrenadeMesh);

      // Stun all nearby enemies
      for (const e of this.enemies.enemies) {
        if (!e.isDead && e.position.distanceTo(this.player.position) < 25) {
          e.isStunned = true;
          e.stunTimer = 3.0;
        }
      }
      this.addStylePoints(200, 'FLASHBANG BLIND');
    } else if (skill.berserk) {
      this.addStylePoints(300, 'BERSERK OVERDRIVE');
    }
  }

  public handleGrapple() {
    if (this.player.grappleCooldown <= 0 && this.player.unlockedWeapons.grapple) {
      this.player.grappleCooldown = this.player.maxGrappleCd;
      AudioEngine.playGrappleHook();

      // Raycast to find target
      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
      const targetEnemy = this.enemies.enemies.find(
        (e) => !e.isDead && e.position.distanceTo(this.player.position) < 30
      );

      if (targetEnemy) {
        // Pull enemy towards player
        targetEnemy.position.lerp(this.player.position, 0.7);
        targetEnemy.isStunned = true;
        targetEnemy.stunTimer = 1.0;
        this.addStylePoints(150, 'GRAPPLE SNATCH');
      } else {
        // Pull player to point
        this.player.isGrappling = true;
        this.player.grappleTargetPoint = this.player.position.clone().addScaledVector(forward, 20);
      }
    }
  }

  private addStylePoints = (pts: number, actionName: string) => {
    this.styleScore += pts;
    this.styleActionText = actionName;
  };

  private checkLevelCompletion() {
    // Check if player reached finish portal or killed boss
    const pPos = this.player.position;
    const fZone = this.levelData.finishZone;

    let levelDone = false;
    if (
      pPos.x >= fZone.min.x &&
      pPos.x <= fZone.max.x &&
      pPos.z >= fZone.min.z &&
      pPos.z <= fZone.max.z
    ) {
      levelDone = true;
    }

    const aliveEnemies = this.enemies.enemies.filter((e) => !e.isDead);
    this.killsCount = this.totalEnemiesCount - aliveEnemies.length;

    if (this.levelData.isBossLevel && aliveEnemies.length === 0) {
      levelDone = true;
    }

    if (levelDone) {
      this.stop();

      // Determine Rank Grade (S, A, B, C, D)
      let rank: RankGrade = 'B';
      const killPercent = this.totalEnemiesCount > 0 ? this.killsCount / this.totalEnemiesCount : 1.0;

      if (killPercent >= 0.95 && this.damageTaken === 0) {
        rank = 'S';
      } else if (killPercent >= 0.8 && this.styleScore > 1500) {
        rank = 'A';
      } else if (killPercent >= 0.5) {
        rank = 'B';
      } else {
        rank = 'C';
      }

      // Check boss reward unlocks
      let unlockedNewWeapon: WeaponId | undefined;
      if (this.currentLevelNumber === 4) unlockedNewWeapon = 'trembler';
      else if (this.currentLevelNumber === 8) unlockedNewWeapon = 'punisher';
      else if (this.currentLevelNumber === 12) unlockedNewWeapon = 'grapple';

      const result: LevelResult = {
        completed: true,
        rank,
        score: this.styleScore,
        timeSec: Math.floor(this.levelTimeSec),
        kills: this.killsCount,
        totalEnemies: this.totalEnemiesCount,
      };

      this.onLevelFinish(result, unlockedNewWeapon);
    }
  }

  private updateHud() {
    let styleRank = STYLE_RANKS[0];
    if (this.styleScore > 3500) styleRank = STYLE_RANKS[4]; // ULTRAKILL
    else if (this.styleScore > 2400) styleRank = STYLE_RANKS[3]; // SSADISTIC
    else if (this.styleScore > 1400) styleRank = STYLE_RANKS[2]; // SUPREME
    else if (this.styleScore > 600) styleRank = STYLE_RANKS[1]; // SAVAGE

    // Boss HP check
    const boss = this.enemies.enemies.find((e) => e.isBoss && !e.isDead);

    let skillCdRatio = 0;
    if (this.player.currentWeapon === 'peacemaker') skillCdRatio = this.player.coinCd / 4.0;
    if (this.player.currentWeapon === 'trembler') skillCdRatio = this.player.flashbangCd / 8.0;
    if (this.player.currentWeapon === 'punisher') skillCdRatio = this.player.berserkCd / 25.0;

    this.onHudUpdate({
      hp: Math.ceil(this.player.hp),
      maxHp: this.player.maxHp,
      dashCharges: this.player.dashCharges,
      currentWeapon: this.player.currentWeapon,
      hvbCdRatio: this.player.hvbCooldown / this.player.maxHvbCd,
      grappleCdRatio: this.player.grappleCooldown / this.player.maxGrappleCd,
      skillCdRatio,
      styleScore: this.styleScore,
      styleRank,
      styleActionText: this.styleActionText,
      flashbangIntensity: this.player.flashbangIntensity,
      berserkActive: this.player.isBerserkActive,
      isChargingPunch: this.player.isChargingPunch,
      punchChargeRatio: this.player.punchChargeRatio,
      bossHpRatio: boss ? boss.hp / boss.maxHp : undefined,
      bossName: boss ? boss.type.replace('boss_', '').toUpperCase() : undefined,
      levelTimeSec: Math.floor(this.levelTimeSec),
      hasFlashlight: this.levelData.hasFlashlight,
    });
  }

  private shootRaycastDamage(damage: number) {
    if (!this.enemies || !this.enemies.enemies || !this.player) return;

    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.yaw);
    const raycaster = new THREE.Raycaster(this.player.camera.position, forward);
    raycaster.camera = this.player.camera; // Required by Three.js sprite raycasting

    for (const enemy of this.enemies.enemies) {
      if (enemy.isDead || !enemy.mesh || !enemy.mesh.parent) continue;
      try {
        const intersects = raycaster.intersectObject(enemy.mesh, true);
        if (intersects && intersects.length > 0 && intersects[0]) {
          const hitPoint = intersects[0].point || enemy.position.clone();

          // Critical hit calculation
          let isCrit = false;
          let finalDamage = damage;

          if (this.player.isBerserkActive) {
            isCrit = true;
            finalDamage = Math.round(damage * 1.8);
          } else {
            // Weapon specific critical hit chance
            const critChance = this.player.currentWeapon === 'trembler' ? 0.35 : 0.25;
            if (Math.random() < critChance) {
              isCrit = true;
              finalDamage = Math.round(damage * 1.6);
            }
          }

          enemy.hp -= finalDamage;
          this.addStylePoints(isCrit ? 100 : 50, isCrit ? '💥 CRITICAL HEADSHOT' : 'HEADSHOT');
          if (this.damageNumbers && hitPoint) {
            this.damageNumbers.spawn(hitPoint, finalDamage, isCrit);
          }
          if (this.hitSplashes && hitPoint) {
            this.hitSplashes.spawn(hitPoint, isCrit);
          }

          if (enemy.hp <= 0) {
            this.enemies.killEnemy(enemy, false, this.addStylePoints);
          }
          break;
        }
      } catch {
        // Safe guard against mid-frame object disposal or matrix updates
      }
    }
  }

  private onWindowResize = () => {
    if (!this.renderer || !this.player) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.player.camera.aspect = window.innerWidth / window.innerHeight;
    this.player.camera.updateProjectionMatrix();
  };

  public destroy() {
    this.stop();
    if (this.damageNumbers) {
      this.damageNumbers.clear();
    }
    if (this.hitSplashes) {
      this.hitSplashes.clear();
    }
    window.removeEventListener('resize', this.onWindowResize);
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}

function recoilZPosition(recoilZ: number): number {
  return -recoilZ;
}

