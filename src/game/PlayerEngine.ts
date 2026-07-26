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

  // Dash (3 charges, 0.8s internal CD, 2.0s per charge sequential recharge)
  public dashCharges: number = 3;
  public maxDashCharges: number = 3;
  public dashInternalCd: number = 0;
  public maxDashInternalCd: number = 0.8;
  private dashRechargeTimer: number = 0;
  public dashRechargeRate: number = 2.0;
  public isDashing: boolean = false;
  private dashTime: number = 0;

  // Slide
  public isSliding: boolean = false;

  // Jump & Wall Kick
  public isGrounded: boolean = false;
  public jumpCount: number = 0;
  public maxJumps: number = 2;
  public hasWallJumpedInAir: boolean = false;
  public isNearWall: boolean = false;
  public wallNormal: THREE.Vector3 = new THREE.Vector3();

  // Ground Pound / Slam
  public isGroundPounding: boolean = false;

  // HVB Charged Punch (Key F)
  public hvbCooldown: number = 0;
  public maxHvbCd: number = 2.0; // 2 second punch cooldown
  public isChargingPunch: boolean = false;
  public punchChargeTimer: number = 0;
  public punchChargeRatio: number = 0;
  public maxPunchChargeTime: number = 0.25; // Super fast 0.25s full charge

  // Grapple Hook (Key Q)
  public grappleCooldown: number = 0;
  public maxGrappleCd: number = 0.5; // Fast 0.5s grapple cooldown
  public isGrappling: boolean = false;
  public grappleTargetPoint: THREE.Vector3 | null = null;

  // Weapons & Skills
  public currentWeapon: WeaponId = 'peacemaker';
  public slowTimer: number = 0;
  public unlockedWeapons: Record<WeaponId, boolean> = {
    peacemaker: true,
    trembler: false,
    punisher: false,
    grapple: true,
  };

  // Skill CDs
  public coinCd: number = 0; // Peacemaker ricochet shot, 4s
  public flashbangCd: number = 0; // 8s
  public berserkCd: number = 0; // 25s
  public isBerserkActive: boolean = false;
  public berserkTimer: number = 0;

  // Flashbang overlay
  public flashbangIntensity: number = 0;

  // Reusable raycasters and vectors for zero-allocation performance
  private wallRaycaster = new THREE.Raycaster();
  private wallCheckRaycaster = new THREE.Raycaster();
  private upRaycaster = new THREE.Raycaster();
  private downRaycaster = new THREE.Raycaster();
  private tempRayOrigin = new THREE.Vector3();
  private tempRayDir = new THREE.Vector3();
  private downDir = new THREE.Vector3(0, -1, 0);
  private upDir = new THREE.Vector3(0, 1, 0);

  private tempForward = new THREE.Vector3();
  private tempRight = new THREE.Vector3();
  private tempMoveDir = new THREE.Vector3();
  private tempPullDir = new THREE.Vector3();
  private tempDashDir = new THREE.Vector3();
  private tempUpAxis = new THREE.Vector3(0, 1, 0);
  private tempNormal = new THREE.Vector3();
  private tempWorldPos = new THREE.Vector3();
  private tempTotalMove = new THREE.Vector3();
  private probeHeightsTemp = [0, 0, 0];
  private nearbyWallsTemp: THREE.Object3D[] = [];

  /**
   * PERF: cached wall subset of the static level meshes.
   *
   * resolveWallCollisions() and checkWalls() each used to rebuild this list from scratch
   * every frame - two full passes over every static mesh in the level (thousands of
   * entries), twice per frame, just to re-derive an answer that never changes. The list is
   * now built once per level and reused; `wallCacheSource` detects the level swap by
   * identity so no explicit invalidation call is needed.
   */
  private cachedWalls: THREE.Object3D[] = [];
  private wallCacheSource: THREE.Object3D[] | null = null;

  /**
   * PERF: static-geometry data cached alongside the wall list (same lifecycle):
   * - a world AABB per wall (PASS 1 used to run Box3.setFromObject - a full subtree walk -
   *   per candidate wall, per invocation, 2-5x per frame);
   * - a world center + bounding radius per wall (collectNearbyWalls used to call
   *   getWorldPosition - a parent-chain matrix multiply - per wall, per call, 3-6x/frame);
   * - center/radius for ALL static meshes, so the vertical ground/ceiling probes can
   *   pre-filter by XZ distance instead of raycasting the entire level.
   */
  private cachedWallBoxes: THREE.Box3[] = [];
  private cachedWallCenters: THREE.Vector3[] = [];
  private cachedWallRadii: number[] = [];
  private cachedAllCenters: THREE.Vector3[] = [];
  private cachedAllRadii: number[] = [];
  private nearbyWallBoxesTemp: THREE.Box3[] = [];
  private tempBox = new THREE.Box3();
  private verticalCandidatesTemp: THREE.Object3D[] = [];
  private allCacheSource: THREE.Object3D[] | null = null;
  private cacheBox = new THREE.Box3();

  public invalidateWallCache() {
    this.wallCacheSource = null;
    this.allCacheSource = null;
    this.cachedWalls.length = 0;
  }

  private getWalls(sceneObjects: THREE.Object3D[]): THREE.Object3D[] {
    if (this.wallCacheSource !== sceneObjects) {
      this.wallCacheSource = sceneObjects;
      this.cachedWalls.length = 0;
      this.cachedWallBoxes.length = 0;
      this.cachedWallCenters.length = 0;
      this.cachedWallRadii.length = 0;
      for (let i = 0; i < sceneObjects.length; i++) {
        const o = sceneObjects[i];
        // NOTE: no o.visible check - room culling hides geometry the player isn't near,
        // but walls must keep blocking regardless of whether they're drawn this frame.
        if (
          o.name === 'wall' ||
          o.name === 'unlocked_barrier' ||
          o.name === 'locked_barrier' ||
          o.name.includes('wall') ||
          o.name.includes('barrier')
        ) {
          this.cachedWalls.push(o);
          const box = new THREE.Box3().setFromObject(o);
          this.cachedWallBoxes.push(box);
          const center = new THREE.Vector3();
          box.getCenter(center);
          this.cachedWallCenters.push(center);
          this.cachedWallRadii.push(box.max.distanceTo(box.min) * 0.5);
        }
      }
    }
    return this.cachedWalls;
  }

  /** Builds the center/radius cache for the full static mesh list (vertical probes). */
  private ensureAllMeshCache(sceneObjects: THREE.Object3D[]) {
    if (this.allCacheSource === sceneObjects) return;
    this.allCacheSource = sceneObjects;
    this.cachedAllCenters.length = 0;
    this.cachedAllRadii.length = 0;
    for (let i = 0; i < sceneObjects.length; i++) {
      this.cacheBox.setFromObject(sceneObjects[i]);
      const center = new THREE.Vector3();
      this.cacheBox.getCenter(center);
      this.cachedAllCenters.push(center);
      this.cachedAllRadii.push(
        this.cacheBox.isEmpty() ? 0 : this.cacheBox.max.distanceTo(this.cacheBox.min) * 0.5
      );
    }
  }

  /**
   * Candidates for a vertical (up/down) ray at the player's XZ. A vertical ray cannot hit
   * a mesh whose bounding sphere is farther away in XZ than its radius (+1 m margin).
   */
  private collectVerticalRayCandidates(sceneObjects: THREE.Object3D[]): THREE.Object3D[] {
    this.ensureAllMeshCache(sceneObjects);
    const out = this.verticalCandidatesTemp;
    out.length = 0;
    const px = this.position.x;
    const pz = this.position.z;
    for (let i = 0; i < sceneObjects.length; i++) {
      const c = this.cachedAllCenters[i];
      const dx = c.x - px;
      const dz = c.z - pz;
      const r = this.cachedAllRadii[i] + 1.0;
      if (dx * dx + dz * dz <= r * r) {
        out.push(sceneObjects[i]);
      }
    }
    return out;
  }

  /** Narrows the cached wall list to those near the player, into nearbyWallsTemp. */
  private collectNearbyWalls(sceneObjects: THREE.Object3D[]): THREE.Object3D[] {
    const walls = this.getWalls(sceneObjects);
    if (walls.length === 0) return walls;

    this.nearbyWallsTemp.length = 0;
    this.nearbyWallBoxesTemp.length = 0;
    for (let i = 0; i < walls.length; i++) {
      // dist(center) - radius < 30  <=>  distSq < (30 + radius)^2, all precomputed.
      const reach = 30.0 + this.cachedWallRadii[i];
      if (this.cachedWallCenters[i].distanceToSquared(this.position) < reach * reach) {
        this.nearbyWallsTemp.push(walls[i]);
        this.nearbyWallBoxesTemp.push(this.cachedWallBoxes[i]);
      }
    }
    return this.nearbyWallsTemp;
  }

  private static readonly EMPTY_HITS: THREE.Intersection[] = [];

  private static readonly wallCheckDirs = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];
  private static readonly wallAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

  // Controls input state
  public moveInput = { forward: false, backward: false, left: false, right: false };
  public mouseDelta = { x: 0, y: 0 };
  public sensitivity: number = 0.002;

  // Camera pitch/yaw
  public pitch: number = 0;
  public yaw: number = 0;
  public currentCamHeight: number = 1.8;

  constructor() {
    // PERF: near 0.03 / far 260 instead of 0.01 / 1000. FogExp2(0.012) is >99% opaque by
    // ~200m and no sightline exceeds ~120m, so 800 units of depth range bought nothing -
    // while the 1:100000 near/far ratio starved the depth buffer and z-fought the many
    // coplanar 5mm-offset trim plates. Near stays below the closest viewmodel geometry.
    this.camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.03, 260);
    this.camera.rotation.order = 'YXZ';
    this.position = new THREE.Vector3(0, 1.8, 5);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.camera.position.copy(this.position);
  }

  public reset(spawnPos: THREE.Vector3) {
    this.hp = 100;
    this.isDead = false;
    this.currentWeapon = 'peacemaker';
    this.position.copy(spawnPos);
    this.velocity.set(0, 0, 0);
    this.dashCharges = 3;
    this.dashInternalCd = 0;
    this.dashRechargeTimer = 0;
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
    this.jumpCount = 0;
    this.hasWallJumpedInAir = false;
    this.pitch = 0;
    this.yaw = 0;
    this.currentCamHeight = 1.8;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.camera.position.copy(this.position);
  }

  public update(delta: number, sceneObjects: THREE.Object3D[]): {
    groundPoundShockwave?: THREE.Vector3;
    hvbPunch?: boolean;
    flashbangGrenade?: boolean;
    ricochetShot?: boolean;
  } {
    if (this.isDead) return {};

    const actionsTriggered: {
      groundPoundShockwave?: THREE.Vector3;
      hvbPunch?: boolean;
      flashbangGrenade?: boolean;
      ricochetShot?: boolean;
    } = {};

    // 1. Dash Internal CD & Sequential Recharge
    if (this.dashInternalCd > 0) {
      this.dashInternalCd -= delta;
    }

    if (this.dashCharges < this.maxDashCharges) {
      this.dashRechargeTimer += delta;
      if (this.dashRechargeTimer >= this.dashRechargeRate) {
        this.dashRechargeTimer = 0;
        this.dashCharges++;
      }
    } else {
      this.dashRechargeTimer = 0;
    }

    // Cooldowns tick
    if (this.slowTimer > 0) this.slowTimer -= delta;
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
      this.flashbangIntensity = Math.max(0, this.flashbangIntensity - delta * 0.35);
    }

    // 2. Camera Rotation (Exact YXZ Euler order, no gimbal roll tilt or camera slide)
    this.yaw -= this.mouseDelta.x * this.sensitivity;
    this.pitch -= this.mouseDelta.y * this.sensitivity;
    this.pitch = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, this.pitch));
    // PERF: reset in place - a fresh object literal was allocated here every frame.
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // Direction Vectors
    // PERF: direct sin/cos into scratch fields - this used to allocate 5 Vector3 per frame
    // (a yaw rotation needs no applyAxisAngle quaternion math).
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const forward = this.tempForward.set(-sinYaw, 0, -cosYaw);
    const right = this.tempRight.set(cosYaw, 0, -sinYaw);

    // WASD Input Vector
    const moveDir = this.tempMoveDir.set(0, 0, 0);
    if (this.moveInput.forward) moveDir.add(forward);
    if (this.moveInput.backward) moveDir.sub(forward);
    if (this.moveInput.right) moveDir.add(right);
    if (this.moveInput.left) moveDir.sub(right);
    moveDir.normalize();

    // 3. Ground Pound Plunge Physics
    if (this.isGroundPounding) {
      this.velocity.y = -45; // Rapid purple streak downward slam
      this.position.y += this.velocity.y * delta;

      // Probe downwards to detect the exact floor surface directly beneath player
      let targetGroundY = 1.8;
      if (sceneObjects && sceneObjects.length > 0) {
        this.tempRayOrigin.copy(this.position);
        this.tempRayOrigin.y += 1.0;
        this.downRaycaster.set(this.tempRayOrigin, this.downDir);
        this.downRaycaster.far = 100.0;
        try {
          // PERF: XZ-filtered candidates instead of the entire static mesh list.
          const candidates = this.collectVerticalRayCandidates(sceneObjects);
          const gHits = candidates.length > 0 ? this.downRaycaster.intersectObjects(candidates, false) : PlayerEngine.EMPTY_HITS;
          if (gHits.length > 0) {
            let highestHitY = -999;
            for (let i = 0; i < gHits.length; i++) {
              const hy = gHits[i].point.y;
              if (hy <= this.position.y + 1.2 && hy > highestHitY) {
                highestHitY = hy;
              }
            }
            if (highestHitY > -900) {
              targetGroundY = highestHitY + 1.8;
            }
          }
        } catch {}
      }

      if (this.position.y <= targetGroundY) {
        this.position.y = targetGroundY;
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
      const pullDir = this.tempPullDir.subVectors(this.grappleTargetPoint, this.position).normalize();
      this.velocity.addScaledVector(pullDir, 60 * delta);
      if (this.position.distanceTo(this.grappleTargetPoint) < 2.0) {
        this.isGrappling = false;
        this.grappleTargetPoint = null;
      }
    }

    // 5. Responsive Physics & Movement (Crisp ground control, no ice-skating)
    if (this.isGrounded && !this.isDashing && !this.isGrappling) {
      if (this.isSliding) {
        // Crouch slide maintains high momentum and lower friction
        if (moveDir.lengthSq() > 0) {
          this.velocity.x += moveDir.x * 20 * delta;
          this.velocity.z += moveDir.z * 20 * delta;
        }
        const slideFriction = Math.pow(0.97, delta * 60);
        this.velocity.x *= slideFriction;
        this.velocity.z *= slideFriction;
      } else {
        // Normal walking/running: instant crisp acceleration & instant ground stopping
        const targetSpeed = this.slowTimer > 0 ? 5.5 : 15;
        if (moveDir.lengthSq() > 0) {
          const targetVelX = moveDir.x * targetSpeed;
          const targetVelZ = moveDir.z * targetSpeed;
          this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVelX, Math.min(1.0, 35 * delta));
          this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVelZ, Math.min(1.0, 35 * delta));
        } else {
          // Sharp ground braking when keys released - eliminates unwanted drift/sliding
          this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, 0, Math.min(1.0, 45 * delta));
          this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, 0, Math.min(1.0, 45 * delta));
          if (Math.abs(this.velocity.x) < 0.05) this.velocity.x = 0;
          if (Math.abs(this.velocity.z) < 0.05) this.velocity.z = 0;
        }
      }
    } else if (!this.isGrounded && !this.isDashing) {
      // Air physics
      if (moveDir.lengthSq() > 0) {
        this.velocity.x += moveDir.x * 35 * delta;
        this.velocity.z += moveDir.z * 35 * delta;
        const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        if (horizSpeed > 45) {
          this.velocity.x = (this.velocity.x / horizSpeed) * 45;
          this.velocity.z = (this.velocity.z / horizSpeed) * 45;
        }
      }
      const airFriction = Math.pow(0.985, delta * 60);
      this.velocity.x *= airFriction;
      this.velocity.z *= airFriction;

      // Gravity
      this.velocity.y -= 32 * delta;
    }

    // Move Player with Movement Sub-Stepping (prevents tunneling through walls at high speeds)
    const totalMove = this.tempTotalMove.copy(this.velocity).multiplyScalar(delta);
    const moveDist = totalMove.length();
    const maxSubStepDist = 0.25; // max 0.25m per collision check sub-step
    const subSteps = Math.max(1, Math.ceil(moveDist / maxSubStepDist));
    const subStepVec = totalMove.divideScalar(subSteps);

    for (let s = 0; s < subSteps; s++) {
      this.position.add(subStepVec);
      this.resolveWallCollisions(sceneObjects);
    }

    // Ceiling & Underside Platform check (blocks jumping onto platforms from below)
    if (sceneObjects && sceneObjects.length > 0 && this.velocity.y > 0) {
      this.upRaycaster.set(this.position, this.upDir);
      this.upRaycaster.far = 2.5;
      try {
        // PERF: XZ-filtered candidates instead of the entire static mesh list.
        const upCandidates = this.collectVerticalRayCandidates(sceneObjects);
        const upHits = upCandidates.length > 0 ? this.upRaycaster.intersectObjects(upCandidates, false) : PlayerEngine.EMPTY_HITS;
        if (upHits.length > 0) {
          const hitDist = upHits[0].distance;
          // Player head height is 1.8m above feet position
          if (hitDist <= 1.85) {
            const ceilingY = upHits[0].point.y - 1.85;
            if (ceilingY < this.position.y) {
              this.position.y = ceilingY;
            }
            this.velocity.y = 0; // Bonk head and stop ascending
          }
        }
      } catch {}
    }

    // Ground & Ramp Platform check
    let groundY = 1.8;
    if (sceneObjects && sceneObjects.length > 0) {
      // Probe downwards from above waist height to catch ramps, elevated floors, and platforms
      this.tempRayOrigin.copy(this.position);
      this.tempRayOrigin.y += 1.0;
      this.downRaycaster.set(this.tempRayOrigin, this.downDir);
      this.downRaycaster.far = 100.0;
      try {
        // PERF: XZ-filtered candidates instead of the entire static mesh list.
        const groundCandidates = this.collectVerticalRayCandidates(sceneObjects);
        const gHits = groundCandidates.length > 0 ? this.downRaycaster.intersectObjects(groundCandidates, false) : PlayerEngine.EMPTY_HITS;
        if (gHits.length > 0) {
          let highestHitY = -999;
          for (let i = 0; i < gHits.length; i++) {
            const hy = gHits[i].point.y;
            if (hy <= this.position.y + 0.5 && hy > highestHitY) {
              highestHitY = hy;
            }
          }
          if (highestHitY > -900) {
            groundY = highestHitY + 1.8;
          }
        }
      } catch {}
    }

    if (this.velocity.y > 0) {
      // While ascending (jumping), player is in mid-air
      this.isGrounded = false;
    } else {
      // Snap to ground if player feet touch or pass below ground level
      if (this.position.y <= groundY + 0.3) {
        this.position.y = groundY;
        this.velocity.y = 0;
        this.isGrounded = true;
        this.jumpCount = 0;
        this.hasWallJumpedInAir = false;
      } else {
        this.isGrounded = false;
        if (this.jumpCount === 0) {
          this.jumpCount = 1; // Walking off edge
        }
      }
    }

    // Hard fail-safe against dropping under the map or active floor
    if (this.position.y < groundY) {
      this.position.y = groundY;
      this.velocity.y = Math.max(0, this.velocity.y);
      this.isGrounded = true;
      this.jumpCount = 0;
    }

    // Solid Wall & Obstacle Collisions (Final Alignment Pass)
    this.resolveWallCollisions(sceneObjects);

    // Slide Height Smooth Adjustment
    const targetCamHeight = this.isSliding ? 1.0 : 1.8;
    this.currentCamHeight = THREE.MathUtils.lerp(this.currentCamHeight, targetCamHeight, Math.min(1.0, 25 * delta));
    this.camera.position.set(this.position.x, this.position.y - (1.8 - this.currentCamHeight), this.position.z);

    // Raycast Wall Check for Wall Kick
    this.checkWalls(sceneObjects);

    return actionsTriggered;
  }

  private resolveWallCollisions(sceneObjects: THREE.Object3D[]) {
    if (!sceneObjects || sceneObjects.length === 0) return;

    const targets = this.collectNearbyWalls(sceneObjects);
    if (targets.length === 0) return;

    const playerRadius = 0.75;

    // PASS 1: Direct AABB Box Penetration & Ejection Check
    // PERF: boxes come from the per-level cache (parallel to `targets`); setFromObject
    // used to walk each wall's subtree here on every invocation.
    for (let i = 0; i < targets.length; i++) {
      this.tempBox.copy(this.nearbyWallBoxesTemp[i]);

      // Check vertical overlap (player height range [pos.y - 1.8, pos.y + 0.2])
      const playerMinY = this.position.y - 1.8;
      const playerMaxY = this.position.y + 0.2;
      if (playerMaxY < this.tempBox.min.y || playerMinY > this.tempBox.max.y) {
        continue;
      }

      // 2D XZ Box expanded by player radius
      const minX = this.tempBox.min.x - playerRadius;
      const maxX = this.tempBox.max.x + playerRadius;
      const minZ = this.tempBox.min.z - playerRadius;
      const maxZ = this.tempBox.max.z + playerRadius;

      if (this.position.x > minX && this.position.x < maxX && this.position.z > minZ && this.position.z < maxZ) {
        // Player is inside extended wall box! Find shortest path to eject
        const pushLeft = this.position.x - minX;
        const pushRight = maxX - this.position.x;
        const pushBack = this.position.z - minZ;
        const pushFront = maxZ - this.position.z;

        const minPush = Math.min(pushLeft, pushRight, pushBack, pushFront);
        if (minPush === pushLeft) {
          this.position.x = minX;
          this.velocity.x = Math.min(0, this.velocity.x);
        } else if (minPush === pushRight) {
          this.position.x = maxX;
          this.velocity.x = Math.max(0, this.velocity.x);
        } else if (minPush === pushBack) {
          this.position.z = minZ;
          this.velocity.z = Math.min(0, this.velocity.z);
        } else {
          this.position.z = maxZ;
          this.velocity.z = Math.max(0, this.velocity.z);
        }
      }
    }

    // PASS 2: Multi-Height & Multi-Angle Raycast Probe
    this.wallRaycaster.far = playerRadius + 0.15;
    // PERF: reused scratch array - a fresh array literal was allocated 2-5x per frame.
    const heights = this.probeHeightsTemp;
    heights[0] = this.position.y - 1.2;
    heights[1] = this.position.y - 0.4;
    heights[2] = this.position.y + 0.4;
    const numAngles = 12;
    const angleStep = (Math.PI * 2) / numAngles;

    for (let h = 0; h < heights.length; h++) {
      this.tempRayOrigin.set(this.position.x, heights[h], this.position.z);
      for (let a = 0; a < numAngles; a++) {
        const angle = a * angleStep;
        this.tempRayDir.set(Math.cos(angle), 0, Math.sin(angle));
        this.wallRaycaster.set(this.tempRayOrigin, this.tempRayDir);

        try {
          const hits = this.wallRaycaster.intersectObjects(targets, false);
          if (hits.length > 0 && hits[0].distance < playerRadius) {
            const hit = hits[0];
            const overlap = playerRadius - hit.distance;
            if (hit.face) {
              this.tempNormal.copy(hit.face.normal);
              this.tempNormal.transformDirection(hit.object.matrixWorld);
            } else {
              this.tempNormal.copy(this.tempRayDir).negate();
            }
            this.tempNormal.y = 0;
            if (this.tempNormal.lengthSq() > 0.001) {
              this.tempNormal.normalize();
              this.position.addScaledVector(this.tempNormal, overlap);
              const velDot = this.velocity.dot(this.tempNormal);
              if (velDot < 0) {
                this.velocity.addScaledVector(this.tempNormal, -velDot);
              }
            } else {
              this.position.addScaledVector(this.tempRayDir, -overlap);
            }
          }
        } catch {
          // Guard against transient scene mutations
        }
      }
    }

    // General arena depth & side safety bounds
    this.position.x = Math.max(-90.0, Math.min(90.0, this.position.x));
    this.position.z = Math.max(-3000.0, Math.min(300.0, this.position.z));
  }

  private checkWalls(sceneObjects: THREE.Object3D[]) {
    this.isNearWall = false;
    if (!sceneObjects || sceneObjects.length === 0) return;

    const targets = this.collectNearbyWalls(sceneObjects);
    if (targets.length === 0) return;

    this.wallCheckRaycaster.camera = this.camera;
    this.wallCheckRaycaster.far = 1.6;

    for (let i = 0; i < PlayerEngine.wallCheckDirs.length; i++) {
      const dir = PlayerEngine.wallCheckDirs[i];
      this.wallCheckRaycaster.set(this.position, dir);
      try {
        const intersects = this.wallCheckRaycaster.intersectObjects(targets, false);
        if (intersects && intersects.length > 0 && intersects[0] && intersects[0].distance < 1.5) {
          this.isNearWall = true;
          const face = intersects[0].face;
          if (face) this.wallNormal.copy(face.normal);
          else this.wallNormal.copy(dir).negate();
          break;
        }
      } catch {
        // Guard against transient scene mutations during raycast
      }
    }
  }

  // --- ACTIONS ---

  public triggerDash() {
    if (this.dashCharges <= 0 || this.dashInternalCd > 0 || this.isDead) return;

    this.dashCharges--;
    this.dashInternalCd = this.maxDashInternalCd;

    AudioEngine.playDash();

    // Dash in move direction or forward
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const forward = this.tempForward.set(-sinYaw, 0, -cosYaw);
    const right = this.tempRight.set(cosYaw, 0, -sinYaw);

    const dashDir = this.tempDashDir.set(0, 0, 0);
    if (this.moveInput.forward) dashDir.add(forward);
    if (this.moveInput.backward) dashDir.sub(forward);
    if (this.moveInput.right) dashDir.add(right);
    if (this.moveInput.left) dashDir.sub(right);
    if (dashDir.lengthSq() === 0) dashDir.copy(forward);
    dashDir.normalize();

    this.velocity.copy(dashDir.multiplyScalar(55));
    if (!this.isGrounded) {
      this.velocity.y = 3; // Air micro-hover surge
    }
  }

  public triggerJump() {
    if (this.isDead) return;

    if (this.isGrounded) {
      // 1st Jump (from ground) - higher jump velocity
      this.velocity.y = 19;
      this.isGrounded = false;
      this.jumpCount = 1;
    } else if (this.isNearWall && !this.hasWallJumpedInAir) {
      // Wall Kick! Height is 2x lower than normal ground jump (9.5 vs 19), with strong horizontal pushback away from wall
      this.velocity.y = 9.5;
      this.velocity.x = this.wallNormal.x * 30;
      this.velocity.z = this.wallNormal.z * 30;
      this.hasWallJumpedInAir = true; // Maximum 1 wall jump refresh per air sequence
      this.jumpCount = 1; // Reset jump count so player gets 1 air jump after wall kick
      AudioEngine.playDash();
    } else if (this.jumpCount < 2) {
      // 2nd Jump (Double Jump in air) - higher double jump velocity
      this.velocity.y = 19;
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

  public triggerSecondarySkill(): { ricochetShot?: boolean; flashbang?: boolean; berserk?: boolean } {
    if (this.isDead) return {};

    if (this.currentWeapon === 'peacemaker' && this.coinCd <= 0) {
      this.coinCd = 4.0;
      return { ricochetShot: true };
    } else if (this.currentWeapon === 'trembler' && this.flashbangCd <= 0) {
      this.flashbangCd = 8.0;
      AudioEngine.playCoinToss();
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

  public applySlow(duration: number = 3.5) {
    this.slowTimer = Math.max(this.slowTimer, duration);
  }
}
