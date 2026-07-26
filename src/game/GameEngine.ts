import * as THREE from 'three';
import { LevelGenerator, LevelData } from './3d/LevelGenerator';
import { SceneCuller } from './3d/SceneCuller';
import { ModelBuilder } from './3d/ModelBuilder';
import { TextureGenerator } from './3d/TextureGenerator';
import { DamageNumbers } from './3d/DamageNumbers';
import { HitSplashes } from './3d/HitSplashes';
import { TracerEngine } from './3d/TracerEngine';
import { PlayerEngine } from './PlayerEngine';
import { EnemyEngine, EnemyInstance } from './EnemyEngine';
import { AudioEngine } from '../audio/AudioEngine';
import { EnemyType, LevelResult, RankGrade, STYLE_RANKS, StyleRating, StyleBreakdown, WeaponId } from '../types';

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
  killsCount: number;
  totalEnemiesCount: number;
  aliveEnemiesCount: number;
}

export class GameEngine {
  private container: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private levelData!: LevelData;
  public player!: PlayerEngine;
  public enemies!: EnemyEngine;
  private damageNumbers!: DamageNumbers;
  private hitSplashes!: HitSplashes;
  private tracers!: TracerEngine;

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

  private activeGrappleHookMesh: THREE.Group | null = null;
  private activeGrappleCableLine: THREE.Line | null = null;
  private grappleState: {
    phase: 'shooting' | 'attached_enemy' | 'attached_wall' | 'retracting';
    currentPos: THREE.Vector3;
    targetPos: THREE.Vector3;
    dir: THREE.Vector3;
    targetEnemy: EnemyInstance | null;
    isWallHit: boolean;
    speed: number;
  } | null = null;

  // Auto fire tracking
  public isPrimaryMouseDown: boolean = false;
  private lastFireTime: number = 0;

  // Reusable objects for high FPS raycasting & calculations
  private shootRaycaster = new THREE.Raycaster();
  private shootDir = new THREE.Vector3();
  private tempEnemyCenter = new THREE.Vector3();
  private tempRight = new THREE.Vector3();
  private tempUp = new THREE.Vector3();
  private tempTracerStart = new THREE.Vector3();
  private tempTracerEnd = new THREE.Vector3();
  private tempHitPoint = new THREE.Vector3();
  private tempSpreadDir = new THREE.Vector3();
  private cachedLevelMeshes: THREE.Object3D[] | null = null;
  private nearMeshesTemp: THREE.Object3D[] = [];
  /** Muzzle refs resolved once per weapon switch (were getObjectByName'd every frame). */
  private muzzleFlashMesh: THREE.Mesh | null = null;
  private muzzleFlashLight: THREE.PointLight | null = null;
  /** LED ref resolved once per grenade throw (was getObjectByName'd every frame). */
  private activeGrenadeLed: THREE.Mesh | null = null;
  /** Frame-clocked auto punch release for the HVB quick-punch (replaces a setTimeout). */
  private pendingAutoPunchRelease = 0;
  /**
   * PERF: gadget meshes built once and reused for the whole session. They used to be
   * rebuilt from scratch on every grapple press / grenade throw / coin toss and removed
   * without disposal. Their geometry/materials come from ModelBuilder's shared caches, so
   * level teardown never disposes them either.
   */
  private cachedGrappleHookMesh: THREE.Group | null = null;
  private cachedGrappleCableLine: THREE.Line | null = null;
  private cachedGrenadeMesh: THREE.Group | null = null;
  private cachedCoinMesh: THREE.Mesh | null = null;
  /** Weapon viewmodels built once per weapon per session (were rebuilt+leaked per switch). */
  private weaponMeshCache = new Map<WeaponId, THREE.Group>();
  // Scratch vectors for updateGrappleHook (were per-frame allocations)
  private tempGrappleOrigin = new THREE.Vector3();
  private tempGrapplePull = new THREE.Vector3();
  private tempGrappleLook = new THREE.Vector3();

  /** Room-geometry visibility + point-light budgeting. See SceneCuller for rationale. */
  private culler: SceneCuller | null = null;

  /** Stable bound predicate so the enemy visibility pass allocates no closure per call. */
  private cullerIsRoomActive = (roomId: number): boolean =>
    this.culler ? this.culler.isRoomActive(roomId) : true;

  /**
   * PERF: the player's room id, recomputed once per frame and shared with the enemy update.
   * It used to be derived by a linear scan over every room, separately for the player AND
   * for every enemy, every frame.
   */
  private currentPlayerRoomId: number = 1;

  // Cached HUD state tracking to prevent unnecessary React re-renders
  private lastHudSnapshot = {
    hp: -1,
    dashCharges: -1,
    weapon: '' as string,
    hvbCdRatio: -1,
    grappleCdRatio: -1,
    skillCdRatio: -1,
    styleScore: -1,
    styleActionText: '',
    flashbangIntensity: -1,
    berserkActive: false,
    isChargingPunch: false,
    punchChargeRatio: -1,
    bossHpRatio: undefined as number | undefined,
    levelTimeSec: -1,
    killsCount: -1,
    aliveEnemiesCount: -1,
  };

  // Level stats
  public currentLevelNumber: number = 1;
  public killsCount: number = 0;
  public totalEnemiesCount: number = 0;
  private autoFinishTimer: number = 0.6;
  public styleScore: number = 0;
  public styleActionText: string = 'DESTRUCTIVE';
  public levelTimeSec: number = 0;
  public damageTaken: number = 0;

  // Style Rank Category Breakdown Stats
  public movementStylePts: number = 0;
  public airtimeStylePts: number = 0;
  public multikillStylePts: number = 0;

  // Dynamic room streaming pending enemy spawns
  private pendingEnemySpawns: Array<{ position: THREE.Vector3; type: EnemyType; roomId: number }> = [];

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

    // Dev-only hook for the headless perf probe (scripts/perf-probe.mjs). Tree-shaken from builds.
    if (import.meta.env.DEV) {
      (window as unknown as { __engine?: GameEngine }).__engine = this;
    }

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // PERF: shadowMap was enabled but NO light in the game ever sets castShadow, so the
    // shadow pass produced zero visible shadows while still forcing Three.js to compile
    // shadow-variant shaders for all ~190 standard materials. Disabling it is visually
    // lossless and removes a whole category of first-frame shader stalls.
    this.renderer.shadowMap.enabled = false;
    // PERF: skip the implicit full-scene sort/upload the renderer does when it thinks
    // shadows may have changed.
    this.renderer.shadowMap.autoUpdate = false;
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
    // LEAK FIX: release the previous level's GPU resources before building the next scene.
    // Without this, every level load (and every retry) permanently added another scene's
    // worth of geometries, materials and textures to GPU memory.
    if (this.levelData) {
      this.disposeLevelScene();
    }

    this.currentLevelNumber = levelNum;
    this.levelData = LevelGenerator.generateLevel(levelNum);

    // Add camera to scene graph so all camera children (viewmodels, hands, lights) are rendered
    this.levelData.scene.add(this.player.camera);

    this.player.unlockedWeapons = unlockedWeapons;
    this.player.reset(this.levelData.playerSpawn);

    this.enemies = new EnemyEngine(this.levelData.scene, this.levelData.isSecretLevel);
    this.damageNumbers = new DamageNumbers(this.levelData.scene);
    this.hitSplashes = new HitSplashes(this.levelData.scene);
    if (this.tracers) {
      this.tracers.destroy();
    }
    this.tracers = new TracerEngine(this.levelData.scene);
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
    if (this.activeGrappleHookMesh) {
      this.levelData.scene.remove(this.activeGrappleHookMesh);
      this.activeGrappleHookMesh = null;
    }
    if (this.activeGrappleCableLine) {
      this.levelData.scene.remove(this.activeGrappleCableLine);
      this.activeGrappleCableLine = null;
    }
    this.grappleState = null;

    // Spawn enemies dynamically per room via updateRoomStreaming
    this.pendingEnemySpawns = [...this.levelData.enemySpawns];
    this.totalEnemiesCount = this.levelData.enemySpawns.length;

    // PERF: build the room/light culler BEFORE the first frame. RoomInfo.objects was
    // already being populated by the generator but had no consumer, so every room of the
    // level rendered simultaneously for the whole run.
    // The camera subtree holds viewmodel FX lights (muzzle flash) which must never be
    // budgeted away, so it is excluded from light collection.
    this.culler = new SceneCuller(this.levelData.scene, this.levelData.rooms, this.player.camera);
    this.currentPlayerRoomId = LevelGenerator.getRoomIdAtPosition(
      this.player.position,
      this.levelData.rooms
    );
    this.culler.updateRoomVisibility(this.currentPlayerRoomId);
    this.culler.updateLightBudget(this.player.position, 0, true);

    this.updateRoomStreaming();

    this.cachedLevelMeshes = null;
    this.enemies.invalidateObstacleCache();
    this.player.invalidateWallCache();
    // Make every world matrix valid up front: the player/enemy collision caches snapshot
    // world AABBs lazily on first use, which may happen before the first render.
    this.levelData.scene.updateMatrixWorld(true);
    // PERF: with world matrices now valid, prune the static level geometry from the
    // renderer's per-frame updateMatrixWorld walk entirely. Only roots present at
    // generation time are frozen - camera, enemies, FX and projectiles stay dynamic.
    for (const root of this.levelData.staticRoots) {
      root.matrixWorldAutoUpdate = false;
    }
    this.killsCount = 0;
    this.autoFinishTimer = 0.6;
    // Keep totalEnemiesCount set from this.levelData.enemySpawns.length!
    this.styleScore = 0;
    this.levelTimeSec = 0;
    this.damageTaken = 0;
    this.movementStylePts = 0;
    this.airtimeStylePts = 0;
    this.multikillStylePts = 0;

    this.prewarmShaders();

    AudioEngine.startMusic(this.levelData.isBossLevel, this.levelData.isSecretLevel);
  }

  /**
   * PERF: compile every material's shader program up front.
   *
   * Three.js compiles a program the first time a given material/light-count combination is
   * actually rendered. With ~190 MeshStandardMaterials that meant a GPU compile stall the
   * first time each new prop, enemy or corridor theme entered the frustum - felt in-game as
   * random multi-frame freezes while running through a level, exactly the reported symptom.
   *
   * renderer.compile() walks the scene and compiles everything in one batch during the
   * loading screen instead. It is a pure warm-up: no visual change, and re-renders later hit
   * the program cache.
   */
  private prewarmShaders() {
    if (!this.levelData) return;

    try {
      // Temporarily reveal all rooms so their materials get compiled too - otherwise a
      // culled room's shaders would still stall on first entry.
      const rooms = this.levelData.rooms;
      const hiddenObjects: THREE.Object3D[] = [];

      if (rooms) {
        for (const room of rooms) {
          for (const obj of room.objects) {
            // Never reveal hidden lights: program variants are keyed on the point-light
            // count, so compiling with all room lights visible would warm variants the
            // budgeted runtime (8 lights) never uses - and skip the real ones.
            if ((obj as THREE.Light).isLight) continue;
            if (!obj.visible) {
              hiddenObjects.push(obj);
              obj.visible = true;
            }
          }
        }
      }

      this.renderer.compile(this.levelData.scene, this.player.camera);

      for (const obj of hiddenObjects) {
        obj.visible = false;
      }
    } catch {
      // Warm-up is best-effort; a failure here must never block level load.
    }
  }

  private spawnEnemiesForRoom(roomId: number) {
    if (!this.pendingEnemySpawns) return;

    for (let i = this.pendingEnemySpawns.length - 1; i >= 0; i--) {
      const spawn = this.pendingEnemySpawns[i];
      if (spawn.roomId === roomId) {
        const enemy = this.enemies.spawnEnemy(spawn.type, spawn.position, spawn.roomId);
        // Match the freshly spawned enemy to the current culling state - a room can be
        // streamed in (enemies created) while still outside the visible room window.
        if (this.culler) {
          enemy.mesh.visible = this.culler.isRoomActive(spawn.roomId);
        }
        this.pendingEnemySpawns.splice(i, 1);
      }
    }
  }

  private updateRoomStreaming() {
    if (!this.levelData || !this.levelData.rooms) return;

    // Uses the room id already resolved for this frame instead of re-scanning the room list.
    const currentRoomId = this.currentPlayerRoomId;

    for (const room of this.levelData.rooms) {
      if (room.id === currentRoomId || room.id === currentRoomId + 1) {
        if (!room.loaded) {
          room.loaded = true;
          this.spawnEnemiesForRoom(room.id);
        }
      }
    }
  }

  private updateViewmodelMesh() {
    if (this.activeWeaponId === this.player.currentWeapon) return;

    // Clear previous weapon
    while (this.viewmodelGroup.children.length > 0) {
      this.viewmodelGroup.remove(this.viewmodelGroup.children[0]);
    }

    // PERF: build each weapon's viewmodel once per session and re-attach on switch.
    // createWeaponMesh assembles ~115 meshes/~45 materials - rebuilding (and never
    // disposing) it on every switch leaked all of that each time.
    let weaponMesh = this.weaponMeshCache.get(this.player.currentWeapon);
    if (!weaponMesh) {
      weaponMesh = ModelBuilder.createWeaponMesh(this.player.currentWeapon);
      this.weaponMeshCache.set(this.player.currentWeapon, weaponMesh);
    }
    this.viewmodelGroup.add(weaponMesh);
    this.activeWeaponId = this.player.currentWeapon;

    // PERF: resolve muzzle refs once per switch instead of getObjectByName per frame.
    this.muzzleFlashMesh = (this.viewmodelGroup.getObjectByName('muzzle_flash') as THREE.Mesh) ?? null;
    this.muzzleFlashLight = (this.viewmodelGroup.getObjectByName('muzzle_light') as THREE.PointLight) ?? null;

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

      // Update damage floating numbers, hit splashes & bullet tracers
      if (this.damageNumbers) {
        this.damageNumbers.update(delta);
      }
      if (this.hitSplashes) {
        this.hitSplashes.update(delta);
      }
      if (this.tracers) {
        this.tracers.update(delta);
      }

      // PERF: resolve the player's room ONCE per frame. This value feeds room streaming,
      // geometry culling and the enemy AI update, all of which used to recompute it
      // independently (the enemy loop did so per-enemy, per-frame).
      this.currentPlayerRoomId = LevelGenerator.getRoomIdAtPosition(
        this.player.position,
        this.levelData?.rooms
      );

      // Update room streaming (load current + next room, delete passed rooms)
      this.updateRoomStreaming();

      // PERF: hide rooms the player can't see and keep the point-light count within budget.
      if (this.culler) {
        const roomChanged = this.culler.updateRoomVisibility(this.currentPlayerRoomId);
        if (roomChanged && this.enemies) {
          // Enemies in culled rooms stop rendering too (their AI is already frozen).
          this.enemies.updateEnemyVisibility(this.cullerIsRoomActive);
        }
        this.culler.updateLightBudget(this.player.position, delta);
      }

      // Update player
      const staticMeshes = this.getStaticLevelMeshes();
      const actions = this.player.update(delta, staticMeshes);

      if (actions.groundPoundShockwave) {
        this.enemies.applyGroundPoundShockwave(actions.groundPoundShockwave, this.addStylePoints);
      }

      // Update enemies (reuses the room id resolved above)
      // PERF: stable bound callbacks - three fresh closures used to be allocated here
      // every frame (~180/s).
      const playerRoomId = this.currentPlayerRoomId;
      this.enemies.update(
        delta,
        this.player.position,
        this.handleEnemyDamageToPlayer,
        this.addStylePoints,
        this.handleEnemyHealPlayer,
        playerRoomId,
        this.levelData?.rooms,
        this.hitSplashes,
        this.handleEnemySlowPlayer
      );

      // Check room barriers unlock status
      this.updateRoomBarriers();

      // Check level completion (finish zone or boss death or all mobs killed)
      this.checkLevelCompletion(delta);

      // Auto fire logic
      if (this.isPrimaryMouseDown) {
        this.handlePrimaryFire();
      }

      // Frame-clocked HVB auto punch release (replaces a setTimeout)
      if (this.pendingAutoPunchRelease > 0) {
        this.pendingAutoPunchRelease -= delta;
        if (this.pendingAutoPunchRelease <= 0) {
          this.pendingAutoPunchRelease = 0;
          this.handlePunchRelease();
        }
      }

      // Update Viewmodel & Weapon Animations
      this.updateViewmodelAnimations(delta, now);

      // Update 3D Grapple Hook projectile & cable
      this.updateGrappleHook(delta);

      // Update 3D Flashbang Grenade flight & detonation
      this.updateGrenade(delta);
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
    this.recoilZ = THREE.MathUtils.lerp(this.recoilZ, 0, delta * 28);
    this.recoilPitch = THREE.MathUtils.lerp(this.recoilPitch, 0, delta * 28);
    this.recoilYaw = THREE.MathUtils.lerp(this.recoilYaw, 0, delta * 28);

    // 3. Muzzle Flash Decay
    // PERF: refs resolved once per weapon switch in updateViewmodelMesh - getObjectByName
    // used to walk the whole viewmodel subtree twice per frame.
    const flashMesh = this.muzzleFlashMesh;
    const flashLight = this.muzzleFlashLight;

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
    let posZ = -0.16 + this.recoilZ;

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
        const forward = new THREE.Vector3();
        this.player.camera.getWorldDirection(forward);
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
  }

  private updateRoomBarriers() {
    if (!this.levelData.roomBarriers) return;

    for (const barrier of this.levelData.roomBarriers) {
      if (!barrier.barrierMesh.parent) continue;

      // Keep barriers completely unlocked and pass-through.
      // PERF: the names are constant, so write them once instead of every frame (renaming
      // also matters to PlayerEngine's wall cache, which filters by name).
      if (!barrier.unlocked) {
        barrier.unlocked = true;
        barrier.barrierMesh.name = 'unlocked_barrier';
        if (barrier.rearBarrierMesh) {
          barrier.rearBarrierMesh.name = 'unlocked_barrier';
        }
      }

      // Check if player is near or inside room to trigger enemy spawns.
      // PERF: pendingEnemySpawns is only scanned while the room still has pending entries.
      if (this.pendingEnemySpawns.length > 0) {
        const playerZ = this.player.position.z;
        if (Math.abs(playerZ - barrier.roomZCenter) <= barrier.roomDepth / 2 + 10) {
          this.spawnEnemiesForRoom(barrier.roomId);
        }
      }
    }
  }


  public switchWeapon(weapon: WeaponId) {
    if (!this.player || this.player.currentWeapon === weapon) return;
    if (!this.player.unlockedWeapons[weapon]) return;
    this.player.currentWeapon = weapon;
    this.updateViewmodelMesh();
    AudioEngine.playCoinToss();
    // Enforce weapon draw/swap delay so player cannot quick-swap to fire instantly
    this.lastFireTime = performance.now();
  }

  public handlePrimaryFire() {
    if (this.player.isDead) return;

    const now = performance.now();
    let fireInterval = 0.28; // Peacemaker revolver delay (280ms)

    if (this.player.currentWeapon === 'punisher') {
      fireInterval = this.player.isBerserkActive ? 0.05 : 0.09;
    } else if (this.player.currentWeapon === 'trembler') {
      fireInterval = 0.60; // Heavy Shotgun delay (600ms)
    } else if (this.player.currentWeapon === 'peacemaker') {
      fireInterval = 0.28; // Revolver delay (280ms)
    }

    if (now - this.lastFireTime < fireInterval * 1000) {
      return;
    }
    this.lastFireTime = now;

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

        // Auto hit nearest enemy
        const nearest = this.enemies.enemies.find((e) => !e.isDead);
        if (nearest) {
          nearest.hp -= 150;
          this.damageNumbers.spawn(nearest.position, 150, false);
          this.hitSplashes.spawn(nearest.position, false);
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
      this.recoilZ = this.player.isBerserkActive ? 0.04 : 0.06;
      this.recoilPitch = this.player.isBerserkActive ? 0.06 : 0.09;
      this.recoilYaw = (Math.random() - 0.5) * 0.02;
      this.muzzleFlashTimer = 0.04;
      this.shootRaycastDamage(this.player.isBerserkActive ? 45 : 22);
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
      // Frame-clocked instead of setTimeout: survives tab throttling and cannot fire after
      // stop()/destroy().
      this.pendingAutoPunchRelease = 0.05;
    }
  }

  public handleSecondarySkill() {
    const skill = this.player.triggerSecondarySkill();
    if (skill.coinToss) {
      this.addStylePoints(150, 'COIN TOSS TRICK');

      // Spawn the session-cached 3D Shiny Coin in front of camera (was a fresh
      // geometry+material per toss, removed without disposal)
      if (!this.cachedCoinMesh) {
        this.cachedCoinMesh = new THREE.Mesh(
          ModelBuilder.getGeo('coin:disc', () => new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16)),
          ModelBuilder.getMaterial('coin:disc', () => new THREE.MeshBasicMaterial({ color: 0xffd700 }))
        );
      }
      this.activeCoinMesh = this.cachedCoinMesh;

      const forward = new THREE.Vector3();
      this.player.camera.getWorldDirection(forward);
      this.activeCoinMesh.position.copy(this.player.position).addScaledVector(forward, 0.8);
      this.activeCoinMesh.position.y += 0.2;

      this.coinVelocity.copy(forward).multiplyScalar(6);
      this.coinVelocity.y = 7;

      this.levelData.scene.add(this.activeCoinMesh);
    } else if (skill.flashbang) {
      if (this.activeGrenadeMesh) {
        this.levelData.scene.remove(this.activeGrenadeMesh);
        this.activeGrenadeMesh = null;
      }

      if (!this.cachedGrenadeMesh) this.cachedGrenadeMesh = ModelBuilder.createFlashbangGrenadeMesh();
      const grenadeGroup = this.cachedGrenadeMesh;
      grenadeGroup.rotation.set(0, 0, 0);
      this.activeGrenadeMesh = grenadeGroup as unknown as THREE.Mesh;
      // PERF: resolve the LED once per throw instead of getObjectByName per frame.
      this.activeGrenadeLed = (grenadeGroup.getObjectByName('flashbang_led') as THREE.Mesh) ?? null;

      const forward = new THREE.Vector3();
      this.player.camera.getWorldDirection(forward);

      this.activeGrenadeMesh.position.copy(this.player.camera.position).addScaledVector(forward, 0.8);

      this.grenadeVelocity.copy(forward).multiplyScalar(20.0);
      this.grenadeVelocity.y = 4.5;
      this.grenadeTimer = 1.3; // 1.3s fuse timer

      this.levelData.scene.add(this.activeGrenadeMesh);
      this.addStylePoints(50, '💣 FLASHBANG THROWN');
    } else if (skill.berserk) {
      this.addStylePoints(300, 'BERSERK OVERDRIVE');
    }
  }

  public handleGrapple() {
    if (this.player.grappleCooldown > 0 || this.grappleState) return;
    this.player.unlockedWeapons.grapple = true;
    this.player.grappleCooldown = this.player.maxGrappleCd;
    AudioEngine.playGrappleHook();

    const forward = new THREE.Vector3();
    this.player.camera.getWorldDirection(forward);

    // Spawn origin directly at screen center (camera position)
    const origin = this.player.camera.position.clone();

    const raycaster = new THREE.Raycaster(this.player.camera.position, forward, 0, 35);
    raycaster.camera = this.player.camera;
    let hitEnemy: EnemyInstance | null = null;
    let hitPoint = origin.clone().addScaledVector(forward, 28.0); // Default open air target position
    let isWallHit = false;

    // 1. Look for enemy targeted near crosshair (generous 3.0m ray distance threshold)
    let minDistance = 35;
    for (const enemy of this.enemies.enemies) {
      if (enemy.isDead || !enemy.mesh) continue;
      const enemyCenter = enemy.position.clone();
      enemyCenter.y += 0.5;

      const distToRay = raycaster.ray.distanceToPoint(enemyCenter);
      const distToPlayer = origin.distanceTo(enemyCenter);

      if (distToRay < 3.0 && distToPlayer < minDistance) {
        minDistance = distToPlayer;
        hitEnemy = enemy;
        hitPoint = enemyCenter;
      }
    }

    // 2. If no enemy targeted, raycast against solid level environment
    if (!hitEnemy && this.levelData && this.levelData.scene) {
      const candidates = this.getStaticLevelMeshes();

      try {
        const intersects = raycaster.intersectObjects(candidates, false);
        if (intersects && intersects.length > 0 && intersects[0]) {
          const hit = intersects[0];
          const isWallMesh = hit.object.name === 'wall' || (hit.object.parent && hit.object.parent.name === 'wall');
          const isVerticalNormal = hit.face ? Math.abs(hit.face.normal.y) < 0.7 : false;

          if (hit.distance < 32.0 && isWallMesh && isVerticalNormal) {
            hitPoint = hit.point.clone();
            isWallHit = true;
          }
        }
      } catch {
        // Safe guard against transient frame updates
      }
    }

    // Remove previous active meshes if any
    if (this.activeGrappleHookMesh) this.levelData.scene.remove(this.activeGrappleHookMesh);
    if (this.activeGrappleCableLine) this.levelData.scene.remove(this.activeGrappleCableLine);

    // Reuse the session-cached 3D Grapple Hook projectile & glowing cable
    if (!this.cachedGrappleHookMesh) this.cachedGrappleHookMesh = ModelBuilder.createGrappleHookMesh();
    this.activeGrappleHookMesh = this.cachedGrappleHookMesh;
    this.activeGrappleHookMesh.position.copy(origin);
    this.activeGrappleHookMesh.lookAt(origin.clone().add(forward));
    this.levelData.scene.add(this.activeGrappleHookMesh);

    if (!this.cachedGrappleCableLine) this.cachedGrappleCableLine = ModelBuilder.createGrappleCableLine();
    this.activeGrappleCableLine = this.cachedGrappleCableLine;
    // The cable endpoints move every frame while its bounding sphere is computed once from
    // the placeholder points, so frustum culling would hide it incorrectly.
    this.activeGrappleCableLine.frustumCulled = false;
    this.levelData.scene.add(this.activeGrappleCableLine);

    this.grappleState = {
      phase: 'shooting',
      currentPos: origin.clone(),
      targetPos: hitPoint.clone(),
      dir: forward.clone(),
      targetEnemy: hitEnemy,
      isWallHit,
      speed: 65.0,
    };
  }

  private updateGrappleHook(delta: number) {
    if (!this.grappleState || !this.activeGrappleHookMesh || !this.activeGrappleCableLine) return;

    // Origin anchored to screen center (camera position)
    // PERF: scratch vectors throughout - this method used to allocate 5-7 Vector3 per frame.
    const origin = this.tempGrappleOrigin.copy(this.player.camera.position);

    const state = this.grappleState;

    if (state.phase === 'shooting') {
      // Dynamic tracking if target enemy moves
      if (state.targetEnemy && !state.targetEnemy.isDead) {
        state.targetPos.copy(state.targetEnemy.position);
        state.targetPos.y += 0.5;
        state.dir.subVectors(state.targetPos, state.currentPos).normalize();
      }

      const step = state.speed * delta;
      const distToTarget = state.currentPos.distanceTo(state.targetPos);

      if (distToTarget <= step || (state.targetEnemy && state.currentPos.distanceTo(state.targetEnemy.position) < 1.8)) {
        if (state.targetEnemy && !state.targetEnemy.isDead) {
          // HIT ENEMY -> Latch hook and enter active enemy pull phase!
          state.phase = 'attached_enemy';
          this.addStylePoints(150, '⚡ GRAPPLE SNATCH');
          AudioEngine.playGrappleHook();
        } else if (state.isWallHit) {
          // HIT SOLID WALL -> Reel player in!
          state.currentPos.copy(state.targetPos);
          state.phase = 'attached_wall';
          this.player.isGrappling = true;
          this.player.grappleTargetPoint = state.targetPos.clone();
          this.addStylePoints(100, '🕸️ GRAPPLE DASH');
        } else {
          // MISSED (OPEN AIR / FLOOR / NO WALL HIT) -> RETRACT HOOK BACK TO PLAYER HAND!
          state.currentPos.copy(state.targetPos);
          state.phase = 'retracting';
          this.player.isGrappling = false;
          this.player.grappleTargetPoint = null;
          AudioEngine.playGrappleRetract();
          this.addStylePoints(20, '↩️ HOOK RECOIL');
        }
      } else {
        state.currentPos.addScaledVector(state.dir, step);
      }
    } else if (state.phase === 'attached_enemy') {
      const enemy = state.targetEnemy;
      if (!enemy || enemy.isDead) {
        state.phase = 'retracting';
        this.player.isGrappling = false;
        this.player.grappleTargetPoint = null;
        AudioEngine.playGrappleRetract();
      } else {
        // The pull drags the enemy across room boundaries while its AI (and, since the
        // matrix-freeze optimization, its matrixWorld) is frozen - unfreeze every frame
        // so the mesh visibly follows the hitbox, and force a room-id recompute so the
        // freeze logic re-evaluates where the enemy actually is.
        this.enemies.unfreezeEnemy(enemy);
        enemy.roomId = undefined;

        // Stick 3D hook to enemy center
        state.currentPos.copy(enemy.position);
        state.currentPos.y += 0.5;

        // Actively reel/drag enemy towards player
        const pullDir = this.tempGrapplePull.subVectors(origin, enemy.position);
        const distToPlayer = pullDir.length();

        if (distToPlayer <= 2.8) {
          // Enemy arrived right in front of player! Release and hover stunned!
          enemy.position.y = Math.max(enemy.position.y, origin.y - 0.2);
          enemy.knockbackVel = new THREE.Vector3(0, 5.0, 0); // Upward float for easy punch/headshot
          enemy.isStunned = true;
          enemy.stunTimer = 1.5;

          state.phase = 'retracting';
          this.player.isGrappling = false;
          this.player.grappleTargetPoint = null;
          AudioEngine.playGrappleRetract();
        } else {
          pullDir.normalize();
          const pullSpeed = 42.0; // Rapid pull speed
          enemy.position.addScaledVector(pullDir, pullSpeed * delta);
          enemy.position.y = Math.max(enemy.position.y, 1.2); // Elevate slightly off ground during pull
          enemy.isStunned = true;
          enemy.stunTimer = 1.5;
          if (enemy.knockbackVel) enemy.knockbackVel.set(0, 0, 0); // Prevent floor friction from interfering
        }
      }
    } else if (state.phase === 'attached_wall') {
      state.currentPos.copy(state.targetPos);
      const distPlayerToWall = origin.distanceTo(state.targetPos);
      if (distPlayerToWall < 2.5 || !this.player.isGrappling) {
        this.player.isGrappling = false;
        this.player.grappleTargetPoint = null;
        state.phase = 'retracting';
        AudioEngine.playGrappleRetract();
      }
    } else if (state.phase === 'retracting') {
      this.player.isGrappling = false;
      this.player.grappleTargetPoint = null;
      const retractDir = this.tempGrapplePull.subVectors(origin, state.currentPos);
      const distToPlayer = retractDir.length();
      const retractStep = 80.0 * delta;

      if (distToPlayer <= retractStep || distToPlayer < 1.2) {
        // Returned to player hand! Clean up meshes
        this.levelData.scene.remove(this.activeGrappleHookMesh);
        this.levelData.scene.remove(this.activeGrappleCableLine);
        this.activeGrappleHookMesh = null;
        this.activeGrappleCableLine = null;
        this.grappleState = null;
        return;
      } else {
        retractDir.normalize();
        state.currentPos.addScaledVector(retractDir, retractStep);
      }
    }

    // Update 3D Hook Mesh position, rotation & spinning animation
    if (this.activeGrappleHookMesh && this.grappleState) {
      this.activeGrappleHookMesh.position.copy(this.grappleState.currentPos);

      if (this.grappleState.phase === 'shooting') {
        this.activeGrappleHookMesh.lookAt(this.tempGrappleLook.copy(this.grappleState.currentPos).add(this.grappleState.dir));
      } else if (this.grappleState.phase === 'retracting' || this.grappleState.phase === 'attached_enemy' || this.grappleState.phase === 'attached_wall') {
        this.activeGrappleHookMesh.lookAt(origin);
      }
      this.activeGrappleHookMesh.rotation.z += delta * 20.0; // Claw spin animation
    }

    // Update glowing Cable Line vertices between player origin and hook head.
    // PERF: mutate the existing attribute in place - replacing it every frame allocated a
    // new Float32Array AND re-created the underlying GPU buffer.
    if (this.activeGrappleCableLine && this.grappleState) {
      const attr = this.activeGrappleCableLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      arr[0] = origin.x;
      arr[1] = origin.y;
      arr[2] = origin.z;
      arr[3] = this.grappleState.currentPos.x;
      arr[4] = this.grappleState.currentPos.y;
      arr[5] = this.grappleState.currentPos.z;
      attr.needsUpdate = true;
    }
  }

  private updateGrenade(delta: number) {
    if (!this.activeGrenadeMesh) return;

    this.grenadeTimer -= delta;

    // Gravity
    this.grenadeVelocity.y -= 22.0 * delta;

    // Move mesh position
    this.activeGrenadeMesh.position.addScaledVector(this.grenadeVelocity, delta);

    // Rotation spin
    this.activeGrenadeMesh.rotation.x += delta * 14.0;
    this.activeGrenadeMesh.rotation.z += delta * 8.0;

    // Blink top LED indicator faster as fuse timer nears 0
    // PERF: ref resolved once at throw time instead of getObjectByName per frame.
    const led = this.activeGrenadeLed;
    if (led && led.material) {
      const blinkSpeed = this.grenadeTimer < 0.4 ? 40 : 18;
      const opacity = Math.sin(performance.now() * 0.001 * blinkSpeed) > 0 ? 1.0 : 0.2;
      (led.material as THREE.MeshBasicMaterial).opacity = opacity;
    }

    // Floor collision & bounce
    const minY = 0.25;
    if (this.activeGrenadeMesh.position.y <= minY) {
      this.activeGrenadeMesh.position.y = minY;
      if (this.grenadeVelocity.y < 0) {
        this.grenadeVelocity.y = -this.grenadeVelocity.y * 0.45;
        this.grenadeVelocity.x *= 0.65;
        this.grenadeVelocity.z *= 0.65;
        if (Math.abs(this.grenadeVelocity.y) > 0.8) {
          AudioEngine.playRicochetImpact();
        }
      }
    }

    // Detonate when timer reaches 0
    if (this.grenadeTimer <= 0) {
      const explosionPos = this.activeGrenadeMesh.position.clone();
      this.levelData.scene.remove(this.activeGrenadeMesh);
      this.activeGrenadeMesh = null;
      this.detonateFlashbang(explosionPos);
    }
  }

  private detonateFlashbang(explosionPos: THREE.Vector3) {
    // 1. Visual explosion & flash light
    if (this.hitSplashes) {
      this.hitSplashes.spawn(explosionPos, true);
    }

    // 2. Stun nearby enemies with Line of Sight (LOS)
    let enemiesStunned = 0;
    for (const e of this.enemies.enemies) {
      if (e.isDead || !e.mesh) continue;

      const dist = e.position.distanceTo(explosionPos);
      if (dist < 26.0) {
        // Line of sight raycast from explosion to enemy
        const enemyCenter = e.position.clone();
        enemyCenter.y += 0.5;
        const dirToEnemy = enemyCenter.clone().sub(explosionPos);
        const distToEnemy = dirToEnemy.length();
        dirToEnemy.normalize();

        const raycaster = new THREE.Raycaster(explosionPos, dirToEnemy, 0, distToEnemy - 0.2);
        let isOccluded = false;

        if (this.levelData && this.levelData.scene) {
          const levelMeshes = this.getStaticLevelMeshes();
          try {
            const hits = raycaster.intersectObjects(levelMeshes, false);
            if (hits && hits.length > 0 && hits[0].distance < distToEnemy - 0.5) {
              isOccluded = true;
            }
          } catch {
            // Safe fallback
          }
        }

        if (!isOccluded) {
          e.isStunned = true;
          e.stunTimer = 4.0;
          e.hp -= 25;
          this.damageNumbers.spawn(e.position, 25, false);
          enemiesStunned++;
        }
      }
    }

    if (enemiesStunned > 0) {
      this.addStylePoints(200 + enemiesStunned * 50, `⚡ TACTICAL FLASHBANG (${enemiesStunned})`);
    }

    // 3. Player Blinding & Turning Away Check
    const cameraPos = this.player.camera.position.clone();
    const distToPlayer = cameraPos.distanceTo(explosionPos);

    let isPlayerBlinded = false;

    if (distToPlayer <= 28.0) {
      // A. Line of sight check (is wall blocking explosion from camera?)
      const dirToFlash = explosionPos.clone().sub(cameraPos);
      const distToFlash = dirToFlash.length();
      dirToFlash.normalize();

      const raycaster = new THREE.Raycaster(cameraPos, dirToFlash, 0, distToFlash - 0.2);
      let isWallBlocking = false;

      if (this.levelData && this.levelData.scene) {
        const candidates = this.getStaticLevelMeshes();
        try {
          const hits = raycaster.intersectObjects(candidates, false);
          if (hits && hits.length > 0 && hits[0].distance < distToFlash - 0.6) {
            isWallBlocking = true;
          }
        } catch {
          // Safe fallback
        }
      }

      // B. Camera Facing Angle Check (Did player turn away?)
      const camForward = new THREE.Vector3();
      this.player.camera.getWorldDirection(camForward);

      const dot = camForward.dot(dirToFlash);

      if (isWallBlocking) {
        // Wall blocked the flash! Safe!
        this.addStylePoints(50, '🛡️ COVERED FROM FLASH');
      } else if (dot <= 0.2) {
        // TURNED AWAY! (Отвернулся!)
        // Player gets minimal or no flash, avoiding full blindness!
        this.player.flashbangIntensity = 0.05;
        this.addStylePoints(200, '🙈 FLASHBANG DODGED!');
        AudioEngine.playRicochetImpact();
      } else {
        // LOOKING AT FLASHBANG! (Ослеплен!)
        isPlayerBlinded = true;

        // Calculate flash strength based on distance and how directly player was looking
        const angleFactor = Math.min(1.0, (dot - 0.2) / 0.8);
        const distFactor = Math.max(0.3, 1.0 - distToPlayer / 28.0);
        const intensity = angleFactor * distFactor;

        this.player.flashbangIntensity = Math.min(1.0, intensity * 1.3);
      }
    }

    // Play explosion audio (with tinnitus ringing if player is blinded!)
    AudioEngine.playFlashbang(isPlayerBlinded);
  }


  /** PERF: stable bound callbacks handed to EnemyEngine.update instead of per-frame closures. */
  private handleEnemyDamageToPlayer = (dmg: number) => {
    this.player.takeDamage(dmg);
    this.damageTaken += dmg;
    if (this.player.isDead) {
      this.onPlayerDeath();
      // PERF: nothing changes on screen behind the death overlay, yet the loop used to
      // keep rendering the whole scene at 60 fps indefinitely. Freeze the loop (the last
      // frame stays on the canvas, music keeps playing); restart builds a fresh engine
      // via sessionNonce and calls start().
      this.isRunning = false;
    }
  };

  private handleEnemyHealPlayer = (healAmount: number) => {
    this.player.heal(healAmount);
  };

  private handleEnemySlowPlayer = (slowDuration: number) => {
    this.player.applySlow(slowDuration);
    this.styleActionText = '⚠️ ЗАМЕДЛЕНИЕ (ПАУТИНА)';
  };

  private addStylePoints = (pts: number, actionName: string) => {
    this.styleScore += pts;
    this.styleActionText = actionName;

    const upper = actionName.toUpperCase();
    if (upper.includes('AIR') || upper.includes('COIN') || upper.includes('FLY')) {
      this.airtimeStylePts += pts;
    } else if (
      upper.includes('GRAPPLE') ||
      upper.includes('DASH') ||
      upper.includes('POUND') ||
      upper.includes('SLIDE') ||
      upper.includes('PUNCH')
    ) {
      this.movementStylePts += pts;
    } else {
      this.multikillStylePts += pts;
    }
  };

  private checkLevelCompletion(delta: number = 0.016) {
    // Check if player reached finish portal or killed all mobs
    const pPos = this.player.position;
    const fZone = this.levelData.finishZone;

    // PERF: kill counter maintained by EnemyEngine.killEnemy instead of a per-frame scan.
    const deadEnemiesCount = this.enemies ? this.enemies.deadCount : 0;
    this.killsCount = deadEnemiesCount;
    const remainingEnemiesCount = Math.max(0, this.totalEnemiesCount - deadEnemiesCount);

    let levelDone = false;
    const inFinishZone =
      pPos.x >= fZone.min.x &&
      pPos.x <= fZone.max.x &&
      pPos.z >= fZone.min.z &&
      pPos.z <= fZone.max.z;

    // Automatic level completion when all mobs are killed!
    if (this.totalEnemiesCount > 0 && remainingEnemiesCount === 0) {
      this.autoFinishTimer -= delta;
      if (this.autoFinishTimer <= 0) {
        levelDone = true;
      }
    } else if (inFinishZone) {
      if (remainingEnemiesCount === 0 || this.levelData.isSecretLevel) {
        levelDone = true;
      } else {
        this.styleActionText = `⚠️ УНИЧТОЖЬТЕ ВСЕХ ВРАГОВ (${remainingEnemiesCount} ОСТАЛОСЬ)`;
      }
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
      if (this.currentLevelNumber === 3 || this.currentLevelNumber === 4) unlockedNewWeapon = 'trembler';
      else if (this.currentLevelNumber === 7 || this.currentLevelNumber === 8) unlockedNewWeapon = 'punisher';

      const getCatRank = (pts: number): RankGrade => {
        if (pts >= 800) return 'S';
        if (pts >= 500) return 'A';
        if (pts >= 250) return 'B';
        if (pts >= 100) return 'C';
        return 'D';
      };

      let overallStyleRank = 'DESTRUCTIVE';
      if (this.styleScore > 3500) overallStyleRank = 'ULTRAKILL';
      else if (this.styleScore > 2400) overallStyleRank = 'SSADISTIC';
      else if (this.styleScore > 1400) overallStyleRank = 'SUPREME';
      else if (this.styleScore > 600) overallStyleRank = 'SAVAGE';

      const styleBreakdown: StyleBreakdown = {
        movementPoints: this.movementStylePts,
        airtimePoints: this.airtimeStylePts,
        multikillPoints: this.multikillStylePts,
        movementRank: getCatRank(this.movementStylePts),
        airtimeRank: getCatRank(this.airtimeStylePts),
        multikillRank: getCatRank(this.multikillStylePts),
        overallStyleRank,
      };

      const result: LevelResult = {
        completed: true,
        rank,
        score: this.styleScore,
        timeSec: Math.floor(this.levelTimeSec),
        kills: this.killsCount,
        totalEnemies: this.totalEnemiesCount,
        styleBreakdown,
      };

      this.onLevelFinish(result, unlockedNewWeapon);
    }
  }

  private getStaticLevelMeshes(): THREE.Object3D[] {
    if (!this.cachedLevelMeshes && this.levelData && this.levelData.scene) {
      this.cachedLevelMeshes = [];
      this.levelData.scene.traverse((obj) => {
        // NOTE: intentionally NOT filtered by obj.visible. Room culling now hides the
        // geometry of rooms the player isn't in, and collision must stay authoritative
        // regardless of what is being drawn - otherwise the player falls through culled
        // floors. Previously nothing was ever hidden, so dropping the visible check
        // reproduces the old candidate set exactly.
        if (obj.name === 'wall' || obj.name === 'ground') {
          this.cachedLevelMeshes!.push(obj);
        }
      });
    }
    return this.cachedLevelMeshes || [];
  }

  private updateHud() {
    let styleRank = STYLE_RANKS[0];
    if (this.styleScore > 3500) styleRank = STYLE_RANKS[4]; // ULTRAKILL
    else if (this.styleScore > 2400) styleRank = STYLE_RANKS[3]; // SSADISTIC
    else if (this.styleScore > 1400) styleRank = STYLE_RANKS[2]; // SUPREME
    else if (this.styleScore > 600) styleRank = STYLE_RANKS[1]; // SAVAGE

    // Boss HP check - visible ONLY when player is in the boss room
    // PERF: boss reference maintained at spawn/kill instead of a per-frame .find() scan.
    const boss = this.enemies ? this.enemies.activeBoss : null;
    let isPlayerInBossRoom = false;
    if (boss && this.player) {
      const distToBossSq = this.player.position.distanceToSquared(boss.position);
      const zDiff = Math.abs(this.player.position.z - boss.position.z);
      const xDiff = Math.abs(this.player.position.x - boss.position.x);
      if (distToBossSq < 2025.0 && zDiff < 38.0 && xDiff < 38.0) {
        isPlayerInBossRoom = true;
      }
    }

    let skillCdRatio = 0;
    if (this.player.currentWeapon === 'peacemaker') skillCdRatio = this.player.coinCd / 4.0;
    if (this.player.currentWeapon === 'trembler') skillCdRatio = this.player.flashbangCd / 8.0;
    if (this.player.currentWeapon === 'punisher') skillCdRatio = this.player.berserkCd / 25.0;

    const hp = Math.ceil(this.player.hp);
    // PERF: cooldown-style ratios are quantised to 0.05 steps. The old 0.01 quantisation
    // was finer than one frame of cooldown decay, so the change-detection "fast path"
    // never held during combat and the whole HUD re-rendered at up to 60 Hz.
    // Clamped away from 0 while the real value is positive, so READY indicators are
    // never shown early (berserk's 25 s cooldown would otherwise read READY ~0.6 s soon).
    const q = (x: number) => (x > 0 ? Math.max(0.05, Math.round(x * 20) / 20) : 0);
    const hvbCdRatio = q(this.player.hvbCooldown / this.player.maxHvbCd);
    const grappleCdRatio = q(this.player.grappleCooldown / this.player.maxGrappleCd);
    const roundedSkillCd = q(skillCdRatio);
    const flashbangIntensity = q(this.player.flashbangIntensity);
    const punchChargeRatio = q(this.player.punchChargeRatio);
    const levelTimeSec = Math.floor(this.levelTimeSec);
    // PERF: counter instead of a second per-frame scan over every enemy.
    const deadEnemiesCount = this.enemies ? this.enemies.deadCount : 0;
    this.killsCount = deadEnemiesCount;
    const aliveEnemiesCount = Math.max(0, this.totalEnemiesCount - deadEnemiesCount);
    // Boss HP keeps 1% granularity (one bar on screen; the extra updates are bounded).
    const bossHpRatio = isPlayerInBossRoom && boss ? Math.round((boss.hp / boss.maxHp) * 100) / 100 : undefined;

    // PERF: field-by-field change detection against the previous snapshot - no template
    // string (16 number->string conversions) built per frame just to compare.
    const s = this.lastHudSnapshot;
    if (
      s.hp === hp &&
      s.dashCharges === this.player.dashCharges &&
      s.weapon === this.player.currentWeapon &&
      s.hvbCdRatio === hvbCdRatio &&
      s.grappleCdRatio === grappleCdRatio &&
      s.skillCdRatio === roundedSkillCd &&
      s.styleScore === this.styleScore &&
      s.styleActionText === this.styleActionText &&
      s.flashbangIntensity === flashbangIntensity &&
      s.berserkActive === this.player.isBerserkActive &&
      s.isChargingPunch === this.player.isChargingPunch &&
      s.punchChargeRatio === punchChargeRatio &&
      s.bossHpRatio === bossHpRatio &&
      s.levelTimeSec === levelTimeSec &&
      s.killsCount === this.killsCount &&
      s.aliveEnemiesCount === aliveEnemiesCount
    ) {
      return;
    }
    s.hp = hp;
    s.dashCharges = this.player.dashCharges;
    s.weapon = this.player.currentWeapon;
    s.hvbCdRatio = hvbCdRatio;
    s.grappleCdRatio = grappleCdRatio;
    s.skillCdRatio = roundedSkillCd;
    s.styleScore = this.styleScore;
    s.styleActionText = this.styleActionText;
    s.flashbangIntensity = flashbangIntensity;
    s.berserkActive = this.player.isBerserkActive;
    s.isChargingPunch = this.player.isChargingPunch;
    s.punchChargeRatio = punchChargeRatio;
    s.bossHpRatio = bossHpRatio;
    s.levelTimeSec = levelTimeSec;
    s.killsCount = this.killsCount;
    s.aliveEnemiesCount = aliveEnemiesCount;

    this.onHudUpdate({
      hp,
      maxHp: this.player.maxHp,
      dashCharges: this.player.dashCharges,
      currentWeapon: this.player.currentWeapon,
      hvbCdRatio,
      grappleCdRatio,
      skillCdRatio: roundedSkillCd,
      styleScore: this.styleScore,
      styleRank,
      styleActionText: this.styleActionText,
      flashbangIntensity,
      berserkActive: this.player.isBerserkActive,
      isChargingPunch: this.player.isChargingPunch,
      punchChargeRatio,
      bossHpRatio,
      bossName: isPlayerInBossRoom && boss ? boss.type.replace('boss_', '').toUpperCase() : undefined,
      levelTimeSec,
      hasFlashlight: this.levelData.hasFlashlight,
      killsCount: this.killsCount,
      totalEnemiesCount: this.totalEnemiesCount,
      aliveEnemiesCount,
    });
  }

  private shootRaycastDamage(damage: number) {
    if (!this.enemies || !this.enemies.enemies || !this.player) return;

    // Start position slightly below/right of camera to originate near viewmodel muzzle
    const camPos = this.player.camera.position;
    this.player.camera.getWorldDirection(this.shootDir);

    this.tempRight.crossVectors(this.shootDir, this.player.camera.up).normalize();
    this.tempUp.crossVectors(this.tempRight, this.shootDir).normalize();
    this.tempTracerStart.copy(camPos).addScaledVector(this.tempRight, 0.25).addScaledVector(this.tempUp, -0.2);

    this.shootRaycaster.set(camPos, this.shootDir);
    this.shootRaycaster.camera = this.player.camera; // Required for Three.js sprite/mesh raycasting

    // 1. Raycast against environment geometry first to find wall/obstacle obstruction distance
    let wallHitDistance = 1000.0;
    this.tempTracerEnd.copy(camPos).addScaledVector(this.shootDir, 45.0);

    if (this.levelData && this.levelData.scene) {
      const levelMeshes = this.getStaticLevelMeshes();
      this.nearMeshesTemp.length = 0;
      for (let i = 0; i < levelMeshes.length; i++) {
        if (levelMeshes[i].position.distanceToSquared(camPos) < 1600) {
          this.nearMeshesTemp.push(levelMeshes[i]);
        }
      }
      const targets = this.nearMeshesTemp.length > 0 ? this.nearMeshesTemp : levelMeshes;
      try {
        const hits = this.shootRaycaster.intersectObjects(targets, false);
        if (hits && hits.length > 0) {
          wallHitDistance = hits[0].distance;
          this.tempTracerEnd.copy(hits[0].point);
        }
      } catch {
        // Safe fallback
      }
    }

    // 2. Single pass search for closest enemy BEFORE the wall hit distance
    let closestEnemy: EnemyInstance | null = null;
    let closestDistance = wallHitDistance - 0.2;

    for (let i = 0; i < this.enemies.enemies.length; i++) {
      const enemy = this.enemies.enemies[i];
      if (enemy.isDead || !enemy.mesh || !enemy.mesh.parent) continue;

      try {
        this.tempEnemyCenter.copy(enemy.position);
        this.tempEnemyCenter.y += 0.5; // Torso center

        const hitDistance = camPos.distanceTo(this.tempEnemyCenter);

        // Cannot hit enemy if a wall is in front or enemy is too far
        if (hitDistance >= closestDistance || hitDistance > 80.0) continue;

        const distanceToRay = this.shootRaycaster.ray.distanceToPoint(this.tempEnemyCenter);

        const isBoss = enemy.type.startsWith('boss_');
        const isAirborne = enemy.position.y > 1.2 || (enemy.knockbackVel && enemy.knockbackVel.lengthSq() > 0.2);
        // Realistic tight hitbox radius so bullets don't hit enemies way off to the side
        const thresholdRadius = isBoss ? 1.8 : (isAirborne ? 1.0 : 0.85);

        if (distanceToRay <= thresholdRadius) {
          closestDistance = hitDistance;
          closestEnemy = enemy;
          this.tempHitPoint.copy(this.tempEnemyCenter);
        }
      } catch {
        // Safe guard against mid-frame object disposal
      }
    }

    if (closestEnemy) {
      // ONLY hit the FIRST closest enemy (bullet stops at this enemy and does NOT pierce)
      this.tempTracerEnd.copy(this.tempHitPoint);

      let finalDamage = damage;

      if (this.player.isBerserkActive) {
        finalDamage = Math.round(damage * 1.8);
      }

      // Pavise carriers (mine warden, praetorian) soak shots that land on the raised
      // shield - the punish window is to flank them or wait for the shield to drop.
      finalDamage = Math.round(finalDamage * this.enemies.getIncomingDamageMultiplier(closestEnemy, camPos));

      closestEnemy.hp -= finalDamage;
      if (closestEnemy.isRoomFrozen) {
        this.enemies.unfreezeEnemy(closestEnemy);
      }

      const isAirborne = closestEnemy.position.y > 1.5 || (closestEnemy.knockbackVel && closestEnemy.knockbackVel.lengthSq() > 0.5);
      const actionName = isAirborne ? '✈️ AIRSHOT!' : 'HIT';
      const points = isAirborne ? 250 : 50;

      this.addStylePoints(points, actionName);

      if (this.damageNumbers) {
        this.damageNumbers.spawn(this.tempHitPoint, finalDamage, false);
      }
      if (this.hitSplashes) {
        this.hitSplashes.spawn(this.tempHitPoint, isAirborne);
      }

      if (closestEnemy.hp <= 0) {
        this.enemies.killEnemy(closestEnemy, false, this.addStylePoints);
      }
    }

    // Spawn 3D color-coded bullet tracer line
    if (this.tracers) {
      if (this.player.currentWeapon === 'trembler') {
        // Multi-pellet shotgun spread tracers
        for (let s = 0; s < 5; s++) {
          this.tempSpreadDir.copy(this.shootDir);
          this.tempSpreadDir.x += (Math.random() - 0.5) * 0.12;
          this.tempSpreadDir.y += (Math.random() - 0.5) * 0.12;
          this.tempSpreadDir.z += (Math.random() - 0.5) * 0.12;
          this.tempSpreadDir.normalize();
          this.tempTracerEnd.copy(camPos).addScaledVector(this.tempSpreadDir, Math.min(35.0, wallHitDistance));
          this.tracers.spawnTracer(this.tempTracerStart, this.tempTracerEnd, 'trembler', this.player.isBerserkActive);
        }
      } else {
        this.tracers.spawnTracer(
          this.tempTracerStart,
          this.tempTracerEnd,
          this.player.currentWeapon,
          this.player.isBerserkActive
        );
      }
    }
  }

  private onWindowResize = () => {
    if (!this.renderer || !this.player) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.player.camera.aspect = window.innerWidth / window.innerHeight;
    this.player.camera.updateProjectionMatrix();
  };

  /**
   * PERF / LEAK FIX: release the GPU resources owned by the current level's scene.
   *
   * A fresh Scene was built for every level (and every retry), but nothing ever disposed the
   * old one - so geometries, materials and canvas textures stayed resident in GPU memory for
   * the whole session. Playing several levels in a row therefore got progressively slower and
   * could end in an out-of-memory context loss, which matches "the longer I play the worse
   * it gets".
   *
   * Shared caches (ModelBuilder's geometry/material cache and TextureGenerator's texture
   * cache) are deliberately preserved: they're reused by the next level, and disposing them
   * would force a full regeneration - trading a leak for a stall. Only per-level resources
   * are released, identified by walking the level scene.
   */
  private disposeLevelScene() {
    if (!this.levelData || !this.levelData.scene) return;

    const scene = this.levelData.scene;

    // The player camera (and its viewmodel children) outlive the level - detach first so the
    // traversal below can't reach and dispose the weapon models.
    if (this.player && this.player.camera.parent === scene) {
      scene.remove(this.player.camera);
    }

    // Session-cached gadget meshes also outlive the level (they may still be parented to
    // the dying scene if the level ended mid-grapple/throw/toss) - detach them so the
    // traversal below can't dispose their reusable resources (the cable's geometry is
    // per-instance and mutated in place, so a disposal here would be reused next level).
    for (const gadget of [
      this.cachedGrappleHookMesh,
      this.cachedGrappleCableLine,
      this.cachedGrenadeMesh,
      this.cachedCoinMesh,
    ]) {
      if (gadget && gadget.parent === scene) {
        scene.remove(gadget);
      }
    }

    const disposedGeometries = new Set<THREE.BufferGeometry>();
    const disposedMaterials = new Set<THREE.Material>();

    const isShared = (resource: THREE.BufferGeometry | THREE.Material): boolean =>
      ModelBuilder.isCachedResource(resource);

    const disposeMaterial = (material: THREE.Material) => {
      if (disposedMaterials.has(material) || isShared(material)) return;
      disposedMaterials.add(material);

      // Free textures owned by this material, but never the shared generated ones.
      const mat = material as unknown as Record<string, unknown>;
      for (const key of ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'displacementMap', 'envMap']) {
        const tex = mat[key] as THREE.Texture | null | undefined;
        if (tex && tex.isTexture && !TextureGenerator.isCachedTexture(tex)) {
          tex.dispose();
        }
      }

      material.dispose();
    };

    scene.traverse((obj) => {
      const withGeo = obj as THREE.Mesh;
      if (withGeo.geometry && !disposedGeometries.has(withGeo.geometry) && !isShared(withGeo.geometry)) {
        disposedGeometries.add(withGeo.geometry);
        withGeo.geometry.dispose();
      }

      const material = (obj as THREE.Mesh).material;
      if (material) {
        if (Array.isArray(material)) {
          for (const m of material) disposeMaterial(m);
        } else {
          disposeMaterial(material);
        }
      }
    });

    scene.clear();
  }

  public destroy() {
    this.stop();
    if (this.damageNumbers) {
      this.damageNumbers.clear();
    }
    if (this.hitSplashes) {
      this.hitSplashes.destroy();
    }
    if (this.tracers) {
      this.tracers.destroy();
    }
    // Release this level's GPU resources before tearing the renderer down.
    this.disposeLevelScene();
    window.removeEventListener('resize', this.onWindowResize);
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
    // Browsers cap live WebGL contexts (~16); every level start/restart builds a fresh
    // renderer, so without an explicit context loss long sessions hit "oldest context
    // will be lost" and the game goes black.
    this.renderer.forceContextLoss();
  }
}

