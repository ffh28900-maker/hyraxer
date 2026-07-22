import * as THREE from 'three';
import { ModelBuilder } from './3d/ModelBuilder';
import { EnemyType } from '../types';
import { AudioEngine } from '../audio/AudioEngine';

export interface NanoFluidCloud {
  position: THREE.Vector3;
  mesh: THREE.Group;
  duration: number;
  maxDuration: number;
  healAmount: number;
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
}

export interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  isEnemy: boolean;
  life: number;
  isDynamite?: boolean;
}

export class EnemyEngine {
  public enemies: EnemyInstance[] = [];
  public projectiles: Projectile[] = [];
  public nanoClouds: NanoFluidCloud[] = [];
  public onDamageNumber?: (pos: THREE.Vector3, amount: number, isCrit: boolean) => void;
  public onHitSplash?: (pos: THREE.Vector3, isCrit?: boolean) => void;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawnEnemy(type: EnemyType, position: THREE.Vector3): EnemyInstance {
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
    };

    this.enemies.push(enemy);
    return enemy;
  }

  public update(
    delta: number,
    playerPos: THREE.Vector3,
    onPlayerDamage: (amount: number) => void,
    onStylePoints: (points: number, name: string) => void,
    onPlayerHeal?: (amount: number) => void
  ) {
    // 1. Update Enemies Physics, Ricochet & Stun Recovery
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;

      // --- RICOCHET KNOCKBACK PHYSICS WITH GRAVITY & OBSTACLE BOUNCING ---
      if (enemy.knockbackVel && enemy.knockbackVel.lengthSq() > 0.05) {
        const speed = enemy.knockbackVel.length();

        // Downward gravity during flight
        enemy.knockbackVel.y -= 22.0 * delta;

        // Air drag
        enemy.knockbackVel.x *= Math.pow(0.86, delta);
        enemy.knockbackVel.z *= Math.pow(0.86, delta);

        const step = enemy.knockbackVel.clone().multiplyScalar(delta);
        enemy.position.add(step);

        // Tumbling rotation for airborne/knocked-back mobs
        enemy.mesh.rotation.x += 10.0 * delta;
        enemy.mesh.rotation.z += 8.0 * delta;

        let bounced = false;

        // Raycast against inner level obstacles (walls, pillars, train carriages, spires)
        if (speed > 1.0) {
          const moveDir = enemy.knockbackVel.clone().normalize();
          const raycaster = new THREE.Raycaster(enemy.position, moveDir, 0, speed * delta + 0.8);
          const obstacles = this.scene.children.filter(
            (obj) => obj.visible && obj.name === 'wall' && obj !== enemy.mesh
          );

          try {
            const hits = raycaster.intersectObjects(obstacles, true);
            if (hits.length > 0 && hits[0].face) {
              const hit = hits[0];
              const normal = hit.face.normal.clone();
              normal.transformDirection(hit.object.matrixWorld);

              const dot = enemy.knockbackVel.dot(normal);
              if (dot < 0) {
                // Reflect velocity: v' = v - 1.9 * (v . n) * n
                enemy.knockbackVel.sub(normal.clone().multiplyScalar(1.9 * dot));
                enemy.knockbackVel.multiplyScalar(0.82); // Dampen bounce energy
                enemy.position.copy(hit.point).addScaledVector(normal, 0.85); // Push out from obstacle
                bounced = true;
              }
            }
          } catch {
            // Guard against scene object mutations
          }
        }

        // Bounding Arena Enclosure (Outer safety net)
        const halfWidth = 10.2;
        const backZ = -120.0;
        const frontZ = 11.5;

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

        // Floor & Ceiling Contact
        if (enemy.position.y <= 0.8) {
          enemy.position.y = 0.8;
          if (Math.abs(enemy.knockbackVel.y) > 2.2) {
            enemy.knockbackVel.y = -enemy.knockbackVel.y * 0.45; // Floor bounce
            bounced = true;
          } else {
            enemy.knockbackVel.y = 0;
            enemy.knockbackVel.x *= Math.pow(0.01, delta); // Heavy floor friction
            enemy.knockbackVel.z *= Math.pow(0.01, delta);
          }
        } else if (enemy.position.y > 14.0 && enemy.knockbackVel.y > 0) {
          enemy.position.y = 14.0;
          enemy.knockbackVel.y = -enemy.knockbackVel.y * 0.85;
          bounced = true;
        }

        if (bounced) {
          enemy.ricochetBounces = (enemy.ricochetBounces || 0) + 1;
          const count = enemy.ricochetBounces;
          AudioEngine.playHvbPunch(0.5);
          AudioEngine.playExplosion();

          let styleTag = `⚡ RICOCHET x${count}`;
          if (count >= 8) styleTag = `🌀 ULTRA PINBALL x${count}!!`;
          else if (count >= 4) styleTag = `🔥 RICOCHET COMBO x${count}!`;

          onStylePoints(150 + count * 50, styleTag);
          if (this.onDamageNumber) this.onDamageNumber(enemy.position, 1, false);
          if (this.onHitSplash) this.onHitSplash(enemy.position, true);

          // Shockwave impact on bounce pushing nearby mobs
          for (const other of this.enemies) {
            if (other !== enemy && !other.isDead) {
              const d = other.position.distanceTo(enemy.position);
              if (d < 3.5) {
                const push = other.position.clone().sub(enemy.position).normalize();
                push.y = Math.max(0.3, push.y);
                other.knockbackVel = push.multiplyScalar(Math.min(enemy.knockbackVel.length() * 0.8, 15));
                other.isStunned = true;
                other.stunTimer = 3.0; // 3 seconds recovery
                other.hp -= 1;
                if (this.onDamageNumber) this.onDamageNumber(other.position, 1, false);
                if (this.onHitSplash) this.onHitSplash(other.position, false);
              }
            }
          }
        }

        // Collide with other mobs while flying/ricocheting
        if (enemy.knockbackVel.length() > 0.5) {
          for (const other of this.enemies) {
            if (other !== enemy && !other.isDead && other.position.distanceTo(enemy.position) < 2.0) {
              other.knockbackVel = enemy.knockbackVel.clone().multiplyScalar(0.75);
              other.isStunned = true;
              other.stunTimer = 3.0; // 3 seconds recovery
              other.hp -= 1;
              if (this.onDamageNumber) this.onDamageNumber(other.position, 1, false);
              if (this.onHitSplash) this.onHitSplash(other.position, false);
              onStylePoints(150, '💥 MOB COLLISION');
            }
          }
        }

        // Ensure 3-second stun state is maintained when knocked back
        if (!enemy.isStunned || enemy.stunTimer < 0.5) {
          enemy.isStunned = true;
          enemy.stunTimer = 3.0;
        }
      }

      // --- STUN & 3-SECOND STAND UP RECOVERY ANIMATION ---
      if (enemy.isStunned) {
        enemy.stunTimer -= delta;

        const isMovingFast = enemy.knockbackVel && enemy.knockbackVel.lengthSq() > 0.1;
        const isAirborne = enemy.position.y > 0.85;

        if (isMovingFast || isAirborne) {
          // Flying / falling - tumbling handles rotation
        } else {
          // Landed on floor! Clamp height
          enemy.position.y = 0.8;
          if (enemy.knockbackVel) enemy.knockbackVel.set(0, 0, 0);

          if (enemy.stunTimer > 0.6) {
            // Lying flat on ground during stun
            enemy.mesh.rotation.x = Math.PI * 0.45;
          } else if (enemy.stunTimer > 0) {
            // Smoothly stand up during the final 0.6 seconds of the 3-second recovery!
            const standProgress = 1.0 - (enemy.stunTimer / 0.6); // 0 -> 1
            enemy.mesh.rotation.x = THREE.MathUtils.lerp(Math.PI * 0.45, 0, standProgress);
            enemy.mesh.rotation.z = THREE.MathUtils.lerp(enemy.mesh.rotation.z, 0, standProgress);
          }
        }

        if (enemy.stunTimer <= 0) {
          enemy.isStunned = false;
          enemy.knockbackVel = undefined;
          enemy.mesh.rotation.set(0, enemy.mesh.rotation.y, 0);
          enemy.position.y = 0.8;
        } else {
          continue; // Stunned enemies cannot move or attack
        }
      }

      const distToPlayer = enemy.position.distanceTo(playerPos);
      enemy.mesh.lookAt(playerPos.x, enemy.position.y, playerPos.z);

      // Attack timers
      enemy.attackCooldown -= delta;

      // Enemy specific AI behavior (VERY LOW DAMAGE TO PLAYER!)
      if (enemy.type === 'robo_doman' || enemy.type === 'imp_doman') {
        // Fast zigzag sprint
        if (distToPlayer > 1.8) {
          const dir = new THREE.Vector3().subVectors(playerPos, enemy.position).normalize();
          dir.x += Math.sin(Date.now() * 0.005) * 0.5;
          enemy.position.addScaledVector(dir.normalize(), 8.0 * delta);
        } else if (enemy.attackCooldown <= 0) {
          enemy.attackCooldown = 1.2;
          onPlayerDamage(1); // Reduced from 15 to 1!
        }
      } else if (enemy.type === 'doman_sniper') {
        // Sniper laser lock
        if (distToPlayer < 40) {
          enemy.telegraphTimer += delta;
          if (enemy.telegraphTimer >= 1.5 && enemy.attackCooldown <= 0) {
            enemy.telegraphTimer = 0;
            enemy.attackCooldown = 3.0;
            onPlayerDamage(2); // Reduced from 35 to 2!
            AudioEngine.playPistolShot();
          }
        }
      } else if (enemy.type === 'doman_dynamiter') {
        // Suicide Runner
        if (distToPlayer > 1.5) {
          const dir = new THREE.Vector3().subVectors(playerPos, enemy.position).normalize();
          enemy.position.addScaledVector(dir, 12.0 * delta);
        } else {
          // Instant explosion on contact!
          this.killEnemy(enemy, true, onStylePoints);
          onPlayerDamage(3); // Reduced from 50 to 3!
          AudioEngine.playExplosion();
        }
      } else if (enemy.type === 'drone' || enemy.type === 'winged_doman') {
        // Flying shoot bullet bursts
        enemy.position.y = THREE.MathUtils.lerp(enemy.position.y, 3.5 + Math.sin(Date.now() * 0.003), 0.05);
        if (distToPlayer > 12) {
          const dir = new THREE.Vector3().subVectors(playerPos, enemy.position).normalize();
          enemy.position.addScaledVector(dir, 5.0 * delta);
        } else if (enemy.attackCooldown <= 0) {
          enemy.attackCooldown = 2.0;
          this.spawnEnemyProjectile(enemy.position.clone(), playerPos, 10, 1); // Projectile damage: 1
        }
      } else if (enemy.isBoss) {
        // Boss Attack Loop (Low Damage)
        if (enemy.attackCooldown <= 0) {
          enemy.attackCooldown = 2.5;

          if (enemy.type === 'boss_goliath') {
            this.spawnEnemyProjectile(enemy.position.clone().add(new THREE.Vector3(-1.8, 3.2, 0)), playerPos, 20, 2);
          } else if (enemy.type === 'boss_miner') {
            this.spawnDynamiteBundle(enemy.position.clone().add(new THREE.Vector3(0, 2, 0)), playerPos);
          } else if (enemy.type === 'boss_overlord') {
            onPlayerDamage(2);
            AudioEngine.playExplosion();
          } else if (enemy.type === 'boss_ultradoman') {
            onPlayerDamage(2);
            AudioEngine.playHvbPunch();
          }
        }
      }
    }

    // 1b. Pairwise Enemy-Enemy Separation (Prevents mobs from stacking/sticking inside each other)
    for (let i = 0; i < this.enemies.length; i++) {
      const e1 = this.enemies[i];
      if (e1.isDead) continue;

      for (let j = i + 1; j < this.enemies.length; j++) {
        const e2 = this.enemies[j];
        if (e2.isDead) continue;

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
    for (let p = this.projectiles.length - 1; p >= 0; p--) {
      const proj = this.projectiles[p];
      proj.mesh.position.addScaledVector(proj.velocity, delta);
      proj.life -= delta;

      if (proj.isEnemy) {
        if (proj.mesh.position.distanceTo(playerPos) < 1.5) {
          onPlayerDamage(proj.damage);
          this.scene.remove(proj.mesh);
          this.projectiles.splice(p, 1);
          continue;
        }
      }

      if (proj.life <= 0) {
        this.scene.remove(proj.mesh);
        this.projectiles.splice(p, 1);
      }
    }

    // 3. Update White Nano-fluid Healing Fountains
    for (let c = this.nanoClouds.length - 1; c >= 0; c--) {
      const cloud = this.nanoClouds[c];
      cloud.duration -= delta;

      // Rotate fountain beam & jet
      cloud.mesh.rotation.y += delta * 2.5;

      // Animate rising ring
      const ring = cloud.mesh.getObjectByName('fountain_ring');
      if (ring) {
        const progress = 1.0 - cloud.duration / cloud.maxDuration;
        ring.position.y = 0.5 + (progress * 6.0) % 5.5;
        ring.scale.setScalar(1.0 + (ring.position.y / 5.5) * 0.4);
      }

      // Pulse visibility near expiration
      if (cloud.duration < 1.5) {
        cloud.mesh.visible = Math.floor(Date.now() / 100) % 2 === 0;
      } else {
        cloud.mesh.visible = true;
      }

      // Check player heal pickup on floor plane
      const distXZ = new THREE.Vector2(playerPos.x - cloud.position.x, playerPos.z - cloud.position.z).length();
      if (distXZ < 2.5) {
        // Heal player!
        if (onPlayerHeal) onPlayerHeal(cloud.healAmount);
        this.scene.remove(cloud.mesh);
        this.nanoClouds.splice(c, 1);
        onStylePoints(200, '⛲ WHITE FOUNTAIN HEAL (+40 HP)');
        continue;
      }

      if (cloud.duration <= 0) {
        this.scene.remove(cloud.mesh);
        this.nanoClouds.splice(c, 1);
      }
    }
  }

  public spawnEnemyProjectile(from: THREE.Vector3, to: THREE.Vector3, speed: number, damage: number) {
    const geo = new THREE.SphereGeometry(0.25, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0044 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    this.scene.add(mesh);

    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    this.projectiles.push({
      mesh,
      velocity: dir.multiplyScalar(speed),
      damage,
      isEnemy: true,
      life: 4.0,
    });
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
    this.scene.remove(enemy.mesh);

    if (!isSuicide) {
      // Spawn White Nano-Fluid Fountain/Cloud
      this.spawnNanoCloud(enemy.position.clone());
      if (onStylePoints) onStylePoints(250, enemy.isBoss ? 'BOSS ANNIHILATED' : 'KILL');
    }
  }

  public spawnNanoCloud(pos: THREE.Vector3) {
    const group = new THREE.Group();

    // 1. Glowing ground pool
    const poolGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.08, 32);
    const poolMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.90,
    });
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.y = 0.04;
    group.add(pool);

    // 2. Main Vertical Fountain Beam
    const beamGeo = new THREE.CylinderGeometry(0.8, 1.4, 7.0, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xeeffff,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 3.5;
    group.add(beam);

    // 3. Inner Pulsating Core Jet
    const jetGeo = new THREE.ConeGeometry(1.2, 5.0, 16);
    const jetMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
    });
    const jet = new THREE.Mesh(jetGeo, jetMat);
    jet.position.y = 2.5;
    group.add(jet);

    // 4. Rising Fountain Energy Ring
    const ringGeo = new THREE.TorusGeometry(1.5, 0.12, 12, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'fountain_ring';
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.0;
    group.add(ring);

    // 5. Sky Beacon Beam
    const beaconGeo = new THREE.CylinderGeometry(0.12, 0.12, 40.0, 8);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.40,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.y = 20.0;
    group.add(beacon);

    group.position.copy(pos);
    group.position.y = 0; // Ground aligned
    this.scene.add(group);

    this.nanoClouds.push({
      position: group.position,
      mesh: group,
      duration: 5.0, // 5 seconds window to enter fountain
      maxDuration: 5.0,
      healAmount: 40,
    });
  }

  public applyHvbToEnemies(
    playerPos: THREE.Vector3,
    forwardDir: THREE.Vector3,
    chargeRatio: number,
    onStylePoints: (pts: number, name: string) => void
  ) {
    const range = 6.0 + chargeRatio * 6.0;
    const damage = 1 + chargeRatio * 3; // Minimal damage so mobs ricochet smoothly!
    const launchSpeed = 8 + chargeRatio * 32; // Reduced 100x for controlled, readable speed
    const stunTime = 3.0 + chargeRatio * 3.0;

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
        enemy.stunTimer = 1.0;
        if (this.onDamageNumber) this.onDamageNumber(enemy.position, 20, true);
        if (this.onHitSplash) this.onHitSplash(enemy.position, true);
        onStylePoints(200, 'GROUND POUND SPLAT');

        if (enemy.hp <= 0) {
          this.killEnemy(enemy, false, onStylePoints);
        }
      }
    }
  }
}
