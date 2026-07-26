import * as THREE from 'three';
import { ModelBuilder } from './3d/ModelBuilder';
import { EnemyType } from '../types';
import { AudioEngine } from '../audio/AudioEngine';
import { LevelGenerator, RoomInfo } from './3d/LevelGenerator';
import { HitSplashes } from './3d/HitSplashes';

export interface FountainDropletData {
  angle: number;
  speedY: number;
  currentY: number;
  currentR: number;
  maxR: number;
  scale: number;
}

export interface NanoFluidCloud {
  position: THREE.Vector3;
  mesh: THREE.Group;
  duration: number;
  maxDuration: number;
  healAmount: number;
  droplets?: FountainDropletData[];
  instancedDroplets?: THREE.InstancedMesh;
  jet?: THREE.Mesh;
  ripple1?: THREE.Mesh;
  ripple2?: THREE.Mesh;
  ring1?: THREE.Mesh;
  ring2?: THREE.Mesh;
  light?: THREE.PointLight;
  rippleMat1?: THREE.MeshBasicMaterial;
  rippleMat2?: THREE.MeshBasicMaterial;
}

export interface EnemyInstance {
  id: string;
  type: EnemyType;
  mesh: THREE.Group;
  hp: number;
  maxHp: number;
  isDead: boolean;
  isStunned: boolean;
  stunTimer: number;
  attackCooldown: number;
  position: THREE.Vector3;
  isBoss: boolean;
  telegraphTimer: number; // For snipers or laser beams
  knockbackVel?: THREE.Vector3;
  ricochetBounces?: number;
  lastRicochetTime?: number;
  isAggroed?: boolean;
  isRoomFrozen?: boolean;
  isPassive?: boolean;
  roomId?: number;
  spawnRoomId?: number;
  dashStage?: number;
  dashTimer?: number;
  dashDir?: THREE.Vector3;
  dashZigzagSign?: number;
  backflipTimer?: number;
  backflipCooldown?: number;
  backflipDir?: THREE.Vector3;
  baseY?: number;
  jumpTimer?: number;
  jumpDuration?: number;
  jumpCooldown?: number;
  jumpStartPos?: THREE.Vector3;
  jumpTargetPos?: THREE.Vector3;
  jumpBaseY?: number;
  minigunBurstTimer?: number;
  centipedeState?: 'charge' | 'microdash' | 'retreat';
  centipedeTimer?: number;
  centipedeHomePos?: THREE.Vector3;
  rammedPlayer?: boolean;
  wormState?: 'idle' | 'burrow_down' | 'burrow_underground' | 'emerge_up' | 'charge_dash' | 'dashing';
  wormTimer?: number;
  wormTargetPos?: THREE.Vector3;
  wormDashDir?: THREE.Vector3;
  wormTelegraphMesh?: THREE.Mesh;
  wormDashTelegraphMesh?: THREE.Mesh;
  wormAttackType?: 'burrow' | 'dash';
  wormRammedPlayer?: boolean;
  /**
   * PERF: direct references to the animated sub-meshes, resolved once at spawn.
   * Animating these used to require a full mesh.traverse() per enemy per frame - and enemy
   * models contain well over a hundred child meshes each (bolts, plates, whiskers), so the
   * traversal cost dwarfed the handful of rotations it was looking for.
   */
  animParts?: EnemyAnimParts;
  /**
   * PERF: cached line-of-sight result. A fresh LOS query is a raycast against level
   * geometry; with many shooters that used to run per enemy, per frame. The cache is
   * refreshed when it is older than LOS_TTL or the player moved > LOS_MOVE_EPS since the
   * last sample, subject to a small per-frame raycast budget shared by all enemies.
   */
  losResult?: boolean;
  losTime?: number;
  losSampledPos?: THREE.Vector3;
}

/** Animated sub-meshes of an enemy model, looked up once instead of via per-frame traverse. */
export interface EnemyAnimParts {
  legsForward: THREE.Object3D[];  // leg_FL + leg_RR (swing in phase)
  legsBackward: THREE.Object3D[]; // leg_FR + leg_RL (swing anti-phase)
  fanBlades: THREE.Object3D[];
  minigunBarrels: THREE.Object3D[];
  mouthJaw: THREE.Object3D | null;
  mouthRpg: THREE.Object3D | null;
  roboArm: THREE.Object3D | null;
  roboRightArm: THREE.Object3D | null;
  /** True when the model has no animated parts at all - lets callers skip the work entirely. */
  isEmpty: boolean;
}

/** Resolves the animated-part references for a freshly built enemy model. */
function collectEnemyAnimParts(mesh: THREE.Group): EnemyAnimParts {
  const parts: EnemyAnimParts = {
    legsForward: [],
    legsBackward: [],
    fanBlades: [],
    minigunBarrels: [],
    mouthJaw: null,
    mouthRpg: null,
    roboArm: null,
    roboRightArm: null,
    isEmpty: true,
  };

  mesh.traverse((child) => {
    switch (child.name) {
      case 'leg_FL':
      case 'leg_RR':
        parts.legsForward.push(child);
        break;
      case 'leg_FR':
      case 'leg_RL':
        parts.legsBackward.push(child);
        break;
      case 'ultrafan_blades':
        parts.fanBlades.push(child);
        break;
      case 'minigun_barrels':
        parts.minigunBarrels.push(child);
        break;
      case 'boss_mouth_jaw':
        parts.mouthJaw = child;
        break;
      case 'mouth_rpg':
        parts.mouthRpg = child;
        break;
      case 'robo_arm':
        parts.roboArm = child;
        break;
      case 'robo_right_arm':
        parts.roboRightArm = child;
        break;
    }
  });

  parts.isEmpty =
    parts.legsForward.length === 0 &&
    parts.legsBackward.length === 0 &&
    parts.fanBlades.length === 0 &&
    parts.minigunBarrels.length === 0 &&
    parts.mouthJaw === null &&
    parts.mouthRpg === null &&
    parts.roboArm === null &&
    parts.roboRightArm === null;

  return parts;
}

export interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  isEnemy: boolean;
  life: number;
  isDynamite?: boolean;
  isToxic?: boolean;
  isWeb?: boolean;
}

export const ENEMY_DISPLAY_NAMES: Record<EnemyType, string> = {
  robo_doman: 'РОБО-ДОМАН',
  doman_sniper: 'ДОМАН-СНАЙПЕР',
  drone: 'ПАТРУЛЬНЫЙ ДРОН',
  centipede: 'МНОГОНОЖКА',
  worm: 'ДОМАН С БОЧКОЙ',
  spider_spitter: 'ПАУК-ПЛЕВАЛЬЩИК',
  doman_dynamiter: 'ДОМАН-ДИНАМИТЧИК',
  doman_miner: 'ДОМАН-ШАХТЕР',
  doman_archer: 'ДОМАН-ЛУЧНИК',
  imp_doman: 'АДСКИЙ БЕС',
  winged_doman: 'КРЫЛАТЫЙ ДОМАН',
  skeleton_doman: 'ДОМАН-СКЕЛЕТ',
  boss_goliath: 'БОСС: ГОЛИАФ',
  boss_worm: 'БОСС: ГИГАНТСКИЙ ЧЕРВЬ',
  boss_miner: 'БОСС: ВЛАДЫКА ШАХТ',
  boss_overlord: 'БОСС: ДЕМОНИЧЕСКИЙ ВЛАДЫКА',
  boss_ultradoman: 'БОСС: УЛЬТРАДОМАН',
};

export function createNameLabelSprite(text: string, isBoss: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 512, 128);

    ctx.fillStyle = isBoss ? 'rgba(153, 27, 27, 0.92)' : 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(16, 16, 480, 96, 20);
    ctx.fill();

    ctx.strokeStyle = isBoss ? '#f87171' : '#38bdf8';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = isBoss ? '#ef4444' : '#0284c7';
    ctx.shadowBlur = 12;
    ctx.fillText(text, 256, 64);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(isBoss ? 5.5 : 4.0, isBoss ? 1.38 : 1.0, 1.0);
  sprite.renderOrder = 999;
  return sprite;
}

export class EnemyEngine {
  public enemies: EnemyInstance[] = [];
  public projectiles: Projectile[] = [];
  public nanoClouds: NanoFluidCloud[] = [];
  public onDamageNumber?: (pos: THREE.Vector3, amount: number, isCrit: boolean) => void;
  public onHitSplash?: (pos: THREE.Vector3, isCrit?: boolean) => void;
  private scene: THREE.Scene;
  private cachedObstacles: THREE.Object3D[] | null = null;
  private knockbackRaycaster = new THREE.Raycaster();
  private downRaycaster = new THREE.Raycaster();
  private tempDir = new THREE.Vector3();
  private tempDir2 = new THREE.Vector3();
  private tempVec = new THREE.Vector3();
  private tempNormal = new THREE.Vector3();
  private rayOriginTemp = new THREE.Vector3();
  private nearObstaclesTemp: THREE.Object3D[] = [];
  private dummyLookObj = new THREE.Object3D();

  /**
   * PERF: id -> RoomInfo index, rebuilt only when the room array identity changes
   * (i.e. on level load). Replaces a per-enemy, per-frame rooms.find() linear scan.
   */
  private roomIndex: Map<number, RoomInfo> = new Map();
  private roomIndexSource: RoomInfo[] | null = null;

  private refreshRoomIndex(rooms?: RoomInfo[]) {
    if (!rooms || rooms.length === 0) {
      if (this.roomIndexSource !== null) {
        this.roomIndex.clear();
        this.roomIndexSource = null;
      }
      return;
    }
    if (this.roomIndexSource === rooms) return;

    this.roomIndexSource = rooms;
    this.roomIndex.clear();
    for (let i = 0; i < rooms.length; i++) {
      this.roomIndex.set(rooms[i].id, rooms[i]);
    }
  }

  private getRoomById(roomId: number | undefined, rooms?: RoomInfo[]): RoomInfo | undefined {
    if (!rooms || rooms.length === 0) return undefined;
    // Self-healing: ensures correctness even if called before the per-update refresh.
    this.refreshRoomIndex(rooms);
    if (roomId === undefined) return rooms[0];
    return this.roomIndex.get(roomId) ?? rooms[0];
  }

  private getObstacles(): THREE.Object3D[] {
    if (!this.cachedObstacles) {
      // NOTE: no obj.visible filter - room culling hides distant room geometry, but
      // knockback/ricochet collision must still respect those walls.
      this.cachedObstacles = this.scene.children.filter((obj) => obj.name === 'wall' || obj.name === 'ground');
      // PERF: world-space AABB per obstacle root, computed once (level geometry is static).
      // Rays are pre-tested against these boxes so the expensive recursive triangle raycast
      // only ever runs against the handful of obstacle subtrees the ray can actually touch.
      this.cachedObstacleBoxes = this.cachedObstacles.map((obj) => new THREE.Box3().setFromObject(obj));
    }
    return this.cachedObstacles;
  }

  private losRaycaster = new THREE.Raycaster();
  private cachedObstacleBoxes: THREE.Box3[] | null = null;
  private losScratchRay = new THREE.Ray();
  private losScratchHit = new THREE.Vector3();
  private losStart = new THREE.Vector3();
  private losDir = new THREE.Vector3();
  private rayCandidatesTemp: THREE.Object3D[] = [];

  /** Per-frame budget of fresh LOS raycasts, reset in update(). */
  private losBudgetRemaining = 0;
  private static readonly EMPTY_HITS: THREE.Intersection[] = [];
  private projOldPos = new THREE.Vector3();
  private projDir = new THREE.Vector3();
  private tempStep = new THREE.Vector3();
  /** Scratch result for clampPosInRoom - callers consume x/z immediately. */
  private clampResult = { x: 0, z: 0 };

  /** Running total of killed enemies (replaces per-frame isDead scans). */
  public deadCount = 0;
  /** The currently alive boss, maintained at spawn/kill (replaces a per-frame .find()). */
  public activeBoss: EnemyInstance | null = null;
  /** Set when a kill happens; the array is compacted at the start of the next update(). */
  private hasDeadEntries = false;
  /** Accumulated simulation time, used to age LOS cache entries. */
  private timeAcc = 0;

  private static readonly LOS_TTL = 0.12; // seconds a cached LOS result stays fresh
  private static readonly LOS_MOVE_EPS_SQ = 6.25; // (2.5 m)^2 player travel forces refresh
  private static readonly LOS_BUDGET_PER_FRAME = 6;
  private static readonly WALL_PROBE_ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

  /**
   * PERF: narrow the obstacle list to subtrees whose AABB the ray actually crosses.
   * Conservative (a superset of real hits), so raycast semantics are unchanged.
   */
  private collectObstaclesAlongRay(origin: THREE.Vector3, dir: THREE.Vector3, far: number): THREE.Object3D[] {
    const obstacles = this.getObstacles();
    const boxes = this.cachedObstacleBoxes!;
    this.rayCandidatesTemp.length = 0;
    this.losScratchRay.origin.copy(origin);
    this.losScratchRay.direction.copy(dir);
    const farSq = far * far;
    for (let i = 0; i < obstacles.length; i++) {
      const hit = this.losScratchRay.intersectBox(boxes[i], this.losScratchHit);
      if (hit && hit.distanceToSquared(origin) <= farSq) {
        this.rayCandidatesTemp.push(obstacles[i]);
      }
    }
    return this.rayCandidatesTemp;
  }

  /**
   * PERF: obstacles whose AABB lies within `range` of a point. Conservative superset of
   * anything a short ray from that point could hit, so raycast semantics are unchanged.
   */
  private collectObstaclesNearPoint(point: THREE.Vector3, range: number): THREE.Object3D[] {
    const obstacles = this.getObstacles();
    const boxes = this.cachedObstacleBoxes!;
    this.nearObstaclesTemp.length = 0;
    for (let i = 0; i < obstacles.length; i++) {
      if (boxes[i].distanceToPoint(point) <= range) {
        this.nearObstaclesTemp.push(obstacles[i]);
      }
    }
    return this.nearObstaclesTemp;
  }

  private computeLOS(fromPos: THREE.Vector3, toPos: THREE.Vector3): boolean {
    const obstacles = this.getObstacles();
    if (!obstacles || obstacles.length === 0) return true;

    this.losStart.copy(fromPos);
    this.losStart.y += 1.0;
    this.losDir.copy(toPos);
    this.losDir.y += 1.0;
    this.losDir.sub(this.losStart);

    const maxDist = this.losDir.length();
    if (maxDist < 0.2) return true;
    this.losDir.normalize();

    const far = Math.max(0.2, maxDist - 0.6);
    const candidates = this.collectObstaclesAlongRay(this.losStart, this.losDir, far);
    if (candidates.length === 0) return true;

    this.losRaycaster.set(this.losStart, this.losDir);
    this.losRaycaster.near = 0.2;
    this.losRaycaster.far = far;

    try {
      const hits = this.losRaycaster.intersectObjects(candidates, true);
      return hits.length === 0;
    } catch {
      return true;
    }
  }

  /**
   * Cached LOS from an enemy to the player. Stale entries refresh subject to the shared
   * per-frame raycast budget; between refreshes the last known answer is reused (max error:
   * ~2.5 m of player travel or 120 ms, well under any enemy telegraph window).
   */
  private hasLineOfSight(enemy: EnemyInstance, playerPos: THREE.Vector3): boolean {
    const stale =
      enemy.losSampledPos === undefined ||
      this.timeAcc - (enemy.losTime ?? 0) > EnemyEngine.LOS_TTL ||
      playerPos.distanceToSquared(enemy.losSampledPos) > EnemyEngine.LOS_MOVE_EPS_SQ;

    if (stale && this.losBudgetRemaining > 0) {
      this.losBudgetRemaining--;
      enemy.losResult = this.computeLOS(enemy.position, playerPos);
      enemy.losTime = this.timeAcc;
      if (!enemy.losSampledPos) enemy.losSampledPos = new THREE.Vector3();
      enemy.losSampledPos.copy(playerPos);
    }
    // Until first computed, hold fire (false) rather than shoot through walls.
    return enemy.losResult ?? false;
  }

  public invalidateObstacleCache() {
    this.cachedObstacles = null;
    this.cachedObstacleBoxes = null;
  }

  // Shared optimized Fountain geometries & materials
  private fPoolGeo = new THREE.CircleGeometry(2.4, 16);
  private fRippleGeo = new THREE.TorusGeometry(1.0, 0.04, 6, 12);
  private fBeamGeo = new THREE.CylinderGeometry(0.8, 1.4, 6.0, 8, 1, true);
  private fJetGeo = new THREE.ConeGeometry(1.2, 5.0, 8);
  private fRingGeo = new THREE.TorusGeometry(1.3, 0.06, 6, 12);
  private fBeaconGeo = new THREE.CylinderGeometry(0.1, 0.1, 30.0, 4);
  private fDropGeo = new THREE.IcosahedronGeometry(0.10, 0);
  private fDropMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 });
  private tempObject = new THREE.Object3D();

  // Shared static materials for nano-puddles
  private nanoPoolMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  private nanoRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  private nanoPool: { mesh: THREE.Group; active: boolean; position: THREE.Vector3; duration: number; maxDuration: number; healAmount: number }[] = [];

  // Shared static materials & pool for toxic green puddles
  private toxicPoolMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  private toxicRingMat = new THREE.MeshBasicMaterial({ color: 0x6ee7b7, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  private toxicCoreMat = new THREE.MeshBasicMaterial({ color: 0xa7f3d0 });

  // Shared boss telegraph geometries and materials
  private wormTelegraphGeo = new THREE.RingGeometry(0.2, 4.2, 32);
  private wormTelegraphMat = new THREE.MeshBasicMaterial({ color: 0xff0044, side: THREE.DoubleSide, transparent: true, opacity: 0.75, depthWrite: false });
  private wormDashTelegraphGeo = new THREE.PlaneGeometry(3.2, 28.0);
  private wormDashTelegraphMat = new THREE.MeshBasicMaterial({ color: 0xff1100, side: THREE.DoubleSide, transparent: true, opacity: 0.65, depthWrite: false });
  private toxicPool: {
    mesh: THREE.Group;
    active: boolean;
    position: THREE.Vector3;
    duration: number;
    maxDuration: number;
    damageTimer: number;
    radius: number;
    bubbles: THREE.Mesh[];
  }[] = [];

  public isSecretLevel: boolean = false;

  constructor(scene: THREE.Scene, isSecretLevel: boolean = false) {
    this.scene = scene;
    this.isSecretLevel = isSecretLevel;

    // Pre-allocate nano puddle pool (zero allocations during gameplay)
    for (let i = 0; i < 16; i++) {
      const group = new THREE.Group();
      const pool = new THREE.Mesh(this.fPoolGeo, this.nanoPoolMat);
      pool.position.y = 0.04;
      pool.rotation.x = -Math.PI / 2;
      group.add(pool);

      const ring = new THREE.Mesh(this.fRippleGeo, this.nanoRingMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.05;
      ring.scale.setScalar(2.4);
      group.add(ring);

      group.visible = false;
      group.frustumCulled = false;
      this.scene.add(group);

      this.nanoPool.push({
        mesh: group,
        active: false,
        position: group.position,
        duration: 0,
        maxDuration: 5.0,
        healAmount: 40,
      });
    }

    // Pre-allocate toxic pool (zero allocations during gameplay)
    for (let i = 0; i < 20; i++) {
      const group = new THREE.Group();
      const pool = new THREE.Mesh(this.fPoolGeo, this.toxicPoolMat);
      pool.position.y = 0.04;
      pool.rotation.x = -Math.PI / 2;
      group.add(pool);

      const ring = new THREE.Mesh(this.fRippleGeo, this.toxicRingMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.05;
      ring.scale.setScalar(2.4);
      group.add(ring);

      const bubbleGeo = new THREE.SphereGeometry(0.12, 8, 8);
      const bubbles: THREE.Mesh[] = [];
      for (let b = 0; b < 4; b++) {
        const bubble = new THREE.Mesh(bubbleGeo, this.toxicCoreMat);
        const angle = (b / 4) * Math.PI * 2;
        bubble.position.set(Math.cos(angle) * 0.8, 0.1, Math.sin(angle) * 0.8);
        group.add(bubble);
        bubbles.push(bubble);
      }

      group.visible = false;
      group.frustumCulled = false;
      this.scene.add(group);

      this.toxicPool.push({
        mesh: group,
        active: false,
        position: group.position,
        duration: 0,
        maxDuration: 12.0,
        damageTimer: 0,
        radius: 2.8,
        bubbles,
      });
    }
  }

  public spawnEnemy(type: EnemyType, position: THREE.Vector3, roomId: number = 1): EnemyInstance {
    const mesh = ModelBuilder.createEnemyMesh(type);
    mesh.position.copy(position);
    this.scene.add(mesh);

    let maxHp = 40;
    let isBoss = false;

    if (type === 'doman_sniper') maxHp = 30;
    if (type === 'drone') maxHp = 25;
    if (type === 'centipede') maxHp = 50;
    if (type === 'worm') maxHp = 70;
    if (type === 'doman_dynamiter') maxHp = 20;
    if (type === 'skeleton_doman') maxHp = 80;

    // Bosses
    if (type === 'boss_goliath') {
      maxHp = 1000;
      isBoss = true;
    } else if (type === 'boss_worm') {
      maxHp = 1400;
      isBoss = true;
    } else if (type === 'boss_miner') {
      maxHp = 1800;
      isBoss = true;
    } else if (type === 'boss_overlord') {
      maxHp = 2500;
      isBoss = true;
    } else if (type === 'boss_ultradoman') {
      maxHp = 3000;
      isBoss = true;
    }

    maxHp = Math.round(maxHp * 3.2); // Enemy health (3.2x base)

    const isPassive = this.isSecretLevel;

    if (isPassive) {
      const nameText = ENEMY_DISPLAY_NAMES[type] || type;
      const labelSprite = createNameLabelSprite(nameText, isBoss);

      let yOffset = isBoss ? 4.8 : 2.4;
      if (type === 'boss_ultradoman') yOffset = 5.2;
      if (type === 'boss_worm') yOffset = 4.2;
      if (type === 'drone' || type === 'winged_doman') yOffset = 2.8;

      labelSprite.position.set(0, yOffset, 0);
      mesh.add(labelSprite);
    }

    const enemy: EnemyInstance = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      mesh,
      hp: maxHp,
      maxHp,
      isDead: false,
      isStunned: false,
      stunTimer: 0,
      attackCooldown: 1.0,
      position: mesh.position,
      isBoss,
      telegraphTimer: 0,
      isAggroed: false,
      isRoomFrozen: false,
      isPassive,
      roomId,
      spawnRoomId: roomId,
      // Resolve animated sub-meshes once here so the per-frame update can skip traverse().
      animParts: collectEnemyAnimParts(mesh),
    };

    this.enemies.push(enemy);
    if (isBoss && !this.activeBoss) this.activeBoss = enemy;
    return enemy;
  }

  /**
   * PERF: hide enemies that belong to rooms which are not currently drawn.
   *
   * Enemy models are built as Groups of 100+ child Meshes, and the spawn code sets
   * `group.frustumCulled = false`. THREE only frustum-tests Meshes (never Groups), so that
   * flag on the group did nothing useful while the children were all still traversed and
   * submitted every frame - meaning a boss two rooms away cost full draw calls.
   *
   * Toggling the group's `visible` flag prunes the whole subtree in one step. Only called on
   * room transitions, and purely a render concern: AI freezing is handled separately by
   * roomId, and collision never consults `visible`.
   */
  public updateEnemyVisibility(isRoomActive: (roomId: number) => boolean) {
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      const shouldBeVisible = enemy.roomId === undefined ? true : isRoomActive(enemy.roomId);
      if (enemy.mesh.visible !== shouldBeVisible) {
        enemy.mesh.visible = shouldBeVisible;
      }
    }
  }

  public removeEnemiesInRoom(roomId: number) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.roomId === roomId) {
        this.scene.remove(enemy.mesh);
        this.enemies.splice(i, 1);
        if (this.activeBoss === enemy) {
          this.activeBoss = this.enemies.find((e) => e.isBoss && !e.isDead) ?? null;
        }
      }
    }
  }

  public unfreezeEnemy(enemy: EnemyInstance) {
    if (enemy.isRoomFrozen) {
      enemy.isRoomFrozen = false;
      enemy.isAggroed = true;
    }
  }

  public update(
    delta: number,
    playerPos: THREE.Vector3,
    onPlayerDamage: (amount: number) => void,
    onStylePoints: (points: number, name: string) => void,
    onPlayerHeal?: (amount: number) => void,
    playerRoomId: number = 1,
    rooms?: RoomInfo[],
    hitSplashes?: HitSplashes,
    onPlayerSlow?: (duration: number) => void
  ) {
    // PERF: refresh the id->room index once per update rather than running rooms.find()
    // per enemy, per frame.
    this.refreshRoomIndex(rooms);

    // PERF: compact dead enemies out of the array (killEnemy only marks; removing here keeps
    // splice-during-iteration bugs impossible and makes every later loop O(alive)).
    if (this.hasDeadEntries) {
      let w = 0;
      for (let i = 0; i < this.enemies.length; i++) {
        if (!this.enemies[i].isDead) this.enemies[w++] = this.enemies[i];
      }
      this.enemies.length = w;
      this.hasDeadEntries = false;
    }

    // PERF: age the LOS cache and grant this frame's shared raycast budget.
    this.timeAcc += delta;
    this.losBudgetRemaining = EnemyEngine.LOS_BUDGET_PER_FRAME;

    // PERF: shared per-frame values, hoisted out of the per-enemy loop. Date.now() alone
    // used to be called 5-10x per enemy per frame for animation phases.
    const nowMs = Date.now();
    const airDragFactor = Math.pow(0.86, delta);
    const floorFrictionFactor = Math.pow(0.01, delta);

    // 1. Update Enemies Physics, Ricochet & Stun Recovery
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;

      // --- ROOM LOGIC FREEZE: Enemies outside player's active room have their AI/logic paused ---
      // PERF: enemy.roomId is assigned at spawn and only changes when an enemy is knocked
      // into another room, which requires knockback velocity. When the enemy is at rest we
      // trust the cached id and skip getRoomIdAtPosition entirely - that call was a linear
      // scan over every room, executed for every enemy on every frame.
      const mayHaveMoved = !!(enemy.knockbackVel && enemy.knockbackVel.lengthSq() > 0.05);
      let enemyRoomId: number;
      if (mayHaveMoved || enemy.roomId === undefined) {
        enemyRoomId = LevelGenerator.getRoomIdAtPosition(enemy.position, rooms);
        enemy.roomId = enemyRoomId;
      } else {
        enemyRoomId = enemy.roomId;
      }
      const inPlayerRoom = enemyRoomId === playerRoomId;

      if (!inPlayerRoom) {
        enemy.isRoomFrozen = true;
        enemy.telegraphTimer = 0;
        continue; // AI logic paused, skip movement and attacks
      } else {
        if (enemy.isRoomFrozen) {
          this.unfreezeEnemy(enemy);
        }
      }

      // --- RICOCHET KNOCKBACK PHYSICS WITH GRAVITY & OBSTACLE BOUNCING ---
      const activeRoom = this.getRoomById(enemy.roomId, rooms);
      const roomFloorY = activeRoom ? activeRoom.yCenter : 0;
      const minGroundY = roomFloorY + 0.8;

      if (enemy.knockbackVel && enemy.knockbackVel.lengthSq() > 0.05) {
        const speedSq = enemy.knockbackVel.lengthSq();

        // Downward gravity during flight (strengthened for faster, heavier falling)
        enemy.knockbackVel.y -= 55.0 * delta;

        // Air drag
        enemy.knockbackVel.x *= airDragFactor;
        enemy.knockbackVel.z *= airDragFactor;

        // PERF: scratch vector - this used to allocate a Vector3 per knocked-back enemy per frame.
        const step = this.tempStep.copy(enemy.knockbackVel).multiplyScalar(delta);
        const stepLength = step.length();

        // Gentler tumbling rotation for airborne/knocked-back mobs
        enemy.mesh.rotation.x += 2.0 * delta;
        enemy.mesh.rotation.z += 1.5 * delta;

        let bounced = false;

        // Continuous sweep raycast against level obstacles before stepping through thin walls
        if (speedSq > 0.25 && stepLength > 0.001) {
          this.tempDir.copy(enemy.knockbackVel).normalize();
          this.knockbackRaycaster.set(enemy.position, this.tempDir);
          this.knockbackRaycaster.near = 0;
          this.knockbackRaycaster.far = stepLength + 0.8;
          // PERF: AABB-narrowed candidate set instead of a distance heuristic over the
          // whole obstacle list (strictly more accurate for group roots parked at origin).
          const targets = this.collectObstaclesAlongRay(enemy.position, this.tempDir, stepLength + 0.8);

          try {
            const hits = targets.length > 0 ? this.knockbackRaycaster.intersectObjects(targets, true) : EnemyEngine.EMPTY_HITS;
            if (hits.length > 0 && hits[0].face) {
              const hit = hits[0];
              this.tempNormal.copy(hit.face.normal);
              this.tempNormal.transformDirection(hit.object.matrixWorld);

              const dot = enemy.knockbackVel.dot(this.tempNormal);
              if (dot < 0) {
                // Reflect velocity: v' = v - 1.9 * (v . n) * n
                this.tempVec.copy(this.tempNormal).multiplyScalar(1.9 * dot);
                enemy.knockbackVel.sub(this.tempVec);
                enemy.knockbackVel.multiplyScalar(0.82); // Dampen bounce energy
                enemy.position.copy(hit.point).addScaledVector(this.tempNormal, 0.85); // Push out from obstacle
                bounced = true;
              } else {
                enemy.position.add(step);
              }
            } else {
              enemy.position.add(step);
            }
          } catch {
            enemy.position.add(step);
          }
        } else {
          enemy.position.add(step);
        }

        // Bounding Arena Enclosure (Outer safety net)
        const halfWidth = 80.0;
        const backZ = -1500.0;
        const frontZ = 300.0;

        if (enemy.position.x < -halfWidth && enemy.knockbackVel.x < 0) {
          enemy.position.x = -halfWidth;
          enemy.knockbackVel.x = -enemy.knockbackVel.x * 0.85;
          bounced = true;
        } else if (enemy.position.x > halfWidth && enemy.knockbackVel.x > 0) {
          enemy.position.x = halfWidth;
          enemy.knockbackVel.x = -enemy.knockbackVel.x * 0.85;
          bounced = true;
        }

        if (enemy.position.z < backZ && enemy.knockbackVel.z < 0) {
          enemy.position.z = backZ;
          enemy.knockbackVel.z = -enemy.knockbackVel.z * 0.85;
          bounced = true;
        } else if (enemy.position.z > frontZ && enemy.knockbackVel.z > 0) {
          enemy.position.z = frontZ;
          enemy.knockbackVel.z = -enemy.knockbackVel.z * 0.85;
          bounced = true;
        }

        // Floor & Ceiling Contact (relative to room floor height)
        if (enemy.position.y <= minGroundY) {
          enemy.position.y = minGroundY;
          if (Math.abs(enemy.knockbackVel.y) > 2.2) {
            enemy.knockbackVel.y = -enemy.knockbackVel.y * 0.45; // Floor bounce
            bounced = true;
          } else {
            enemy.knockbackVel.y = 0;
            enemy.knockbackVel.x *= floorFrictionFactor; // Heavy floor friction
            enemy.knockbackVel.z *= floorFrictionFactor;
          }
        } else if (enemy.position.y > roomFloorY + 14.0 && enemy.knockbackVel.y > 0) {
          enemy.position.y = roomFloorY + 14.0;
          enemy.knockbackVel.y = -enemy.knockbackVel.y * 0.85;
          bounced = true;
        }

        if (bounced) {
          const nowTime = performance.now();
          if (!enemy.lastRicochetTime || nowTime - enemy.lastRicochetTime > 120) {
            enemy.lastRicochetTime = nowTime;
            enemy.ricochetBounces = (enemy.ricochetBounces || 0) + 1;
            const count = enemy.ricochetBounces;
            AudioEngine.playRicochetImpact();

            let styleTag = `⚡ RICOCHET x${count}`;
            if (count >= 8) styleTag = `🌀 ULTRA PINBALL x${count}!!`;
            else if (count >= 4) styleTag = `🔥 RICOCHET COMBO x${count}!`;

            onStylePoints(150 + count * 50, styleTag);
            if (this.onDamageNumber) this.onDamageNumber(enemy.position, 1, false);
            if (this.onHitSplash) this.onHitSplash(enemy.position, true);
          }
        }

        // Maintain stun state when knocked back
        if (!enemy.isStunned || enemy.stunTimer < 0.2) {
          enemy.isStunned = true;
          enemy.stunTimer = 0.3;
        }
      }

      // --- STUN & FAST STAND UP RECOVERY ANIMATION ---
      if (enemy.isStunned) {
        enemy.stunTimer -= delta;

        const isMovingFast = enemy.knockbackVel && enemy.knockbackVel.lengthSq() > 0.1;
        const isAirborne = enemy.position.y > minGroundY + 0.05;

        if (isMovingFast || isAirborne) {
          // Flying / falling - tumbling handles rotation
        } else {
          // Landed on floor! Clamp height
          enemy.position.y = minGroundY;
          if (enemy.knockbackVel) enemy.knockbackVel.set(0, 0, 0);

          if (enemy.stunTimer > 0.15) {
            // Lying flat on ground during stun
            enemy.mesh.rotation.x = Math.PI * 0.45;
          } else if (enemy.stunTimer > 0) {
            // Smoothly and quickly stand up during the final 0.15 seconds
            const standProgress = 1.0 - (enemy.stunTimer / 0.15); // 0 -> 1
            enemy.mesh.rotation.x = THREE.MathUtils.lerp(Math.PI * 0.45, 0, standProgress);
            enemy.mesh.rotation.z = THREE.MathUtils.lerp(enemy.mesh.rotation.z, 0, standProgress);
          }
        }

        if (enemy.stunTimer <= 0) {
          enemy.isStunned = false;
          enemy.knockbackVel = undefined;
          enemy.mesh.rotation.set(0, enemy.mesh.rotation.y, 0);
          enemy.position.y = minGroundY;
        } else {
          continue; // Stunned enemies cannot move or attack
        }
      }

      // --- SECRET ROOM PASSIVE EXHIBITION BEHAVIOR ---
      if (enemy.isPassive) {
        this.dummyLookObj.position.copy(enemy.position);
        this.dummyLookObj.lookAt(playerPos.x, enemy.position.y, playerPos.z);
        enemy.mesh.quaternion.slerp(this.dummyLookObj.quaternion, Math.min(1.0, 4.0 * delta));

        // PERF: cached part references instead of a per-frame traverse.
        const pParts = enemy.animParts;
        if (pParts && !pParts.isEmpty) {
          for (let fi = 0; fi < pParts.fanBlades.length; fi++) {
            pParts.fanBlades[fi].rotation.z += 15.0 * delta;
          }
          for (let mi = 0; mi < pParts.minigunBarrels.length; mi++) {
            pParts.minigunBarrels[mi].rotation.z += 8.0 * delta;
          }
          if (pParts.mouthJaw) {
            const idleCycle = Math.sin(nowMs * 0.003) * 0.15 + 0.15;
            pParts.mouthJaw.rotation.x = THREE.MathUtils.lerp(pParts.mouthJaw.rotation.x, idleCycle * 0.5, 0.1);
            pParts.mouthJaw.position.y = THREE.MathUtils.lerp(pParts.mouthJaw.position.y, -0.25 - idleCycle * 0.2, 0.1);
          }
        }

        if (enemy.type === 'drone' || enemy.type === 'winged_doman') {
          enemy.position.y = 2.8 + Math.sin(nowMs * 0.003) * 0.25;
        }

        continue; // Standing still on pedestals without attacking
      }

      const distToPlayer = enemy.position.distanceTo(playerPos);

      // Aggro check: Mobs only activate when player approaches (~16 meters) or when damaged/knocked back
      if (!enemy.isAggroed) {
        if (distToPlayer <= 16.0 || enemy.hp < enemy.maxHp || enemy.isBoss) {
          enemy.isAggroed = true;
        } else {
          continue; // Stay passive until player enters room / gets close
        }
      }

      // Smooth Model Turning Speed towards player
      const isRoboDashing = enemy.type === 'robo_doman' && enemy.dashStage && enemy.dashStage > 0;
      const isSniperFlipping = enemy.type === 'doman_sniper' && enemy.backflipTimer && enemy.backflipTimer > 0;
      const isDroneKamikaze = (enemy.type === 'drone' || enemy.type === 'winged_doman') && (enemy.hp / enemy.maxHp <= 0.5);

      const isCentipede = enemy.type === 'centipede';
      const isWormActive = enemy.type === 'boss_worm' && enemy.wormState && enemy.wormState !== 'idle';

      if (isDroneKamikaze) {
        this.dummyLookObj.position.copy(enemy.position);
        this.dummyLookObj.lookAt(playerPos.x, playerPos.y + 0.8, playerPos.z);
        enemy.mesh.quaternion.slerp(this.dummyLookObj.quaternion, Math.min(1.0, 14.0 * delta));
      } else if (!isRoboDashing && !isSniperFlipping && !isCentipede && !isWormActive) {
        this.dummyLookObj.position.copy(enemy.position);
        this.dummyLookObj.lookAt(playerPos.x, enemy.position.y, playerPos.z);

        let turnSpeed = 8.0; // radians per second
        if (enemy.isBoss) {
          turnSpeed = enemy.type === 'boss_ultradoman' ? 4.5 : (enemy.type === 'boss_worm' ? 3.0 : 3.8);
        } else if (enemy.type === 'doman_sniper') {
          turnSpeed = 4.2; // Snipers rotate deliberately to align their aim
        } else if (enemy.type === 'imp_doman' || enemy.type === 'robo_doman') {
          turnSpeed = 10.0; // Agile chasers
        } else if (enemy.type === 'doman_dynamiter') {
          turnSpeed = 9.0;
        } else if (enemy.type === 'drone' || enemy.type === 'winged_doman') {
          turnSpeed = 6.0;
        }

        enemy.mesh.quaternion.slerp(this.dummyLookObj.quaternion, Math.min(1.0, turnSpeed * delta));
      }

      // Attack timers
      enemy.attackCooldown -= delta;

      // Enemy specific AI behavior (VERY LOW DAMAGE TO PLAYER!)
      if (enemy.type === 'imp_doman') {
        // Imp Doman: Fast agile chase
        if (distToPlayer > 1.8) {
          this.tempDir.subVectors(playerPos, enemy.position).normalize();
          this.tempDir.x += Math.sin(nowMs * 0.005) * 0.5;
          enemy.position.addScaledVector(this.tempDir.normalize(), 8.0 * delta);
        } else if (enemy.attackCooldown <= 0) {
          enemy.attackCooldown = 1.2;
          onPlayerDamage(1);
        }
      } else if (enemy.type === 'robo_doman') {
        // Robo-Doman: Walks towards player on foot, continuous claw strikes when close, 3 directional zigzag dashes as special attack
        if (enemy.animParts?.roboArm) {
          const isAttacking = (enemy.dashStage && enemy.dashStage > 0) || distToPlayer <= 2.2;
          if (isAttacking) {
            // Rapid robotic claw wave / slash animation!
            enemy.animParts.roboArm.rotation.x = Math.sin(nowMs * 0.035) * 1.1 - 0.2;
            enemy.animParts.roboArm.rotation.z = Math.cos(nowMs * 0.035) * 0.35;
          } else {
            enemy.animParts.roboArm.rotation.x = THREE.MathUtils.lerp(enemy.animParts.roboArm.rotation.x, 0, 0.15);
            enemy.animParts.roboArm.rotation.z = THREE.MathUtils.lerp(enemy.animParts.roboArm.rotation.z, 0, 0.15);
          }
        }

        if (!enemy.dashStage || enemy.dashStage === 0) {
          // --- MELEE RANGE: CONSTANT CONTINUOUS STRIKES WHEN CLOSE TO PLAYER ---
          if (distToPlayer <= 2.2) {
            if (enemy.attackCooldown <= 0) {
              enemy.attackCooldown = 0.28; // Rapid continuous strikes!
              onPlayerDamage(1);
              AudioEngine.playHvbPunch(0.5);
            }
          } else {
            // --- ON FOOT WALKING / PURSUING ---
            this.tempDir.subVectors(playerPos, enemy.position);
            this.tempDir.y = 0;
            this.tempDir.normalize();
            // Walk on foot speed: 5.5 m/s
            enemy.position.addScaledVector(this.tempDir, 5.5 * delta);
          }

          // Trigger 3-Dash Zigzag Attack towards player when at medium range and cooldown ready
          if (enemy.attackCooldown <= 0 && distToPlayer >= 3.0 && distToPlayer < 16.0) {
            const sign = Math.random() < 0.5 ? 1 : -1;
            enemy.dashZigzagSign = sign;
            enemy.dashStage = 1;

            const toPlayer = new THREE.Vector3().subVectors(playerPos, enemy.position);
            toPlayer.y = 0;
            if (toPlayer.lengthSq() < 0.001) toPlayer.set(0, 0, -1);
            toPlayer.normalize();

            const perp = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
            const dash1Dir = toPlayer.clone().addScaledVector(perp, sign * 0.7).normalize();

            enemy.dashDir = dash1Dir;
            enemy.dashTimer = 0.18;
            AudioEngine.playDash();
          }
        } else {
          // --- EXECUTING 3-DASH ZIGZAG ATTACK TOWARDS ENEMY ---
          enemy.dashTimer = (enemy.dashTimer || 0) - delta;

          // High speed dash (24 m/s)
          if (enemy.dashDir) {
            enemy.position.addScaledVector(enemy.dashDir, 24.0 * delta);

            // Snap model orientation in dash direction
            this.dummyLookObj.position.copy(enemy.position);
            this.dummyLookObj.lookAt(
              enemy.position.x + enemy.dashDir.x,
              enemy.position.y,
              enemy.position.z + enemy.dashDir.z
            );
            enemy.mesh.quaternion.slerp(this.dummyLookObj.quaternion, Math.min(1.0, 22.0 * delta));
          }

          // Damage player if Robo-Doman passes near/hits player during dash
          if (distToPlayer < 2.0 && enemy.attackCooldown <= 0) {
            enemy.attackCooldown = 0.25;
            onPlayerDamage(1);
            AudioEngine.playHvbPunch(0.6);
          }

          // Transition between dash steps (re-aiming towards player each stage!)
          if (enemy.dashTimer <= 0) {
            if (enemy.dashStage === 1) {
              // --- DASH 2: Sharp dash in opposite zigzag direction TOWARDS current player pos ---
              enemy.dashStage = 2;
              const sign = -(enemy.dashZigzagSign || 1);
              enemy.dashZigzagSign = sign;

              const toPlayer = new THREE.Vector3().subVectors(playerPos, enemy.position);
              toPlayer.y = 0;
              if (toPlayer.lengthSq() < 0.001) toPlayer.set(0, 0, -1);
              toPlayer.normalize();

              const perp = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
              const dash2Dir = toPlayer.clone().addScaledVector(perp, sign * 0.7).normalize();

              enemy.dashDir = dash2Dir;
              enemy.dashTimer = 0.18;
              AudioEngine.playDash();
            } else if (enemy.dashStage === 2) {
              // --- DASH 3: Direct lunge straight at player ---
              enemy.dashStage = 3;

              const dash3Dir = new THREE.Vector3().subVectors(playerPos, enemy.position);
              dash3Dir.y = 0;
              if (dash3Dir.lengthSq() < 0.001) dash3Dir.set(0, 0, -1);
              dash3Dir.normalize();

              enemy.dashDir = dash3Dir;
              enemy.dashTimer = 0.22;
              AudioEngine.playDash();
            } else if (enemy.dashStage === 3) {
              // --- FINISH ATTACK COMBO ---
              enemy.dashStage = 0;
              enemy.attackCooldown = 2.2; // Cooldown before next 3-dash combo
            }
          }
        }
      } else if (enemy.type === 'doman_sniper') {
        // Cooldown timer for backflip evade
        if (enemy.backflipCooldown && enemy.backflipCooldown > 0) {
          enemy.backflipCooldown -= delta;
        }

        // --- BACKFLIP EVADE WHEN PLAYER GETS CLOSE (< 7.0 meters) ---
        if (
          distToPlayer < 7.0 &&
          (!enemy.backflipTimer || enemy.backflipTimer <= 0) &&
          (!enemy.backflipCooldown || enemy.backflipCooldown <= 0)
        ) {
          enemy.backflipTimer = 0.55; // 0.55s flip duration
          enemy.backflipCooldown = 3.2; // 3.2s cooldown
          enemy.baseY = enemy.position.y;

          // Backwards leap direction away from player
          const backDir = new THREE.Vector3().subVectors(enemy.position, playerPos);
          backDir.y = 0;
          if (backDir.lengthSq() < 0.001) backDir.set(0, 0, 1);
          backDir.normalize();
          enemy.backflipDir = backDir;

          AudioEngine.playDash();
        }

        // --- EXECUTING BACKFLIP ANIMATION & LEAP ---
        if (enemy.backflipTimer && enemy.backflipTimer > 0) {
          enemy.backflipTimer -= delta;
          const totalDur = 0.55;
          const progress = Math.max(0, Math.min(1.0, 1.0 - enemy.backflipTimer / totalDur));

          // Move backward at speed
          if (enemy.backflipDir) {
            enemy.position.addScaledVector(enemy.backflipDir, 16.5 * delta);
          }

          // Parabolic arc jump into air
          const arcY = Math.sin(progress * Math.PI) * 3.4;
          const startY = enemy.baseY !== undefined ? enemy.baseY : 0.5;
          enemy.position.y = startY + arcY;

          // 360-degree Pitch Backflip pitch rotation
          enemy.mesh.rotation.x = -progress * Math.PI * 2;

          if (enemy.backflipTimer <= 0) {
            enemy.backflipTimer = 0;
            enemy.mesh.rotation.x = 0;
            enemy.position.y = startY;
          }
        } else {
          // --- SNIPER SHOOTING & AIM TELEGRAPH ---
          if (distToPlayer < 45 && this.hasLineOfSight(enemy, playerPos)) {
            enemy.telegraphTimer += delta;
            if (enemy.telegraphTimer >= 1.3 && enemy.attackCooldown <= 0) {
              enemy.telegraphTimer = 0;
              enemy.attackCooldown = 2.8;

              // Moderate sniper round damage: 10 damage
              onPlayerDamage(10);
              AudioEngine.playRifleShot(true);

              // High-speed bullet tracer projectile
              const muzzlePos = enemy.position.clone().add(new THREE.Vector3(0, 0.9, 0));
              this.spawnEnemyProjectile(muzzlePos, playerPos, 65.0, 10);
            }
          }
        }
      } else if (enemy.type === 'doman_dynamiter') {
        // Suicide Runner
        if (distToPlayer > 1.5) {
          this.tempDir.subVectors(playerPos, enemy.position).normalize();
          enemy.position.addScaledVector(this.tempDir, 12.0 * delta);
        } else {
          // Instant explosion on contact!
          this.killEnemy(enemy, true, onStylePoints);
          onPlayerDamage(3);
          AudioEngine.playExplosion();
        }
      } else if (enemy.type === 'drone' || enemy.type === 'winged_doman') {
        const hpRatio = enemy.hp / enemy.maxHp;
        const activeRoom = this.getRoomById(enemy.roomId, rooms);
        const roomFloorY = activeRoom ? activeRoom.yCenter : 0;

        if (hpRatio <= 0.5) {
          // --- KAMIKAZE DIVE MODE (LOW HP <= 50%) ---
          this.tempDir.subVectors(playerPos, enemy.position).normalize();
          // Fly at high speed directly into player
          enemy.position.addScaledVector(this.tempDir, 16.5 * delta);

          if (distToPlayer < 2.0) {
            // Explode on impact with player!
            this.killEnemy(enemy, true, onStylePoints);
            onPlayerDamage(4);
            AudioEngine.playExplosion();
          }
        } else {
          // --- NORMAL MODE: CONSTANTLY FLY/BACK AWAY FROM PLAYER & SHOOT ---
          enemy.position.y = THREE.MathUtils.lerp(enemy.position.y, roomFloorY + 4.0 + Math.sin(nowMs * 0.004) * 0.6, 0.08);

          // Fly away from player to maintain distance
          if (distToPlayer < 22.0) {
            this.tempDir.subVectors(enemy.position, playerPos);
            this.tempDir.y = 0;
            if (this.tempDir.lengthSq() < 0.001) this.tempDir.set(0, 0, 1);
            this.tempDir.normalize();

            // Prevent drone from trying to fly past room walls when retreating
            if (activeRoom) {
              const wallMargin = 2.0;
              const innerMinX = activeRoom.xCenter - activeRoom.width / 2 + wallMargin;
              const innerMaxX = activeRoom.xCenter + activeRoom.width / 2 - wallMargin;
              const innerMinZ = activeRoom.zCenter - activeRoom.depth / 2 + wallMargin;
              const innerMaxZ = activeRoom.zCenter + activeRoom.depth / 2 - wallMargin;

              const nextX = enemy.position.x + this.tempDir.x * 7.5 * delta;
              const nextZ = enemy.position.z + this.tempDir.z * 7.5 * delta;

              if (nextX < innerMinX || nextX > innerMaxX) this.tempDir.x = 0;
              if (nextZ < innerMinZ || nextZ > innerMaxZ) this.tempDir.z = 0;
            }

            enemy.position.addScaledVector(this.tempDir, 7.5 * delta);
          }

          if (enemy.attackCooldown <= 0 && this.hasLineOfSight(enemy, playerPos)) {
            enemy.attackCooldown = enemy.type === 'drone' ? 2.2 : 1.8;
            if (enemy.type === 'drone') {
              this.spawnEnemyRocket(enemy.position, playerPos, 12, 10);
            } else {
              this.spawnEnemyProjectile(enemy.position, playerPos, 10, 1);
            }
          }
        }
      } else if (enemy.type === 'worm') {
        // --- CHEMICAL BARREL DOMAN (ДОМАН С БОЧКОЙ НА СПИНЕ) ---
        if (distToPlayer > 3.0) {
          this.tempDir.subVectors(playerPos, enemy.position);
          this.tempDir.y = 0;
          this.tempDir.normalize();
          enemy.position.addScaledVector(this.tempDir, 5.2 * delta);
        }

        if (distToPlayer < 36.0 && this.hasLineOfSight(enemy, playerPos)) {
          if (enemy.attackCooldown <= 0) {
            enemy.attackCooldown = 1.6;
            const muzzlePos = enemy.position.clone().add(new THREE.Vector3(0, 0.9, 0));
            this.spawnEnemyProjectile(muzzlePos, playerPos, 30.0, 3, true); // Toxic ammo!
            if (Math.random() < 0.4) AudioEngine.playPistolShot();
          }
        }
      } else if (enemy.type === 'spider_spitter') {
        // --- SPIDER SPITTER (ПАУК-ПЛЕВАЛЬЩИК): RETREATS BACK & SHOOTS SLOWING WEB ---
        const activeRoom = this.getRoomById(enemy.roomId, rooms);

        // 1. Retreat/back away from player when closer than 22.0 meters
        if (distToPlayer < 22.0) {
          this.tempDir.subVectors(enemy.position, playerPos);
          this.tempDir.y = 0;
          if (this.tempDir.lengthSq() < 0.001) this.tempDir.set(0, 0, 1);
          this.tempDir.normalize();

          if (activeRoom) {
            const wallMargin = 1.8;
            const minX = activeRoom.xCenter - activeRoom.width / 2 + wallMargin;
            const maxX = activeRoom.xCenter + activeRoom.width / 2 - wallMargin;
            const minZ = activeRoom.zCenter - activeRoom.depth / 2 + wallMargin;
            const maxZ = activeRoom.zCenter + activeRoom.depth / 2 - wallMargin;

            const nextX = enemy.position.x + this.tempDir.x * 6.5 * delta;
            const nextZ = enemy.position.z + this.tempDir.z * 6.5 * delta;

            if (nextX < minX || nextX > maxX) this.tempDir.x = 0;
            if (nextZ < minZ || nextZ > maxZ) this.tempDir.z = 0;
          }

          enemy.position.addScaledVector(this.tempDir, 6.5 * delta);
        } else if (distToPlayer > 30.0) {
          // Approach slightly if player is very far away
          this.tempDir.subVectors(playerPos, enemy.position);
          this.tempDir.y = 0;
          this.tempDir.normalize();
          enemy.position.addScaledVector(this.tempDir, 5.0 * delta);
        }

        // 2. Shoot slowing web projectile
        if (distToPlayer < 36.0 && this.hasLineOfSight(enemy, playerPos)) {
          if (enemy.attackCooldown <= 0) {
            enemy.attackCooldown = 1.8;
            const muzzlePos = enemy.position.clone().add(new THREE.Vector3(0, 0.7, 0.6));
            this.spawnEnemyProjectile(muzzlePos, playerPos, 22.0, 2, false, true); // Slowing web!
            AudioEngine.playPistolShot();
          }
        }
      } else if (enemy.type === 'centipede') {
        // --- CENTIPEDE (МНОГОНОЖКА): NATURAL CRAWLING, FAST CHARGE, MICRO-DASH RAM & RETREAT ---
        if (!enemy.centipedeState) enemy.centipedeState = 'charge';

        const activeRoom = this.getRoomById(enemy.roomId, rooms);


        // Rapid leg wiggling animation for organic centipede crawling
        const crawlCycle = Math.sin(nowMs * 0.025) * 0.45;
        if (enemy.animParts && !enemy.animParts.isEmpty) {
          for (const leg of enemy.animParts.legsForward) leg.rotation.z = crawlCycle;
          for (const leg of enemy.animParts.legsBackward) leg.rotation.z = -crawlCycle;
        }

        if (enemy.centipedeState === 'charge') {
          // Calculate direct vector to player
          this.tempDir.subVectors(playerPos, enemy.position);
          this.tempDir.y = 0;
          const distSq = this.tempDir.lengthSq();

          if (distSq > 0.001) this.tempDir.normalize();
          else this.tempDir.set(0, 0, 1);

          // Smoothly rotate head towards player
          const targetAngle = Math.atan2(this.tempDir.x, this.tempDir.z);
          let diff = targetAngle - enemy.mesh.rotation.y;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          enemy.mesh.rotation.y += diff * Math.min(1.0, 10.0 * delta);

          if (distToPlayer > 3.8) {
            // Slithering movement: add slight side-to-side sine oscillation to path
            const perpX = -this.tempDir.z;
            const perpZ = this.tempDir.x;
            const slitherSine = Math.sin(nowMs * 0.015 + (enemy.position.x + enemy.position.z) * 0.5) * 0.25;

            const moveVecX = (this.tempDir.x + perpX * slitherSine) * 11.5 * delta;
            const moveVecZ = (this.tempDir.z + perpZ * slitherSine) * 11.5 * delta;

            const clamped = this.clampPosInRoom(activeRoom, enemy.position.x + moveVecX, enemy.position.z + moveVecZ);
            enemy.position.x = clamped.x;
            enemy.position.z = clamped.z;
          } else {
            // Close to player (< 3.8m)
            if (enemy.attackCooldown <= 0) {
              // Trigger Micro-Dash Ram attack!
              enemy.centipedeState = 'microdash';
              enemy.centipedeTimer = 0.22; // 0.22s high speed burst
              if (!enemy.dashDir) enemy.dashDir = new THREE.Vector3();
              enemy.dashDir.subVectors(playerPos, enemy.position);
              enemy.dashDir.y = 0;
              if (enemy.dashDir.lengthSq() > 0.001) enemy.dashDir.normalize();
              else enemy.dashDir.set(0, 0, 1);

              enemy.rammedPlayer = false;
              AudioEngine.playPistolShot();
            } else {
              // Flank around when attack is on cooldown
              const perpX = -this.tempDir.z;
              const perpZ = this.tempDir.x;
              const moveVecX = perpX * 7.5 * delta;
              const moveVecZ = perpZ * 7.5 * delta;

              const clamped = this.clampPosInRoom(activeRoom, enemy.position.x + moveVecX, enemy.position.z + moveVecZ);
              enemy.position.x = clamped.x;
              enemy.position.z = clamped.z;
            }
          }
        } else if (enemy.centipedeState === 'microdash') {
          // 2. Micro-Dash / Ram Lunge forward at ultra-high speed (25.0 m/s)
          const moveX = enemy.dashDir!.x * 25.0 * delta;
          const moveZ = enemy.dashDir!.z * 25.0 * delta;

          const clamped = this.clampPosInRoom(activeRoom, enemy.position.x + moveX, enemy.position.z + moveZ);
          enemy.position.x = clamped.x;
          enemy.position.z = clamped.z;

          // Face dash direction strictly
          const targetAngle = Math.atan2(enemy.dashDir!.x, enemy.dashDir!.z);
          enemy.mesh.rotation.y = targetAngle;

          // Ram impact check
          if (distToPlayer < 2.0 && !enemy.rammedPlayer) {
            enemy.rammedPlayer = true;
            onPlayerDamage(6); // Ram impact damage
            AudioEngine.playShotgun(); // Heavy ram sound
            if (hitSplashes) {
              hitSplashes.spawn(playerPos.clone().add(new THREE.Vector3(0, 1.0, 0)), true);
            }
          }

          enemy.centipedeTimer = (enemy.centipedeTimer || 0) - delta;
          if (enemy.centipedeTimer <= 0) {
            // Finish microdash -> Retreat back
            enemy.centipedeState = 'retreat';
            enemy.centipedeTimer = 1.0; // 1.0s retreat duration
            enemy.attackCooldown = 2.0; // Cooldown before next charge attack
          }
        } else if (enemy.centipedeState === 'retreat') {
          // 3. Retreat: Back away from player / return to safety position
          this.tempDir.subVectors(enemy.position, playerPos);
          this.tempDir.y = 0;
          if (this.tempDir.lengthSq() > 0.001) this.tempDir.normalize();
          else this.tempDir.set(0, 0, 1);

          // Keep head facing player while backing away
          const targetAngle = Math.atan2(-this.tempDir.x, -this.tempDir.z);
          let diff = targetAngle - enemy.mesh.rotation.y;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          enemy.mesh.rotation.y += diff * Math.min(1.0, 10.0 * delta);

          // Add slight diagonal slither to retreat so it doesn't get stuck linearly against walls
          const perpX = -this.tempDir.z;
          const perpZ = this.tempDir.x;
          const slither = Math.sin(nowMs * 0.01) * 0.25;

          const moveX = (this.tempDir.x + perpX * slither) * 8.5 * delta;
          const moveZ = (this.tempDir.z + perpZ * slither) * 8.5 * delta;

          const clamped = this.clampPosInRoom(activeRoom, enemy.position.x + moveX, enemy.position.z + moveZ);
          enemy.position.x = clamped.x;
          enemy.position.z = clamped.z;

          enemy.centipedeTimer = (enemy.centipedeTimer || 0) - delta;
          if (enemy.centipedeTimer <= 0 || distToPlayer > 12.0) {
            enemy.centipedeState = 'charge';
          }
        }
      } else if (enemy.isBoss) {
        // Boss Movement & Special Skills
        const minBossDist = enemy.type === 'boss_ultradoman' ? 3.5 : 4.0;
        let isWalking = false;
        const activeRoom = this.getRoomById(enemy.roomId, rooms);

        if (enemy.type === 'boss_ultradoman') {
          // --- SPECIAL BOSS LEVEL 4: ULTRADOMAN AI ---
          if (enemy.jumpCooldown === undefined) enemy.jumpCooldown = 0.8;
          if (enemy.jumpTimer === undefined) enemy.jumpTimer = 0;
          if (enemy.minigunBurstTimer === undefined) enemy.minigunBurstTimer = 0;

          const hasLOS = this.hasLineOfSight(enemy, playerPos);

          // 1. PROPELLER FAN WIND PUSHBACK ("дует на тебя пропеллером, отталкивая")
          const windRange = 38.0;
          if (distToPlayer < windRange && hasLOS) {
            this.tempDir.subVectors(playerPos, enemy.position);
            this.tempDir.y = 0;
            if (this.tempDir.lengthSq() > 0.001) {
              this.tempDir.normalize();
              const windFactor = (windRange - distToPlayer) / windRange;
              const pushForce = 38.0 * Math.pow(windFactor, 0.7); // Super strong wind pushback force
              playerPos.addScaledVector(this.tempDir, pushForce * delta);

              // Clamp player position to room interior so wind never pushes through walls
              if (activeRoom) {
                const wallMargin = 1.2;
                const minX = activeRoom.xCenter - activeRoom.width / 2 + wallMargin;
                const maxX = activeRoom.xCenter + activeRoom.width / 2 - wallMargin;
                const minZ = activeRoom.zCenter - activeRoom.depth / 2 + wallMargin;
                const maxZ = activeRoom.zCenter + activeRoom.depth / 2 - wallMargin;
                playerPos.x = THREE.MathUtils.clamp(playerPos.x, minX, maxX);
                playerPos.z = THREE.MathUtils.clamp(playerPos.z, minZ, maxZ);
              }
            }
          }

          // 2. JUMP SLAM ATTACK ("прыгать в твою сторону, нанося урон по области")
          enemy.jumpCooldown -= delta;
          const isJumping = (enemy.jumpTimer || 0) > 0;

          if (!isJumping && enemy.jumpCooldown <= 0 && distToPlayer > 1.0 && distToPlayer < 40.0 && hasLOS) {
            enemy.jumpTimer = 0.95; // Fast 0.95s jump leap
            enemy.jumpDuration = 0.95;
            enemy.jumpCooldown = 3.6; // Jump every 3.6 seconds
            enemy.jumpStartPos = enemy.position.clone();
            enemy.jumpTargetPos = playerPos.clone();
            const activeRm = activeRoom;
            enemy.jumpBaseY = activeRm ? activeRm.yCenter : 0;
            AudioEngine.playDash();
          }

          if ((enemy.jumpTimer || 0) > 0) {
            enemy.jumpTimer = (enemy.jumpTimer || 0) - delta;
            const duration = enemy.jumpDuration || 0.95;
            const progress = Math.max(0, Math.min(1.0, 1.0 - (enemy.jumpTimer || 0) / duration));
            const arcY = Math.sin(progress * Math.PI) * 7.5; // High leap arc
            const startP = enemy.jumpStartPos || enemy.position;
            const targetP = enemy.jumpTargetPos || playerPos;
            const baseY = enemy.jumpBaseY !== undefined ? enemy.jumpBaseY : 0;

            enemy.position.x = THREE.MathUtils.lerp(startP.x, targetP.x, progress);
            enemy.position.z = THREE.MathUtils.lerp(startP.z, targetP.z, progress);
            enemy.position.y = baseY + arcY;

            this.dummyLookObj.lookAt(targetP.x, enemy.position.y, targetP.z);
            enemy.mesh.quaternion.slerp(this.dummyLookObj.quaternion, 14.0 * delta);

            // LANDING EVENT: Shockwave & AoE Damage
            if ((enemy.jumpTimer || 0) <= 0) {
              enemy.position.y = baseY;
              AudioEngine.playExplosion();

              const landDist = enemy.position.distanceTo(playerPos);
              if (landDist < 9.0) {
                onPlayerDamage(12); // AoE Slam damage
                // Knockback player away from landing center
                this.tempDir.subVectors(playerPos, enemy.position);
                this.tempDir.y = 0;
                if (this.tempDir.lengthSq() < 0.001) this.tempDir.set(0, 0, 1);
                this.tempDir.normalize();
                playerPos.addScaledVector(this.tempDir, (9.0 - landDist) * 1.8);

                // Clamp player position to room interior so shockwave never pushes through walls
                if (activeRoom) {
                  const wallMargin = 1.2;
                  const minX = activeRoom.xCenter - activeRoom.width / 2 + wallMargin;
                  const maxX = activeRoom.xCenter + activeRoom.width / 2 - wallMargin;
                  const minZ = activeRoom.zCenter - activeRoom.depth / 2 + wallMargin;
                  const maxZ = activeRoom.zCenter + activeRoom.depth / 2 - wallMargin;
                  playerPos.x = THREE.MathUtils.clamp(playerPos.x, minX, maxX);
                  playerPos.z = THREE.MathUtils.clamp(playerPos.z, minZ, maxZ);
                }
              }

              if (hitSplashes) {
                hitSplashes.spawn(enemy.position.clone().add(new THREE.Vector3(0, 0.5, 0)), true);
              }
            }
          } else {
            // Standard Chase Walk when on ground
            if (distToPlayer > minBossDist) {
              isWalking = true;
              this.tempDir.subVectors(playerPos, enemy.position).normalize();
              enemy.position.addScaledVector(this.tempDir, 5.5 * delta);
            }
          }

          // 3. RAPID SHOULDER MINIGUN SHOOTING BARRAGE ("стреляет из минигана")
          enemy.minigunBurstTimer = (enemy.minigunBurstTimer || 0) - delta;
          if (enemy.minigunBurstTimer <= 0 && distToPlayer < 32.0 && hasLOS) {
            enemy.minigunBurstTimer = 0.12; // High rate minigun cycle
            const muzzleOffset = new THREE.Vector3(-1.65, 2.9, 1.2).applyQuaternion(enemy.mesh.quaternion);
            const muzzlePos = enemy.position.clone().add(muzzleOffset);
            this.spawnEnemyProjectile(muzzlePos, playerPos, 45.0, 1);
            if (Math.random() < 0.3) AudioEngine.playPistolShot();
          }

        } else if (enemy.type === 'boss_worm') {
          // --- SPECIAL BOSS LEVEL 8: GIANT WORM (БОСС: ГИГАНТСКИЙ ЧЕРВЬ) ---
          if (!enemy.wormState) enemy.wormState = 'idle';
          if (enemy.baseY === undefined) enemy.baseY = activeRoom ? activeRoom.yCenter : 0;
          if (!enemy.wormAttackType) enemy.wormAttackType = 'burrow';

          const baseY = enemy.baseY;

          // 1. BURROW DOWN (Diving underground)
          if (enemy.wormState === 'burrow_down') {
            enemy.wormTimer = (enemy.wormTimer || 0) - delta;
            const progress = Math.max(0, 1.0 - (enemy.wormTimer || 0) / 0.7);

            // Sink worm down under floor
            enemy.position.y = baseY - progress * 6.0;

            // Head downward tilt
            enemy.mesh.rotation.x = THREE.MathUtils.lerp(enemy.mesh.rotation.x, Math.PI * 0.35, 0.2);

            if (hitSplashes && Math.random() < 0.4) {
              hitSplashes.spawn(enemy.position.clone().add(new THREE.Vector3(0, 0.5, 0)), false);
            }

            if ((enemy.wormTimer || 0) <= 0) {
              enemy.wormState = 'burrow_underground';
              enemy.wormTimer = 1.4; // 1.4s underground tracking phase
              enemy.wormTargetPos = playerPos.clone();

              // Create Red Floor Circle Telegraph Indicator
              if (!enemy.wormTelegraphMesh) {
                enemy.wormTelegraphMesh = new THREE.Mesh(this.wormTelegraphGeo, this.wormTelegraphMat);
                enemy.wormTelegraphMesh.rotation.x = -Math.PI / 2;
                this.scene.add(enemy.wormTelegraphMesh);
              }
              enemy.wormTelegraphMesh.visible = true;
              enemy.wormTelegraphMesh.position.set(enemy.wormTargetPos.x, baseY + 0.05, enemy.wormTargetPos.z);
              enemy.wormTelegraphMesh.scale.setScalar(0.2);

              AudioEngine.playDash();
            }
          }
          // 2. BURROW UNDERGROUND (Submerged, tracking player location with glowing red warning ring)
          else if (enemy.wormState === 'burrow_underground') {
            enemy.wormTimer = (enemy.wormTimer || 0) - delta;

            // Follow player's movement on the floor
            if (enemy.wormTargetPos) {
              enemy.wormTargetPos.lerp(playerPos, 2.8 * delta);
            }

            if (enemy.wormTelegraphMesh && enemy.wormTargetPos) {
              enemy.wormTelegraphMesh.position.set(enemy.wormTargetPos.x, baseY + 0.05, enemy.wormTargetPos.z);
              const progress = 1.0 - (enemy.wormTimer || 0) / 1.4;
              // Pulse and grow warning ring scale from 0.3 to 4.5
              const ringScale = (0.3 + progress * 4.2) * (1.0 + Math.sin(nowMs * 0.02) * 0.15);
              enemy.wormTelegraphMesh.scale.setScalar(ringScale);
            }

            if ((enemy.wormTimer || 0) <= 0) {
              // Emerge up at target location!
              enemy.wormState = 'emerge_up';
              enemy.wormTimer = 0.85; // 0.85s eruption burst
              if (enemy.wormTargetPos) {
                enemy.position.x = enemy.wormTargetPos.x;
                enemy.position.z = enemy.wormTargetPos.z;
              }
              enemy.wormRammedPlayer = false;

              if (enemy.wormTelegraphMesh) {
                enemy.wormTelegraphMesh.visible = false;
              }

              AudioEngine.playExplosion();
              if (hitSplashes) {
                hitSplashes.spawn(enemy.position.clone().add(new THREE.Vector3(0, 0.5, 0)), true);
              }
            }
          }
          // 3. EMERGE UP (Erupts upward out of floor, ramming player)
          else if (enemy.wormState === 'emerge_up') {
            enemy.wormTimer = (enemy.wormTimer || 0) - delta;
            const progress = Math.max(0, 1.0 - (enemy.wormTimer || 0) / 0.85);

            // Parabolic eruption arc: rises fast to baseY + 5.5 and lands back at baseY
            const arcY = Math.sin(progress * Math.PI) * 5.5;
            enemy.position.y = baseY - (1.0 - progress) * 1.5 + arcY;

            // Face upwards during eruption, then levels out
            enemy.mesh.rotation.x = Math.sin(progress * Math.PI) * 0.6;

            // Check ram impact on player
            if (distToPlayer < 4.2 && !enemy.wormRammedPlayer) {
              enemy.wormRammedPlayer = true;
              onPlayerDamage(18); // Heavy ram damage
              AudioEngine.playShotgun();

              // Knockback player away from eruption center
              this.tempDir.subVectors(playerPos, enemy.position);
              this.tempDir.y = 0;
              if (this.tempDir.lengthSq() > 0.001) this.tempDir.normalize();
              else this.tempDir.set(0, 0, 1);
              playerPos.addScaledVector(this.tempDir, 5.0);

              if (activeRoom) {
                const wallMargin = 1.2;
                const minX = activeRoom.xCenter - activeRoom.width / 2 + wallMargin;
                const maxX = activeRoom.xCenter + activeRoom.width / 2 - wallMargin;
                const minZ = activeRoom.zCenter - activeRoom.depth / 2 + wallMargin;
                const maxZ = activeRoom.zCenter + activeRoom.depth / 2 - wallMargin;
                playerPos.x = THREE.MathUtils.clamp(playerPos.x, minX, maxX);
                playerPos.z = THREE.MathUtils.clamp(playerPos.z, minZ, maxZ);
              }
            }

            if ((enemy.wormTimer || 0) <= 0) {
              enemy.position.y = baseY;
              enemy.mesh.rotation.x = 0;
              enemy.wormState = 'idle';
              enemy.attackCooldown = 2.8; // Cooldown before next special attack
              enemy.wormAttackType = 'dash'; // Next attack will be charged dash!
            }
          }
          // 4. CHARGE DASH (Telegraphing charged dash towards player)
          else if (enemy.wormState === 'charge_dash') {
            enemy.wormTimer = (enemy.wormTimer || 0) - delta;

            // Lock direction towards player
            this.tempDir.subVectors(playerPos, enemy.position);
            this.tempDir.y = 0;
            if (this.tempDir.lengthSq() > 0.001) this.tempDir.normalize();
            else this.tempDir.set(0, 0, 1);

            if (!enemy.wormDashDir) enemy.wormDashDir = new THREE.Vector3();
            enemy.wormDashDir.copy(this.tempDir);

            // Rotate boss to face dash direction
            const targetAngle = Math.atan2(this.tempDir.x, this.tempDir.z);
            let diff = targetAngle - enemy.mesh.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            enemy.mesh.rotation.y += diff * Math.min(1.0, 12.0 * delta);

            // Show Red Directional Plane Indicator on floor
            if (!enemy.wormDashTelegraphMesh) {
              enemy.wormDashTelegraphMesh = new THREE.Mesh(this.wormDashTelegraphGeo, this.wormDashTelegraphMat);
              enemy.wormDashTelegraphMesh.rotation.x = -Math.PI / 2;
              this.scene.add(enemy.wormDashTelegraphMesh);
            }
            enemy.wormDashTelegraphMesh.visible = true;

            // Position red dash line in front of boss
            const midPoint = enemy.position.clone().addScaledVector(this.tempDir, 14.0);
            enemy.wormDashTelegraphMesh.position.set(midPoint.x, baseY + 0.05, midPoint.z);
            enemy.wormDashTelegraphMesh.rotation.z = Math.atan2(this.tempDir.x, this.tempDir.z);

            // Pulsate width / opacity
            const pulse = 0.5 + Math.sin(nowMs * 0.02) * 0.3;
            enemy.wormDashTelegraphMesh.scale.set(pulse, 1.0, 1.0);

            // Vibrate / windup animation
            enemy.mesh.position.y = baseY + Math.sin(nowMs * 0.05) * 0.15;

            if ((enemy.wormTimer || 0) <= 0) {
              enemy.wormState = 'dashing';
              enemy.wormTimer = 0.55; // Fast 0.55s dash burst
              enemy.wormRammedPlayer = false;

              if (enemy.wormDashTelegraphMesh) {
                enemy.wormDashTelegraphMesh.visible = false;
              }

              AudioEngine.playShotgun();
            }
          }
          // 5. DASHING (Furious charged dash ram forward)
          else if (enemy.wormState === 'dashing') {
            enemy.wormTimer = (enemy.wormTimer || 0) - delta;
            enemy.position.y = baseY;

            if (enemy.wormDashDir) {
              const moveX = enemy.wormDashDir.x * 34.0 * delta;
              const moveZ = enemy.wormDashDir.z * 34.0 * delta;

              if (activeRoom) {
                const wallMargin = 1.8;
                const minX = activeRoom.xCenter - activeRoom.width / 2 + wallMargin;
                const maxX = activeRoom.xCenter + activeRoom.width / 2 - wallMargin;
                const minZ = activeRoom.zCenter - activeRoom.depth / 2 + wallMargin;
                const maxZ = activeRoom.zCenter + activeRoom.depth / 2 - wallMargin;

                enemy.position.x = THREE.MathUtils.clamp(enemy.position.x + moveX, minX, maxX);
                enemy.position.z = THREE.MathUtils.clamp(enemy.position.z + moveZ, minZ, maxZ);
              } else {
                enemy.position.x += moveX;
                enemy.position.z += moveZ;
              }

              // Face dash direction
              const angle = Math.atan2(enemy.wormDashDir.x, enemy.wormDashDir.z);
              enemy.mesh.rotation.y = angle;
            }

            // Check ram impact on player
            if (distToPlayer < 3.2 && !enemy.wormRammedPlayer) {
              enemy.wormRammedPlayer = true;
              onPlayerDamage(16); // Ram impact damage
              AudioEngine.playShotgun();

              if (hitSplashes) {
                hitSplashes.spawn(playerPos.clone().add(new THREE.Vector3(0, 1.0, 0)), true);
              }

              // Knockback player
              if (enemy.wormDashDir) {
                playerPos.addScaledVector(enemy.wormDashDir, 6.0);
                if (activeRoom) {
                  const wallMargin = 1.2;
                  const minX = activeRoom.xCenter - activeRoom.width / 2 + wallMargin;
                  const maxX = activeRoom.xCenter + activeRoom.width / 2 - wallMargin;
                  const minZ = activeRoom.zCenter - activeRoom.depth / 2 + wallMargin;
                  const maxZ = activeRoom.zCenter + activeRoom.depth / 2 - wallMargin;
                  playerPos.x = THREE.MathUtils.clamp(playerPos.x, minX, maxX);
                  playerPos.z = THREE.MathUtils.clamp(playerPos.z, minZ, maxZ);
                }
              }
            }

            if ((enemy.wormTimer || 0) <= 0) {
              enemy.wormState = 'idle';
              enemy.attackCooldown = 3.2; // Cooldown before next special attack
              enemy.wormAttackType = 'burrow'; // Next attack will be burrow!
            }
          }
          // 6. IDLE / CHASE WALK
          else {
            enemy.position.y = baseY;

            // Standard Chase Walk towards player
            if (distToPlayer > minBossDist) {
              isWalking = true;
              this.tempDir.subVectors(playerPos, enemy.position);
              this.tempDir.y = 0;
              if (this.tempDir.lengthSq() > 0.001) this.tempDir.normalize();

              // Serpent slither oscillation
              const perpX = -this.tempDir.z;
              const perpZ = this.tempDir.x;
              const slither = Math.sin(nowMs * 0.008 + enemy.position.x * 0.2) * 0.2;

              const moveX = (this.tempDir.x + perpX * slither) * 4.5 * delta;
              const moveZ = (this.tempDir.z + perpZ * slither) * 4.5 * delta;

              if (activeRoom) {
                const wallMargin = 1.8;
                const minX = activeRoom.xCenter - activeRoom.width / 2 + wallMargin;
                const maxX = activeRoom.xCenter + activeRoom.width / 2 - wallMargin;
                const minZ = activeRoom.zCenter - activeRoom.depth / 2 + wallMargin;
                const maxZ = activeRoom.zCenter + activeRoom.depth / 2 - wallMargin;

                enemy.position.x = THREE.MathUtils.clamp(enemy.position.x + moveX, minX, maxX);
                enemy.position.z = THREE.MathUtils.clamp(enemy.position.z + moveZ, minZ, maxZ);
              } else {
                enemy.position.x += moveX;
                enemy.position.z += moveZ;
              }

              // Rotate head smoothly towards movement direction
              const moveAngle = Math.atan2(this.tempDir.x, this.tempDir.z);
              let diff = moveAngle - enemy.mesh.rotation.y;
              while (diff < -Math.PI) diff += Math.PI * 2;
              while (diff > Math.PI) diff -= Math.PI * 2;
              enemy.mesh.rotation.y += diff * Math.min(1.0, 8.0 * delta);
            }

            // Trigger Special Attack when cooldown is ready
            if (enemy.attackCooldown <= 0 && this.hasLineOfSight(enemy, playerPos)) {
              if (enemy.wormAttackType === 'burrow') {
                enemy.wormState = 'burrow_down';
                enemy.wormTimer = 0.7; // 0.7s diving animation
              } else {
                enemy.wormState = 'charge_dash';
                enemy.wormTimer = 1.0; // 1.0s charge windup
              }
            }
          }
        } else {
          // Standard Boss Walking AI
          if (distToPlayer > minBossDist) {
            isWalking = true;
            this.tempDir.subVectors(playerPos, enemy.position).normalize();
            const speed = 3.5;
            enemy.position.addScaledVector(this.tempDir, speed * delta);
          }
        }

        // Quadrupedal leg walk gait animation & sub-component animations
        const walkCycle = Math.sin(nowMs * 0.012);
        const legSwing = isWalking ? walkCycle * 0.45 : Math.sin(nowMs * 0.002) * 0.06;

        // PERF: direct references resolved at spawn - no per-frame traverse of the
        // boss model's hundreds of child meshes.
        const parts = enemy.animParts;
        if (parts && !parts.isEmpty) {
          for (let li = 0; li < parts.legsForward.length; li++) {
            parts.legsForward[li].rotation.x = legSwing;
          }
          for (let li = 0; li < parts.legsBackward.length; li++) {
            parts.legsBackward[li].rotation.x = -legSwing;
          }
          for (let fi = 0; fi < parts.fanBlades.length; fi++) {
            const fanSpeed = enemy.type === 'boss_ultradoman' ? 65.0 : 25.0;
            parts.fanBlades[fi].rotation.z += fanSpeed * delta; // High speed propeller spin
          }
          for (let mi = 0; mi < parts.minigunBarrels.length; mi++) {
            const minigunSpeed = enemy.type === 'boss_ultradoman' ? 50.0 : 18.0;
            parts.minigunBarrels[mi].rotation.z += minigunSpeed * delta; // Shoulder minigun rotation
          }
          if (parts.mouthJaw) {
            const isAttacking = enemy.attackCooldown < 1.6;
            const idleCycle = Math.sin(nowMs * 0.003) * 0.12 + 0.1;
            const mouthOpenFactor = isAttacking ? 0.75 : idleCycle;
            // Smoothly rotate lower jaw open and translate down
            parts.mouthJaw.rotation.x = THREE.MathUtils.lerp(parts.mouthJaw.rotation.x, mouthOpenFactor * 0.65, 0.12);
            parts.mouthJaw.position.y = THREE.MathUtils.lerp(parts.mouthJaw.position.y, -0.25 - mouthOpenFactor * 0.35, 0.12);
          }
          if (parts.mouthRpg) {
            const isAttacking = enemy.attackCooldown < 1.6;
            const targetZ = isAttacking ? 0.75 : 0.15;
            parts.mouthRpg.position.z = THREE.MathUtils.lerp(parts.mouthRpg.position.z, targetZ, 0.12);
          }
        }

        // Boss Special Attack Loop
        if (enemy.attackCooldown <= 0 && this.hasLineOfSight(enemy, playerPos)) {
          enemy.attackCooldown = 2.5;

          if (enemy.type === 'boss_goliath') {
            this.tempVec.copy(enemy.position).add(this.tempDir2.set(-1.8, 3.2, 0));
            this.spawnEnemyProjectile(this.tempVec, playerPos, 20, 2);
          } else if (enemy.type === 'boss_miner') {
            this.tempVec.copy(enemy.position).add(this.tempDir2.set(0, 2, 0));
            this.spawnDynamiteBundle(this.tempVec, playerPos);
          } else if (enemy.type === 'boss_overlord') {
            onPlayerDamage(2);
            AudioEngine.playExplosion();
          } else if (enemy.type === 'boss_ultradoman') {
            // Fire homing rockets from deployable mouth RPG!
            this.tempVec.copy(enemy.position).add(this.tempDir2.set(0, 2.7, 1.2));
            this.spawnEnemyRocket(this.tempVec, playerPos, 16, 2);
            onPlayerDamage(1);
            AudioEngine.playRocketLaunch();
          }
        }
      }

      // Resolve solid wall, obstacle, player, and arena collision for this enemy
      this.resolveEnemyObstacleCollisions(enemy, this.getObstacles(), playerPos, rooms);
    }

    // 1b. Pairwise Enemy-Enemy Separation (Prevents mobs from stacking/sticking inside each other)
    // PERF: room-frozen enemies never move (their AI `continue`s before any movement code),
    // so separating them is wasted O(N^2) work - restrict pairs to active enemies.
    for (let i = 0; i < this.enemies.length; i++) {
      const e1 = this.enemies[i];
      if (e1.isDead || e1.isRoomFrozen) continue;

      for (let j = i + 1; j < this.enemies.length; j++) {
        const e2 = this.enemies[j];
        if (e2.isDead || e2.isRoomFrozen) continue;

        const minRadius = (e1.isBoss ? 2.5 : 1.1) + (e2.isBoss ? 2.5 : 1.1);
        const dx = e2.position.x - e1.position.x;
        const dz = e2.position.z - e1.position.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < minRadius * minRadius && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = (minRadius - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;

          e1.position.x -= nx * overlap;
          e1.position.z -= nz * overlap;
          e2.position.x += nx * overlap;
          e2.position.z += nz * overlap;
        }
      }
    }

    // 2. Update Projectiles
    const obstacles = this.getObstacles();
    for (let p = this.projectiles.length - 1; p >= 0; p--) {
      const proj = this.projectiles[p];
      this.projOldPos.copy(proj.mesh.position);
      proj.mesh.position.addScaledVector(proj.velocity, delta);
      proj.life -= delta;

      if (proj.isEnemy) {
        if (proj.mesh.position.distanceToSquared(playerPos) < 2.25) {
          onPlayerDamage(proj.damage);
          if (proj.isToxic) {
            this.spawnToxicPool(proj.mesh.position.clone(), 3.5, 1.4);
          }
          if (proj.isWeb && onPlayerSlow) {
            onPlayerSlow(3.5);
          }
          this.scene.remove(proj.mesh);
          this.projectiles.splice(p, 1);
          continue;
        }

        // Raycast check projectile collision against solid level walls and obstacles.
        // PERF: candidates narrowed to obstacle subtrees whose AABB the step-ray crosses -
        // this used to raycast the entire level per projectile per frame.
        if (obstacles && obstacles.length > 0) {
          const stepDist = proj.velocity.length() * delta + 0.2;
          this.projDir.copy(proj.velocity).normalize();
          const candidates = this.collectObstaclesAlongRay(this.projOldPos, this.projDir, stepDist);
          let wallHits: THREE.Intersection[] = EnemyEngine.EMPTY_HITS;
          if (candidates.length > 0) {
            this.losRaycaster.set(this.projOldPos, this.projDir);
            this.losRaycaster.near = 0;
            this.losRaycaster.far = stepDist;
            wallHits = this.losRaycaster.intersectObjects(candidates, true);
          }
          if (wallHits.length > 0) {
            if (hitSplashes) {
              hitSplashes.spawn(wallHits[0].point, false);
            }
            if (proj.isToxic) {
              this.spawnToxicPool(wallHits[0].point, 3.0, 1.2);
            }
            this.scene.remove(proj.mesh);
            this.projectiles.splice(p, 1);
            continue;
          }
        }
      }

      if (proj.life <= 0) {
        this.scene.remove(proj.mesh);
        this.projectiles.splice(p, 1);
      }
    }

    // 3. Update White Nano-fluid Healing Puddles (pooled, zero allocations)
    for (const cloud of this.nanoPool) {
      if (!cloud.active) continue;
      cloud.duration -= delta;
      const elapsed = cloud.maxDuration - cloud.duration;

      // Pulse visibility near expiration
      if (cloud.duration < 1.5) {
        cloud.mesh.visible = Math.floor(elapsed * 10) % 2 === 0;
      } else {
        cloud.mesh.visible = true;
      }

      // Check player heal pickup on floor plane
      const dx = playerPos.x - cloud.position.x;
      const dz = playerPos.z - cloud.position.z;
      if (dx * dx + dz * dz < 6.25) { // 2.5 * 2.5
        if (onPlayerHeal) onPlayerHeal(cloud.healAmount);
        cloud.active = false;
        cloud.mesh.visible = false;
        if (onStylePoints) onStylePoints(200, '🤍 NANO-PUDDLE HEAL (+40 HP)');
        continue;
      }

      if (cloud.duration <= 0) {
        cloud.active = false;
        cloud.mesh.visible = false;
      }
    }

    // 4. Update Toxic Green Poison Puddles (pooled)
    for (const pool of this.toxicPool) {
      if (!pool.active) continue;
      pool.duration -= delta;
      pool.damageTimer -= delta;
      const elapsed = pool.maxDuration - pool.duration;

      for (let b = 0; b < pool.bubbles.length; b++) {
        pool.bubbles[b].position.y = 0.08 + Math.sin(elapsed * 4.0 + b) * 0.06;
      }

      // Pulse visibility near expiration (< 2s)
      if (pool.duration < 2.0) {
        pool.mesh.visible = Math.floor(elapsed * 10) % 2 === 0;
      } else {
        pool.mesh.visible = true;
      }

      // Check player standing inside toxic puddle
      const dx = playerPos.x - pool.position.x;
      const dz = playerPos.z - pool.position.z;
      const radSq = pool.radius * pool.radius;
      if (dx * dx + dz * dz < radSq) {
        if (pool.damageTimer <= 0) {
          pool.damageTimer = 0.4; // 2 poison damage every 0.4s
          if (onPlayerDamage) onPlayerDamage(2);
        }
      }

      if (pool.duration <= 0) {
        pool.active = false;
        pool.mesh.visible = false;
      }
    }
  }

  /**
   * Clamp a position inside a room's walkable bounds (1.6 m wall margin).
   * PERF: writes into a shared scratch object - callers must consume x/z immediately.
   * Replaces a closure + object literal that were allocated per centipede per frame.
   */
  private clampPosInRoom(room: RoomInfo | undefined, x: number, z: number): { x: number; z: number } {
    const out = this.clampResult;
    if (!room) {
      out.x = x;
      out.z = z;
      return out;
    }
    const wallMargin = 1.6;
    out.x = THREE.MathUtils.clamp(x, room.xCenter - room.width / 2 + wallMargin, room.xCenter + room.width / 2 - wallMargin);
    out.z = THREE.MathUtils.clamp(z, room.zCenter - room.depth / 2 + wallMargin, room.zCenter + room.depth / 2 - wallMargin);
    return out;
  }

  private resolveEnemyObstacleCollisions(
    enemy: EnemyInstance,
    obstacles: THREE.Object3D[],
    playerPos: THREE.Vector3,
    rooms?: RoomInfo[]
  ) {
    const radius = enemy.isBoss ? 2.2 : 0.85;

    // 0. Floor height alignment for grounded mobs & void protection
    // PERF: O(1) map lookup instead of a rooms.find() scan per enemy per frame.
    const activeRm = this.getRoomById(enemy.roomId, rooms);
    const roomFloorY = activeRm ? activeRm.yCenter : 0;
    const minGroundY = roomFloorY + 0.8;

    const isSubmergedWorm = enemy.type === 'boss_worm' && (enemy.wormState === 'burrow_down' || enemy.wormState === 'burrow_underground' || enemy.wormState === 'emerge_up');

    if (enemy.type !== 'drone' && enemy.type !== 'winged_doman' && !isSubmergedWorm) {
      this.rayOriginTemp.copy(enemy.position);
      this.rayOriginTemp.y += 4.0;
      this.tempDir.set(0, -1, 0);
      this.downRaycaster.set(this.rayOriginTemp, this.tempDir);
      this.downRaycaster.far = 12.0;
      try {
        // PERF: AABB pre-filter - the down probe used to test the entire obstacle list.
        const floorTargets = this.collectObstaclesAlongRay(this.rayOriginTemp, this.tempDir, 12.0);
        const floorHits = floorTargets.length > 0 ? this.downRaycaster.intersectObjects(floorTargets, false) : EnemyEngine.EMPTY_HITS;
        if (floorHits.length > 0) {
          const targetY = Math.max(minGroundY, floorHits[0].point.y + 0.8);
          if (!enemy.knockbackVel || enemy.knockbackVel.lengthSq() < 1.0) {
            enemy.position.y = THREE.MathUtils.lerp(enemy.position.y, targetY, 0.25);
          }
        } else if (
          enemy.position.y < roomFloorY - 0.2 ||
          (activeRm && Math.abs(enemy.position.z - activeRm.zCenter) > activeRm.depth / 2 + 15)
        ) {
          // Fallen out of floor / map bounds or strayed outside room! Teleport back to room center
          if (activeRm) {
            enemy.position.set(activeRm.xCenter, minGroundY, activeRm.zCenter);
          } else {
            enemy.position.y = minGroundY;
          }
          if (enemy.knockbackVel) enemy.knockbackVel.set(0, 0, 0);
        }
      } catch {}
    }

    // 1. Raycast collision against level walls and obstacles
    if (obstacles.length > 0) {
      this.rayOriginTemp.copy(enemy.position);
      this.rayOriginTemp.y += 0.8; // Waist height
      this.knockbackRaycaster.far = radius + 0.2;

      // PERF: only obstacles whose AABB is within ray reach; skip the pass when none are.
      // (Also exact for any future mesh whose origin sits far from its geometry.)
      const targets = this.collectObstaclesNearPoint(this.rayOriginTemp, radius + 0.25);

      for (let a = 0; targets.length > 0 && a < EnemyEngine.WALL_PROBE_ANGLES.length; a++) {
        const angle = EnemyEngine.WALL_PROBE_ANGLES[a];
        this.tempDir.set(Math.cos(angle), 0, Math.sin(angle));
        this.knockbackRaycaster.set(this.rayOriginTemp, this.tempDir);
        try {
          const hits = this.knockbackRaycaster.intersectObjects(targets, false);
          if (hits.length > 0 && hits[0].distance < radius) {
            const hit = hits[0];
            const pushDist = radius - hit.distance;
            if (hit.face) {
              this.tempNormal.copy(hit.face.normal);
              this.tempNormal.transformDirection(hit.object.matrixWorld);
              this.tempNormal.y = 0;
              if (this.tempNormal.lengthSq() > 0.001) {
                this.tempNormal.normalize();
                enemy.position.addScaledVector(this.tempNormal, pushDist);
              } else {
                enemy.position.addScaledVector(this.tempDir, -pushDist);
              }
            } else {
              enemy.position.addScaledVector(this.tempDir, -pushDist);
            }
          }
        } catch {
          // Guard against scene mutations during raycast
        }
      }
    }

    // 2. Prevent overlapping / walking inside the player
    const distToPlayerSq = enemy.position.distanceToSquared(playerPos);
    const minPlayerDist = radius + 0.75;
    if (distToPlayerSq < minPlayerDist * minPlayerDist && distToPlayerSq > 0.000001) {
      this.tempVec.subVectors(enemy.position, playerPos);
      this.tempVec.y = 0;
      if (this.tempVec.lengthSq() > 0.001) {
        this.tempVec.normalize();
        enemy.position.copy(playerPos).addScaledVector(this.tempVec, minPlayerDist);
      }
    }

    // 3. Strict Room Boundary Enforcement
    if (rooms && rooms.length > 0) {
      // PERF: O(1) map lookups instead of rooms.find() scans per enemy per frame.
      let activeRoom = enemy.roomId !== undefined ? this.roomIndex.get(enemy.roomId) : undefined;
      if (!activeRoom) {
        const closestId = LevelGenerator.getRoomIdAtPosition(enemy.position, rooms);
        activeRoom = this.roomIndex.get(closestId) || rooms[0];
      }

      const isDrone = enemy.type === 'drone' || enemy.type === 'winged_doman';
      const roomMargin = enemy.isBoss ? 2.5 : (isDrone ? 1.8 : 1.2);
      const minX = activeRoom.xCenter - activeRoom.width / 2 + roomMargin;
      const maxX = activeRoom.xCenter + activeRoom.width / 2 - roomMargin;
      const minZ = activeRoom.zCenter - activeRoom.depth / 2 + roomMargin;
      const maxZ = activeRoom.zCenter + activeRoom.depth / 2 - roomMargin;

      if (isDrone) {
        // Flying drones MUST stay strictly inside room interior bounds and never enter wall geometry
        let insideAnyRoomInterior = false;
        for (const rm of rooms) {
          const innerMinX = rm.xCenter - rm.width / 2 + 1.8;
          const innerMaxX = rm.xCenter + rm.width / 2 - 1.8;
          const innerMinZ = rm.zCenter - rm.depth / 2 + 1.8;
          const innerMaxZ = rm.zCenter + rm.depth / 2 - 1.8;

          if (
            enemy.position.x >= innerMinX &&
            enemy.position.x <= innerMaxX &&
            enemy.position.z >= innerMinZ &&
            enemy.position.z <= innerMaxZ
          ) {
            insideAnyRoomInterior = true;
            break;
          }
        }

        if (!insideAnyRoomInterior) {
          enemy.position.x = THREE.MathUtils.clamp(enemy.position.x, minX, maxX);
          enemy.position.z = THREE.MathUtils.clamp(enemy.position.z, minZ, maxZ);
          if (enemy.knockbackVel) {
            enemy.knockbackVel.x = 0;
            enemy.knockbackVel.z = 0;
          }
        }
      } else if (enemy.position.x < minX || enemy.position.x > maxX || enemy.position.z < minZ || enemy.position.z > maxZ) {
        // Check if inside valid adjacent room / corridor channel
        let inValidChannel = false;
        for (const rm of rooms) {
          if (Math.abs(rm.id - activeRoom.id) <= 1) {
            const hW = rm.width / 2 + 2.0;
            const hD = rm.depth / 2 + 10.0;
            if (Math.abs(enemy.position.x - rm.xCenter) <= hW && Math.abs(enemy.position.z - rm.zCenter) <= hD) {
              inValidChannel = true;
              break;
            }
          }
        }

        if (!inValidChannel) {
          enemy.position.x = THREE.MathUtils.clamp(enemy.position.x, minX, maxX);
          enemy.position.z = THREE.MathUtils.clamp(enemy.position.z, minZ, maxZ);
          if (enemy.knockbackVel) {
            enemy.knockbackVel.set(0, 0, 0);
          }
        }
      }
    } else {
      const maxHalfWidth = 80.0;
      enemy.position.x = Math.max(-maxHalfWidth, Math.min(maxHalfWidth, enemy.position.x));
      enemy.position.z = Math.max(-1500.0, Math.min(300.0, enemy.position.z));
    }

    // ABSOLUTE HARD FLOOR & CEILING SAFETY CLAMP FOR FLYING & GROUND MOBS
    if (enemy.type === 'drone' || enemy.type === 'winged_doman') {
      const minDroneY = roomFloorY + 1.8;
      const maxDroneY = roomFloorY + 5.2;
      enemy.position.y = THREE.MathUtils.clamp(enemy.position.y, minDroneY, maxDroneY);
      if (enemy.knockbackVel && (enemy.position.y <= minDroneY || enemy.position.y >= maxDroneY)) {
        enemy.knockbackVel.y = 0;
      }
    } else {
      if (enemy.position.y < minGroundY) {
        enemy.position.y = minGroundY;
        if (enemy.knockbackVel && enemy.knockbackVel.y < 0) enemy.knockbackVel.y = 0;
      }
    }
  }

  public spawnEnemyProjectile(
    from: THREE.Vector3,
    to: THREE.Vector3,
    speed: number,
    damage: number,
    isToxic: boolean = false,
    isWeb: boolean = false
  ) {
    const geo = new THREE.SphereGeometry(isToxic ? 0.35 : (isWeb ? 0.38 : 0.25), 8, 8);
    let mat: THREE.Material;
    if (isToxic) {
      mat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    } else if (isWeb) {
      mat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    } else {
      mat = new THREE.MeshBasicMaterial({ color: 0xff0044 });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);

    if (isToxic) {
      const auraGeo = new THREE.SphereGeometry(0.52, 8, 8);
      const auraMat = new THREE.MeshBasicMaterial({ color: 0xa7f3d0, transparent: true, opacity: 0.5 });
      const aura = new THREE.Mesh(auraGeo, auraMat);
      mesh.add(aura);
    } else if (isWeb) {
      const webRing1 = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.04, 6, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
      );
      mesh.add(webRing1);
      const webRing2 = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.04, 6, 12),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.85 })
      );
      webRing2.rotation.x = Math.PI / 2;
      mesh.add(webRing2);
    }

    this.scene.add(mesh);

    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    this.projectiles.push({
      mesh,
      velocity: dir.multiplyScalar(speed),
      damage,
      isEnemy: true,
      life: 4.0,
      isToxic,
      isWeb,
    });
  }

  public spawnEnemyRocket(from: THREE.Vector3, to: THREE.Vector3, speed: number = 12, damage: number = 10) {
    const group = new THREE.Group();

    // Metallic rocket body
    const bodyGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.52, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    // Crimson conical warhead tip
    const tipGeo = new THREE.ConeGeometry(0.085, 0.22, 8);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2, metalness: 0.7 });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.35;
    group.add(tip);

    // Hazard ring at warhead base
    const ringGeo = new THREE.TorusGeometry(0.085, 0.012, 6, 12);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = 0.24;
    group.add(ring);

    // Tail fins
    const finGeo = new THREE.BoxGeometry(0.015, 0.18, 0.14);
    const finMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
    for (let f = 0; f < 4; f++) {
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.rotation.z = (f * Math.PI) / 2;
      fin.position.z = -0.20;
      group.add(fin);
    }

    // Exhaust Thruster Glow
    const glowGeo = new THREE.SphereGeometry(0.09, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.z = -0.28;
    group.add(glow);

    group.position.copy(from);
    group.lookAt(to);
    this.scene.add(group);

    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    this.projectiles.push({
      mesh: group as unknown as THREE.Mesh,
      velocity: dir.multiplyScalar(speed),
      damage,
      isEnemy: true,
      life: 5.0,
    });

    AudioEngine.playRocketLaunch();
  }

  public spawnDynamiteBundle(from: THREE.Vector3, to: THREE.Vector3) {
    const geo = new THREE.CylinderGeometry(0.15, 0.15, 0.6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    this.scene.add(mesh);

    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    dir.y += 0.3; // Arc trajectory
    this.projectiles.push({
      mesh,
      velocity: dir.multiplyScalar(18),
      damage: 40,
      isEnemy: true,
      life: 5.0,
      isDynamite: true,
    });
  }

  public killEnemy(enemy: EnemyInstance, isSuicide: boolean = false, onStylePoints?: (pts: number, name: string) => void) {
    if (enemy.isDead) return;
    enemy.isDead = true;
    // PERF: dead enemies used to stay in this.enemies forever, so every per-frame loop
    // (AI, separation, visibility, HUD counts) stayed O(total ever spawned). The counter
    // replaces the per-frame dead scans and the array is compacted on the next update().
    this.deadCount++;
    this.hasDeadEntries = true;
    if (this.activeBoss === enemy) {
      this.activeBoss = this.enemies.find((e) => e.isBoss && !e.isDead && e !== enemy) ?? null;
    }
    this.scene.remove(enemy.mesh);

    if (enemy.wormTelegraphMesh) {
      this.scene.remove(enemy.wormTelegraphMesh);
      enemy.wormTelegraphMesh = undefined;
    }
    if (enemy.wormDashTelegraphMesh) {
      this.scene.remove(enemy.wormDashTelegraphMesh);
      enemy.wormDashTelegraphMesh = undefined;
    }

    if (!isSuicide) {
      // Spawn White Nano-Fluid Fountain/Cloud
      this.spawnNanoCloud(enemy.position.clone());

      // If Chemical Doman with barrel on back or dynamiter, leave a toxic green poison puddle!
      if (enemy.type === 'worm' || enemy.type === 'doman_dynamiter') {
        this.spawnToxicPool(enemy.position.clone(), 12.0, 3.2);
      }

      if (onStylePoints) onStylePoints(250, enemy.isBoss ? 'BOSS ANNIHILATED' : 'KILL');
    }
  }

  public spawnToxicPool(pos: THREE.Vector3, maxDur: number = 12.0, radius: number = 2.8) {
    let item = this.toxicPool.find((p) => !p.active);
    if (!item) {
      item = this.toxicPool[0]; // Reuse oldest if pool exhausted
    }

    let floorY = 0.0;
    const obstacles = this.getObstacles();
    if (obstacles.length > 0) {
      this.rayOriginTemp.copy(pos);
      this.rayOriginTemp.y += 3.0;
      this.tempDir.set(0, -1, 0);
      this.downRaycaster.set(this.rayOriginTemp, this.tempDir);
      this.downRaycaster.far = 10.0;
      try {
        const hits = this.downRaycaster.intersectObjects(obstacles, false);
        if (hits.length > 0) {
          floorY = hits[0].point.y;
        }
      } catch {}
    }

    item.mesh.position.set(pos.x, floorY, pos.z);
    item.mesh.scale.setScalar(radius / 2.8);
    item.duration = maxDur;
    item.maxDuration = maxDur;
    item.damageTimer = 0;
    item.radius = radius;
    item.active = true;
    item.mesh.visible = true;
  }

  public spawnNanoCloud(pos: THREE.Vector3) {
    let item = this.nanoPool.find((p) => !p.active);
    if (!item) {
      item = this.nanoPool[0]; // Reuse oldest if pool exhausted
    }

    let floorY = 0.0;
    const obstacles = this.getObstacles();
    if (obstacles.length > 0) {
      this.rayOriginTemp.copy(pos);
      this.rayOriginTemp.y += 3.0;
      this.tempDir.set(0, -1, 0);
      this.downRaycaster.set(this.rayOriginTemp, this.tempDir);
      this.downRaycaster.far = 10.0;
      try {
        const hits = this.downRaycaster.intersectObjects(obstacles, false);
        if (hits.length > 0) {
          floorY = hits[0].point.y;
        }
      } catch {}
    }

    item.mesh.position.set(pos.x, floorY, pos.z);
    item.duration = 5.0;
    item.maxDuration = 5.0;
    item.healAmount = 40;
    item.active = true;
    item.mesh.visible = true;
  }

  public applyHvbToEnemies(
    playerPos: THREE.Vector3,
    forwardDir: THREE.Vector3,
    chargeRatio: number,
    onStylePoints: (pts: number, name: string) => void
  ) {
    const range = 6.0 + chargeRatio * 6.0;
    const damage = 1 + chargeRatio * 3; // Minimal damage so mobs ricochet smoothly!
    const launchSpeed = 8 + chargeRatio * 32; // Controlled, readable speed
    const stunTime = 0.3 + chargeRatio * 0.2; // Fast 0.3 - 0.5s recovery

    let hitAny = false;

    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const dist = enemy.position.distanceTo(playerPos);
      if (dist <= range) {
        hitAny = true;

        // Launch vector (Forward + angled up)
        const launchDir = forwardDir.clone().normalize();
        launchDir.y = Math.max(0.20, launchDir.y + 0.30);
        launchDir.normalize();

        enemy.knockbackVel = launchDir.multiplyScalar(launchSpeed);
        enemy.ricochetBounces = 0;
        enemy.hp -= damage;
        enemy.isStunned = true;
        enemy.stunTimer = stunTime;

        if (this.onDamageNumber) {
          this.onDamageNumber(enemy.position, Math.round(damage), chargeRatio >= 0.7);
        }
        if (this.onHitSplash) {
          this.onHitSplash(enemy.position, chargeRatio >= 0.7);
        }

        if (enemy.hp <= 0) {
          this.killEnemy(enemy, false, onStylePoints);
        }
      }
    }

    if (hitAny) {
      if (chargeRatio >= 0.9) {
        onStylePoints(1000, '🚀 1000x HYPER COSMIC RICOCHET PUNCH');
      } else if (chargeRatio >= 0.5) {
        onStylePoints(500, '💥 EXTREME SPEED IMPACT');
      } else {
        onStylePoints(250, '⚡ LIGHTNING STRIKE');
      }
    }
  }

  public applyGroundPoundShockwave(
    center: THREE.Vector3,
    onStylePoints: (pts: number, name: string) => void
  ) {
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const dist = enemy.position.distanceTo(center);
      if (dist < 7.0) {
        enemy.hp -= 20;
        enemy.position.y += 3.5; // Launch into air for juggling!
        enemy.isStunned = true;
        enemy.stunTimer = 0.3;
        if (this.onDamageNumber) this.onDamageNumber(enemy.position, 20, true);
        if (this.onHitSplash) this.onHitSplash(enemy.position, true);
        onStylePoints(200, 'GROUND POUND SPLAT');

        if (enemy.hp <= 0) {
          this.killEnemy(enemy, false, onStylePoints);
        }
      }
    }
  }

  public clearAll() {
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.mesh);
    }
    this.enemies = [];
    this.activeBoss = null;
    this.hasDeadEntries = false;

    for (const proj of this.projectiles) {
      this.scene.remove(proj.mesh);
    }
    this.projectiles = [];

    for (const cloud of this.nanoPool) {
      cloud.active = false;
      cloud.mesh.visible = false;
    }
  }
}
