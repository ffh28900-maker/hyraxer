import * as THREE from 'three';
import { EnemyType } from '../../types';
import { TextureGenerator } from './TextureGenerator';
import { ModelBuilder } from './ModelBuilder';

export interface RoomBarrier {
  roomId: number;
  roomXCenter: number;
  roomZCenter: number;
  roomWidth: number;
  roomDepth: number;
  barrierMesh: THREE.Mesh;
  lockLightMesh: THREE.Mesh;
  lockGroup: THREE.Group;
  unlocked: boolean;
  rearBarrierMesh?: THREE.Mesh;
  rearLockGroup?: THREE.Group;
  rearLockLightMesh?: THREE.Mesh;
  rearClosed?: boolean;
  entryX?: number;
  entryZ?: number;
}

export interface RoomInfo {
  id: number;
  xCenter: number;
  zCenter: number;
  yCenter: number;
  width: number;
  depth: number;
  isBossRoom: boolean;
  objects: THREE.Object3D[];
  loaded: boolean;
  cleared: boolean;
}

export interface LevelData {
  scene: THREE.Scene;
  playerSpawn: THREE.Vector3;
  enemySpawns: Array<{ position: THREE.Vector3; type: EnemyType; roomId: number }>;
  finishZone: { min: THREE.Vector3; max: THREE.Vector3 };
  biomeName: string;
  isBossLevel: boolean;
  isSecretLevel: boolean;
  hasFlashlight: boolean;
  roomBarriers?: RoomBarrier[];
  rooms?: RoomInfo[];
  /**
   * PERF: the scene's top-level children at generation time - i.e. everything static.
   * GameEngine sets matrixWorldAutoUpdate=false on these after computing world matrices
   * once, so renderer.render stops re-walking ~10k static nodes every frame. Anything
   * added later (camera, enemies, FX, projectiles) is not in this list and stays dynamic.
   */
  staticRoots: THREE.Object3D[];
}

export class LevelGenerator {
  /**
   * PERF: freeze local matrices of the fully built static scene and snapshot its roots.
   *
   * Individual builders already call markStatic on meshes, but ~70 call sites invoked it
   * per child Mesh inside a traverse, leaving the wrapper Groups with matrixAutoUpdate
   * still true - and one live Group forces a matrixWorld recompose of its entire subtree
   * every frame. Freezing everything here (idempotently) closes that gap in one place.
   */
  private static freezeStaticScene(scene: THREE.Scene): THREE.Object3D[] {
    const roots = [...scene.children];
    for (const root of roots) {
      root.traverse((child) => {
        child.updateMatrix();
        child.matrixAutoUpdate = false;
      });
    }
    return roots;
  }

  public static generateLevel(levelNumber: number): LevelData {
    if (levelNumber === 99) {
      return LevelGenerator.generateSecretExhibitionLevel();
    }
    return LevelGenerator.generateProceduralRoomCorridorLevel(levelNumber);
  }

  private static generateSecretExhibitionLevel(): LevelData {
    const scene = new THREE.Scene();
    const enemySpawns: Array<{ position: THREE.Vector3; type: EnemyType; roomId: number }> = [];
    const playerSpawn = new THREE.Vector3(0, 1.8, -10);

    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.003);
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.6);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.4);
    dirLight1.position.set(20, 35, 20);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xf43f5e, 1.2);
    dirLight2.position.set(-20, 35, -20);
    scene.add(dirLight2);

    const floorTexture = TextureGenerator.getWhiteVoidTexture();
    const wallTexture = TextureGenerator.getObsidianRuneTexture();

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.2,
      metalness: 0.5,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTexture,
      roughness: 0.4,
      metalness: 0.6,
    });
    const pedestalMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:835158937be6', () => new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.2,
      metalness: 0.8,
    })) as THREE.MeshStandardMaterial);
    const glowingRimMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:96f35feb2f45', () => new THREE.MeshBasicMaterial({ color: 0x38bdf8 })) as THREE.MeshBasicMaterial);

    const roomWidth = 50;
    const roomLength = 140;
    const roomHeight = 22;

    const groundGeo = new THREE.PlaneGeometry(roomWidth, roomLength);
    const ground = new THREE.Mesh(groundGeo, floorMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 45);
    ground.name = 'ground';
    scene.add(ground);

    const ceil = new THREE.Mesh(groundGeo, wallMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, roomHeight, 45);
    scene.add(ceil);

    const wallBackGeo = new THREE.BoxGeometry(roomWidth, roomHeight, 2);
    const wallBack = new THREE.Mesh(wallBackGeo, wallMat);
    wallBack.position.set(0, roomHeight / 2, -25);
    wallBack.name = 'wall';
    scene.add(wallBack);

    const wallFront = new THREE.Mesh(wallBackGeo, wallMat);
    wallFront.position.set(0, roomHeight / 2, 115);
    wallFront.name = 'wall';
    scene.add(wallFront);

    const wallSideGeo = new THREE.BoxGeometry(2, roomHeight, roomLength);
    const wallLeft = new THREE.Mesh(wallSideGeo, wallMat);
    wallLeft.position.set(-roomWidth / 2, roomHeight / 2, 45);
    wallLeft.name = 'wall';
    scene.add(wallLeft);

    const wallRight = new THREE.Mesh(wallSideGeo, wallMat);
    wallRight.position.set(roomWidth / 2, roomHeight / 2, 45);
    wallRight.name = 'wall';
    scene.add(wallRight);

    // List of 12 Regular Mobs
    const regularMobs: EnemyType[] = [
      'robo_doman',
      'doman_sniper',
      'drone',
      'centipede',
      'worm',
      'spider_spitter',
      'doman_dynamiter',
      'doman_miner',
      'doman_archer',
      'imp_doman',
      'winged_doman',
      'skeleton_doman',
    ];

    // List of 5 Bosses
    const bosses: EnemyType[] = [
      'boss_goliath',
      'boss_worm',
      'boss_miner',
      'boss_overlord',
      'boss_ultradoman',
    ];

    // Regular Mobs on Pedestals along sides (Z: 0 to 65)
    for (let i = 0; i < regularMobs.length; i++) {
      const mobType = regularMobs[i];
      const side = i % 2 === 0 ? -15 : 15;
      const zPos = Math.floor(i / 2) * 11 + 2;

      const pedGeo = ModelBuilder.getGeo('lg:CylinderGeometry:951589b5adae', () => new THREE.CylinderGeometry(2.5, 2.8, 0.6, 16));
      const ped = new THREE.Mesh(pedGeo, pedestalMat);
      ped.position.set(side, 0.3, zPos);
      scene.add(ped);

      const rimGeo = ModelBuilder.getGeo('lg:TorusGeometry:6e863daad480', () => new THREE.TorusGeometry(2.5, 0.08, 8, 24));
      const rim = new THREE.Mesh(rimGeo, glowingRimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(side, 0.61, zPos);
      scene.add(rim);

      const spotLight = new THREE.PointLight(0x38bdf8, 2.0, 15);
      spotLight.position.set(side, 6.0, zPos);
      scene.add(spotLight);

      enemySpawns.push({
        position: new THREE.Vector3(side, 0.6, zPos),
        type: mobType,
        roomId: 0,
      });
    }

    // Bosses on Grand Pedestals (Z: 70 to 110)
    for (let b = 0; b < bosses.length; b++) {
      const bossType = bosses[b];
      const zPos = 72 + b * 12;
      const xPos = b % 2 === 0 ? -11 : 11;

      const pedGeo = ModelBuilder.getGeo('lg:CylinderGeometry:66cd36f735fb', () => new THREE.CylinderGeometry(4.5, 5.0, 1.0, 24));
      const ped = new THREE.Mesh(pedGeo, pedestalMat);
      ped.position.set(xPos, 0.5, zPos);
      scene.add(ped);

      const rimGeo = ModelBuilder.getGeo('lg:TorusGeometry:6abfa409b6be', () => new THREE.TorusGeometry(4.5, 0.12, 8, 32));
      const rimMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:af7c1c8b4672', () => new THREE.MeshBasicMaterial({ color: 0xef4444 })) as THREE.MeshBasicMaterial);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(xPos, 1.01, zPos);
      scene.add(rim);

      const spotLight = new THREE.PointLight(0xf43f5e, 3.5, 25);
      spotLight.position.set(xPos, 10.0, zPos);
      scene.add(spotLight);

      enemySpawns.push({
        position: new THREE.Vector3(xPos, 1.0, zPos),
        type: bossType,
        roomId: 0,
      });
    }

    const roomInfo: RoomInfo = {
      id: 0,
      xCenter: 0,
      zCenter: 45,
      yCenter: 0,
      width: roomWidth,
      depth: roomLength,
      isBossRoom: true,
      objects: [],
      loaded: false,
      cleared: false,
    };

    return {
      scene,
      playerSpawn,
      enemySpawns,
      finishZone: { min: new THREE.Vector3(-10, 0, 108), max: new THREE.Vector3(10, 5, 114) },
      biomeName: 'СЕКРЕТНАЯ ВЫСТАВОЧНАЯ КОМНАТА МОБОВ И БОССОВ',
      isBossLevel: true,
      isSecretLevel: true,
      hasFlashlight: false,
      rooms: [roomInfo],
      staticRoots: LevelGenerator.freezeStaticScene(scene),
    };
  }

  private static generateProceduralRoomCorridorLevel(levelNumber: number): LevelData {
    const scene = new THREE.Scene();
    const enemySpawns: Array<{ position: THREE.Vector3; type: EnemyType; roomId: number }> = [];
    const roomBarriers: RoomBarrier[] = [];
    const playerSpawn = new THREE.Vector3(0, 1.8, 2);

    // Deterministic PRNG based on level number
    let seed = levelNumber * 7777 + 12345;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    // Number of rooms per level
    const totalRooms = 6 + Math.floor((levelNumber - 1) / 4) * 2;
    const isBossLevel = levelNumber % 4 === 0 || levelNumber === 17;
    const isSecretLevel = levelNumber === 17;
    const hasFlashlight = levelNumber >= 10 && levelNumber <= 13;

    // Biome Index (0: Lab, 1: Subway, 2: Mine, 3: Citadel, 4: White Void)
    let biomeIndex = 0;
    let biomeName = 'Ruined Cyber City';
    let fogColor = 0x1a0a03;
    let lightColor = 0xff5500;
    // Every biome branch below assigns these - no need to pre-generate city textures
    // that levels 1-17 never use.
    let floorTexture: THREE.CanvasTexture;
    let wallTexture: THREE.CanvasTexture;

    const isLabLevel = levelNumber <= 4;

    if (levelNumber >= 1 && levelNumber <= 4) {
      biomeIndex = 0;
      biomeName = `Abandoned Biohazard Laboratory (Floor ${levelNumber})`;
      fogColor = 0x020d12;
      lightColor = 0x22c55e;
      floorTexture = TextureGenerator.getAbandonedLabFloorTexture();
      wallTexture = TextureGenerator.getAbandonedLabWallTexture();
    } else if (levelNumber >= 5 && levelNumber <= 9) {
      biomeIndex = 1;
      biomeName = `Subway Metro Catacombs (Floor ${levelNumber})`;
      fogColor = 0x030c14;
      lightColor = 0x00aaff;
      floorTexture = TextureGenerator.getSubwayFloorTexture();
      wallTexture = TextureGenerator.getSubwayTileTexture();
    } else if (levelNumber >= 10 && levelNumber <= 13) {
      biomeIndex = 2;
      biomeName = `Abyssal Mine Caverns (Floor ${levelNumber})`;
      fogColor = 0x020202;
      lightColor = 0xffaa00;
      floorTexture = TextureGenerator.getMineRockTexture();
      wallTexture = TextureGenerator.getMineRockTexture();
    } else if (levelNumber >= 14 && levelNumber <= 16) {
      biomeIndex = 3;
      biomeName = `Hellish Citadel (Floor ${levelNumber})`;
      fogColor = 0x180202;
      lightColor = 0xff0022;
      floorTexture = TextureGenerator.getObsidianRuneTexture();
      wallTexture = TextureGenerator.getObsidianRuneTexture();
    } else {
      biomeIndex = 4;
      biomeName = `White Void Mind Facility (Floor ${levelNumber})`;
      fogColor = 0x11111d;
      lightColor = 0x00ffff;
      floorTexture = TextureGenerator.getWhiteVoidTexture();
      wallTexture = TextureGenerator.getWhiteVoidTexture();
    }

    scene.fog = new THREE.FogExp2(fogColor, isSecretLevel ? 0.003 : 0.012);

    const ambientLight = new THREE.AmbientLight(
      isSecretLevel ? 0xffffff : 0x1e293b,
      isSecretLevel ? 1.2 : 0.8
    );
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(lightColor, isSecretLevel ? 1.5 : 1.1);
    dirLight.position.set(15, 30, 15);
    scene.add(dirLight);

    const wallHeight = 12;

    const ceilingTexture = isLabLevel
      ? TextureGenerator.getAbandonedLabCeilingTexture()
      : wallTexture;

    const isSubwayLevel = levelNumber >= 5 && levelNumber <= 9;

    // Materials
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTexture,
      bumpMap: isSubwayLevel
        ? TextureGenerator.getSubwayFloorBumpTexture()
        : (isLabLevel ? TextureGenerator.getAbandonedLabFloorBumpTexture() : undefined),
      bumpScale: isSubwayLevel ? 0.1 : (isLabLevel ? 0.1 : 0),
      roughness: isSubwayLevel ? 0.4 : (isLabLevel ? 0.4 : 0.5),
      metalness: isSubwayLevel ? 0.25 : (isLabLevel ? 0.35 : 0.3),
    });
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTexture,
      bumpMap: isSubwayLevel
        ? TextureGenerator.getSubwayTileBumpTexture()
        : (isLabLevel ? TextureGenerator.getAbandonedLabWallBumpTexture() : undefined),
      bumpScale: isSubwayLevel ? 0.12 : (isLabLevel ? 0.14 : 0),
      roughness: isSubwayLevel ? 0.35 : (isLabLevel ? 0.6 : 0.7),
      metalness: isSubwayLevel ? 0.2 : (isLabLevel ? 0.3 : 0.2),
    });
    const ceilingMat = new THREE.MeshStandardMaterial({
      map: ceilingTexture,
      roughness: 0.7,
      metalness: 0.4,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x022c22,
      emissive: lightColor,
      emissiveIntensity: 0.5,
      metalness: 0.8,
    });
    const coverMat = isSubwayLevel
      ? new THREE.MeshStandardMaterial({
          map: TextureGenerator.getSubwayTileTexture(),
          bumpMap: TextureGenerator.getSubwayTileBumpTexture(),
          bumpScale: 0.1,
          roughness: 0.4,
          metalness: 0.3,
        })
      : (ModelBuilder.getMaterial('lg:MeshStandardMaterial:410b5087efb4', () => new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.8,
          metalness: 0.5,
        })) as THREE.MeshStandardMaterial);

    /**
     * PERF: freeze a static object's transform so THREE stops recomposing its matrix.
     *
     * This previously froze only the object it was handed. Most call sites pass a Group
     * (workstations, cryo tanks, ceiling fixtures - dozens of child meshes each), so every
     * child kept matrixAutoUpdate on and had its local matrix recomposed from
     * position/quaternion/scale on every frame forever, despite never moving. Recursing over
     * the subtree is what actually makes these props static.
     *
     * Each node's local matrix is composed once here, and matrixWorldNeedsUpdate is left set
     * (updateMatrix does that), so the renderer computes correct world matrices on the first
     * frame. That keeps this safe regardless of whether markStatic runs before or after the
     * object is parented - call sites do both.
     */
    const markStatic = (mesh: THREE.Object3D) => {
      mesh.traverse((child) => {
        child.updateMatrix();
        child.matrixAutoUpdate = false;
      });
    };

    // Room Layout Definition
    interface RoomDef {
      id: number;
      xCenter: number;
      zCenter: number;
      yCenter: number; // Base floor elevation
      width: number;
      depth: number;
      isBossRoom: boolean;
      corridorWidth: number;
      zBendRatio: number;
      corridorTheme: number;
      enemies: EnemyType[];
    }

    const rooms: RoomDef[] = [];

    // Room 0: Spawn Room
    rooms.push({
      id: 1,
      xCenter: 0,
      zCenter: 0,
      yCenter: 0,
      width: 36,
      depth: 36,
      isBossRoom: false,
      corridorWidth: 8.5,
      zBendRatio: 0.5,
      corridorTheme: Math.floor(rng() * 8),
      enemies: [],
    });

    const getEnemyPool = (lvl: number): EnemyType[] => {
      if (lvl <= 4) return ['robo_doman', 'doman_sniper', 'drone'];
      if (lvl <= 8) return ['centipede', 'worm', 'spider_spitter'];
      if (lvl <= 12) return ['doman_miner', 'doman_dynamiter', 'doman_archer'];
      return ['imp_doman', 'winged_doman', 'skeleton_doman'];
    };

    const enemyPool = getEnemyPool(levelNumber);

    // Generate remaining rooms with procedural elevation differences!
    for (let r = 1; r < totalRooms; r++) {
      const isLastRoom = r === totalRooms - 1;
      const isBossRoom = isLastRoom && isBossLevel;
      const prevRoom = rooms[r - 1];

      const depth = isBossRoom ? 68 : Math.floor(34 + rng() * 18);
      const width = isBossRoom ? 68 : Math.floor(36 + rng() * 20);
      const zGap = Math.floor(18 + rng() * 16);
      const zCenter = prevRoom.zCenter - prevRoom.depth / 2 - zGap - depth / 2;

      const sideDir = (r % 2 === 1 ? 1 : -1) * (rng() > 0.3 ? 1 : -1);
      const xShift = sideDir * Math.floor(12 + rng() * 32);
      const xCenter = Math.max(-50, Math.min(50, prevRoom.xCenter + xShift));

      // Procedural elevation variations: inclines (+3.0m, +4.5m) and declines (-2.0m, +1.5m)
      let yCenter = 0;
      if (r === 1) yCenter = 3.0; // Incline UP from start
      else if (r === 2) yCenter = 0.5; // Decline DOWN
      else if (r === 3) yCenter = 4.5; // Incline UP
      else if (r === 4) yCenter = 2.0; // Decline
      else if (r === 5) yCenter = 6.0; // High Platform Floor
      else yCenter = Math.round(((r * 2.2 + Math.sin(r * 3.1) * 4.0) % 7.5) * 2) / 2;

      if (isBossRoom) yCenter = 4.0; // Grand Boss Citadel Floor

      const corridorWidth = 8.0 + Math.floor(rng() * 3) * 0.8;
      const zBendRatio = 0.3 + rng() * 0.4;
      const corridorTheme = Math.floor(rng() * 8);

      const roomEnemies: EnemyType[] = [];

      if (isBossRoom) {
        let bossType: EnemyType = 'boss_ultradoman';
        if (levelNumber === 4) bossType = 'boss_ultradoman';
        else if (levelNumber === 8) bossType = 'boss_worm';
        else if (levelNumber === 12) bossType = 'boss_miner';
        else if (levelNumber === 16) bossType = 'boss_overlord';
        else if (levelNumber === 17) bossType = 'boss_goliath';
        else {
          const bossTypes: EnemyType[] = ['boss_ultradoman', 'boss_worm', 'boss_miner', 'boss_overlord', 'boss_goliath'];
          bossType = bossTypes[Math.floor(levelNumber / 4) % bossTypes.length];
        }
        roomEnemies.push(bossType);

        let minionCount = Math.min(6, 2 + Math.floor(levelNumber / 3));
        if (levelNumber >= 9) {
          minionCount = Math.max(1, Math.round(minionCount * 0.85));
        }
        for (let m = 0; m < minionCount; m++) {
          roomEnemies.push(enemyPool[(r + m) % enemyPool.length]);
        }
      } else {
        let count = 2 + Math.floor(levelNumber * 0.85) + Math.floor(r * 0.5);
        if (levelNumber >= 9) {
          count = Math.max(1, Math.round(count * 0.85));
        }
        for (let e = 0; e < count; e++) {
          const type = enemyPool[Math.floor(rng() * enemyPool.length)];
          roomEnemies.push(type);
        }
      }

      rooms.push({
        id: r + 1,
        xCenter,
        zCenter,
        yCenter,
        width,
        depth,
        isBossRoom,
        corridorWidth,
        zBendRatio,
        corridorTheme,
        enemies: roomEnemies,
      });
    }

    const roomObjLists: THREE.Object3D[][] = rooms.map(() => []);
    const originalSceneAdd = scene.add.bind(scene);

    // Rear Wall behind Room 1 (Start Wall)
    const startWallGeo = new THREE.BoxGeometry(rooms[0].width, wallHeight + 4, 1.5);
    const startWall = new THREE.Mesh(startWallGeo, wallMat);
    startWall.position.set(rooms[0].xCenter, wallHeight / 2, rooms[0].zCenter + rooms[0].depth / 2);
    startWall.name = 'wall';
    markStatic(startWall);
    roomObjLists[0].push(startWall);
    originalSceneAdd(startWall);

    // Build Room Meshes & Sloped Corridors
    for (let i = 0; i < rooms.length; i++) {
      scene.add = (...objs: THREE.Object3D[]) => {
        for (const obj of objs) {
          originalSceneAdd(obj);
          roomObjLists[i].push(obj);
        }
        return scene;
      };

      const room = rooms[i];
      const zMin = room.zCenter - room.depth / 2;
      const zMax = room.zCenter + room.depth / 2;
      const yFloor = room.yCenter;

      // 1. Room Base Floor (at yFloor height)
      const rFloorGeo = new THREE.BoxGeometry(room.width, 0.8, room.depth);
      const rFloor = new THREE.Mesh(rFloorGeo, floorMat);
      rFloor.position.set(room.xCenter, yFloor - 0.4, room.zCenter);
      rFloor.receiveShadow = true;
      rFloor.name = 'ground';
      markStatic(rFloor);
      scene.add(rFloor);

      // Ceiling Slab
      const rCeilGeo = new THREE.BoxGeometry(room.width, 0.8, room.depth);
      const rCeil = new THREE.Mesh(rCeilGeo, ceilingMat);
      rCeil.position.set(room.xCenter, yFloor + wallHeight + 0.4, room.zCenter);
      rCeil.name = 'wall';
      markStatic(rCeil);
      scene.add(rCeil);

      // Laboratory Devastation & Wreckage ("Погромы в заброшенной лаборатории - 1000x детализация")
      if (isLabLevel) {
        // 1. Hanging Ceiling Light Fixtures & Cable Bundles ("Свисающие кабеля и разбитые светильники")
        for (let w = 0; w < 3; w++) {
          const wx = room.xCenter + (Math.sin(w * 2.1 + i) * (room.width * 0.32));
          const wz = room.zCenter + (Math.cos(w * 1.7 + i) * (room.depth * 0.32));

          const ceilingFixture = LevelGenerator.createUltraDetailedCeilingFixture();
          ceilingFixture.position.set(wx, yFloor + wallHeight - 0.2, wz);
          ceilingFixture.rotation.set((Math.random() - 0.5) * 0.2, Math.random() * Math.PI, (Math.random() - 0.5) * 0.2);
          markStatic(ceilingFixture);
          scene.add(ceilingFixture);
        }

        // 2. Overturned Ultra-Detailed Laboratory Workstations ("Перевернутые многокомпонентные лабораторные столы")
        for (let d = 0; d < 2; d++) {
          const dx = room.xCenter + (d === 0 ? -1 : 1) * (room.width * 0.28);
          const dz = room.zCenter + (d === 0 ? 1 : -1) * (room.depth * 0.25);

          const deskGroup = LevelGenerator.createUltraDetailedWorkstation();
          deskGroup.position.set(dx, yFloor + 0.8, dz);
          deskGroup.rotation.set(0.6 + Math.random() * 0.3, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4); // Overturned/tilted!
          markStatic(deskGroup);
          scene.add(deskGroup);
        }

        // 3. Shattered Biohazard Cryo-Tanks / Containment Cylinders with Glass Shards & Mutagen Bubbles ("Разбитые многосоставные био-капсулы")
        for (let c = 0; c < 2; c++) {
          const cx = room.xCenter + (c === 0 ? 1 : -1) * (room.width * 0.32);
          const cz = room.zCenter + (c === 0 ? -1 : 1) * (room.depth * 0.3);

          const cryoTank = LevelGenerator.createUltraDetailedCryoTank();
          cryoTank.position.set(cx, yFloor, cz);
          cryoTank.rotation.y = Math.random() * Math.PI * 2;
          markStatic(cryoTank);
          scene.add(cryoTank);
        }

        // 4. Overturned Chemical Biohazard Barrels with Ribs & Spill Streams ("Химические бочки с ребрами жесткости и подтеками")
        for (let b = 0; b < 3; b++) {
          const bx = room.xCenter + (Math.cos(b * 2.5 + i) * (room.width * 0.3));
          const bz = room.zCenter + (Math.sin(b * 1.7 + i) * (room.depth * 0.3));

          const barrel = LevelGenerator.createUltraDetailedBiohazardBarrel();
          if (b === 0) {
            barrel.position.set(bx, yFloor + 0.7, bz); // Upright
          } else {
            barrel.position.set(bx, yFloor + 0.35, bz);
            barrel.rotation.z = Math.PI / 2 + b * 0.3; // Tipped over barrel!
            barrel.rotation.y = Math.random() * Math.PI;
          }
          markStatic(barrel);
          scene.add(barrel);
        }

        // 5. Wall-Mounted Emergency Props (Extinguishers, First Aid Lockboxes & Caution Signs)
        if (isLabLevel) {
          const wallProps = LevelGenerator.createUltraDetailedWallProps();
          wallProps.position.set(room.xCenter - room.width / 2 + 0.3, yFloor + 2.5, room.zCenter);
          markStatic(wallProps);
          scene.add(wallProps);
        }

        // 6. Flashing Emergency Alarm Warning Beacon Light ("Аварийный маяк")
        const beaconLight = new THREE.PointLight(0xef4444, 5.0, 25);
        beaconLight.position.set(room.xCenter, yFloor + wallHeight - 1.5, room.zCenter);
        scene.add(beaconLight);

        const beaconMesh = new THREE.Mesh(
          ModelBuilder.getGeo('lg:CylinderGeometry:f97763e80dd6', () => new THREE.CylinderGeometry(0.3, 0.4, 0.6, 12)),
          (ModelBuilder.getMaterial('lg:MeshBasicMaterial:af7c1c8b4672', () => new THREE.MeshBasicMaterial({ color: 0xef4444 })) as THREE.MeshBasicMaterial)
        );
        beaconMesh.position.set(room.xCenter, yFloor + wallHeight - 0.3, room.zCenter);
        markStatic(beaconMesh);
        scene.add(beaconMesh);
      } else if (isSubwayLevel) {
        // Subway Station Overhead Lights & Route Sign Props
        for (let w = 0; w < 2; w++) {
          const lampGroup = LevelGenerator.createSubwayStationLamps();
          lampGroup.position.set(
            room.xCenter + (w === 0 ? -4 : 4),
            yFloor + wallHeight - 0.3,
            room.zCenter
          );
          markStatic(lampGroup);
          scene.add(lampGroup);
        }

        const mapBoard = LevelGenerator.createSubwayStationMap();
        mapBoard.position.set(room.xCenter - room.width / 2 + 0.3, yFloor + 4.5, room.zCenter);
        mapBoard.rotation.y = Math.PI / 2;
        mapBoard.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (!child.name) child.name = 'wall';
            markStatic(child);
          }
        });
        scene.add(mapBoard);

        const beaconLight = new THREE.PointLight(0x00aaff, 4.0, 22);
        beaconLight.position.set(room.xCenter, yFloor + wallHeight - 1.5, room.zCenter);
        scene.add(beaconLight);
      }

      // 2. Room Side Walls
      const sideWallGeo = new THREE.BoxGeometry(1.5, wallHeight + 2, room.depth);

      const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
      leftWall.position.set(room.xCenter - room.width / 2, yFloor + wallHeight / 2, room.zCenter);
      leftWall.name = 'wall';
      markStatic(leftWall);
      scene.add(leftWall);

      const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
      rightWall.position.set(room.xCenter + room.width / 2, yFloor + wallHeight / 2, room.zCenter);
      rightWall.name = 'wall';
      markStatic(rightWall);
      scene.add(rightWall);

      // 3. Room Atmosphere Lighting
      const roomLight = new THREE.PointLight(lightColor, room.isBossRoom ? 6.0 : 4.0, room.isBossRoom ? 50 : 35);
      roomLight.position.set(room.xCenter, yFloor + 8, room.zCenter);
      scene.add(roomLight);

      // Marker Lamp over Exit
      const markerGeo = ModelBuilder.getGeo('lg:BoxGeometry:fa697f781901', () => new THREE.BoxGeometry(1.6, 0.8, 0.4));
      const markerMat = new THREE.MeshBasicMaterial({ color: room.isBossRoom ? 0xff0044 : 0xffaa00 });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.set(room.xCenter, yFloor + 7, zMax - 0.2);
      markStatic(marker);
      scene.add(marker);

      // 4. THEMATIC PLATFORMS IN ROOMS
      let sniperLedgeTopY: number | null = null;
      let sniperLedgeX = room.xCenter;
      let sniperLedgeZ = room.zCenter;

      if (room.isBossRoom) {
        // Grand Boss Arena Corners & Elevated Center Stage
        const pillarGeo = new THREE.CylinderGeometry(2.2, 2.2, wallHeight, 16);
        const pillarMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:d6b64eb2eb40', () => new THREE.MeshStandardMaterial({ color: 0x1a121c, metalness: 0.9, roughness: 0.2 })) as THREE.MeshStandardMaterial);
        const ringMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:7e2bad2b4a1d', () => new THREE.MeshBasicMaterial({ color: 0xff0044 })) as THREE.MeshBasicMaterial);

        const pOffsets = [
          [-room.width / 3, -room.depth / 3],
          [room.width / 3, -room.depth / 3],
          [-room.width / 3, room.depth / 3],
          [room.width / 3, room.depth / 3],
        ];

        pOffsets.forEach(([px, pz]) => {
          const pMesh = new THREE.Mesh(pillarGeo, pillarMat);
          pMesh.position.set(room.xCenter + px, yFloor + wallHeight / 2, room.zCenter + pz);
          pMesh.name = 'wall';
          markStatic(pMesh);
          scene.add(pMesh);

          const ringMesh = new THREE.Mesh(ModelBuilder.getGeo('lg:TorusGeometry:6dfe8bc2cbe5', () => new THREE.TorusGeometry(2.3, 0.2, 8, 16)), ringMat);
          ringMesh.rotation.x = Math.PI / 2;
          ringMesh.position.set(room.xCenter + px, yFloor + 4, room.zCenter + pz);
          markStatic(ringMesh);
          scene.add(ringMesh);
        });

        // Elevated Central Boss Arena Ring
        const bossRingMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:2750bddb3ae0', () => new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 0.6 })) as THREE.MeshStandardMaterial);
        const bossRingMesh = new THREE.Mesh(ModelBuilder.getGeo('lg:TorusGeometry:9b7f41f5b991', () => new THREE.TorusGeometry(8.0, 0.2, 8, 32)), bossRingMat);
        bossRingMesh.rotation.x = Math.PI / 2;
        bossRingMesh.position.set(room.xCenter, yFloor + 0.05, room.zCenter);
        markStatic(bossRingMesh);
        scene.add(bossRingMesh);

        // Control Consoles, Specimen Cryo Tanks, and Server Racks in Boss Chamber (Lab levels only)
        if (isLabLevel) {
          [-6, 6].forEach((xOff) => {
            const consoleGroup = LevelGenerator.createUltraDetailedControlConsole();
            consoleGroup.position.set(room.xCenter + xOff, yFloor, room.zCenter - 4);
            consoleGroup.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(consoleGroup);
          });

          [-12, 12].forEach((xOff) => {
            const tankGroup = LevelGenerator.createUltraDetailedCryoTank();
            tankGroup.position.set(room.xCenter + xOff, yFloor, room.zCenter);
            tankGroup.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(tankGroup);
          });

          [-8, 0, 8].forEach((xOff) => {
            const rackGroup = LevelGenerator.createUltraDetailedServerRack();
            rackGroup.position.set(room.xCenter + xOff, yFloor, room.zCenter - room.depth / 2 + 3);
            rackGroup.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(rackGroup);
          });
        } else if (isSubwayLevel) {
          // Subway Metro Boss Chamber: Train car wreckage & ticket terminal barrier
          const trainCar = LevelGenerator.createSubwayTrainCar();
          trainCar.position.set(room.xCenter - room.width / 3, yFloor, room.zCenter - 2);
          trainCar.rotation.y = Math.PI / 12; // Slightly angled derailment
          trainCar.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              if (!child.name) child.name = 'wall';
              markStatic(child);
            }
          });
          scene.add(trainCar);

          [-8, 0, 8].forEach((xOff) => {
            const turnstile = LevelGenerator.createSubwayTurnstile();
            turnstile.position.set(room.xCenter + xOff, yFloor, room.zCenter + room.depth / 3);
            turnstile.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(turnstile);
          });

          [-12, 12].forEach((xOff) => {
            const ticketMachine = LevelGenerator.createSubwayTicketMachine();
            ticketMachine.position.set(room.xCenter + xOff, yFloor, room.zCenter + room.depth / 3);
            ticketMachine.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(ticketMachine);
          });
        }
      } else if (i === 0) {
        // Start Room: Command Hub (Lab) or Metro Ticket Concourse (Subway)
        if (isLabLevel) {
          const hubPedestal = LevelGenerator.createUltraDetailedCommandHubPedestal();
          hubPedestal.position.set(room.xCenter, yFloor, room.zCenter);
          hubPedestal.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              if (!child.name) child.name = 'ground';
              markStatic(child);
            }
          });
          scene.add(hubPedestal);

          const globeGeo = ModelBuilder.getGeo('lg:IcosahedronGeometry:238cfb963016', () => new THREE.IcosahedronGeometry(1.2, 1));
          const globeMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:407f072d04e7', () => new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true })) as THREE.MeshBasicMaterial);
          const globe = new THREE.Mesh(globeGeo, globeMat);
          globe.position.set(room.xCenter, yFloor + 2.8, room.zCenter);
          markStatic(globe);
          scene.add(globe);

          const holoLight = new THREE.PointLight(0x00ffff, 3.5, 12);
          holoLight.position.set(room.xCenter, yFloor + 3.0, room.zCenter);
          scene.add(holoLight);

          [
            [-4, -4, 0], [4, -4, 0],
            [-4, 4, Math.PI], [4, 4, Math.PI]
          ].forEach(([xOff, zOff, rotY]) => {
            const ws = LevelGenerator.createUltraDetailedLabWorkstation();
            ws.position.set(room.xCenter + xOff, yFloor + 0.6, room.zCenter + zOff);
            ws.rotation.y = rotY;
            ws.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(ws);
          });

          [-room.width / 2 + 2, room.width / 2 - 2].forEach((xOff) => {
            const locker = LevelGenerator.createUltraDetailedEquipmentLocker();
            locker.position.set(room.xCenter + xOff, yFloor, room.zCenter);
            locker.rotation.y = xOff > 0 ? -Math.PI / 2 : Math.PI / 2;
            locker.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(locker);
          });
        } else if (isSubwayLevel) {
          // Metro Station Ticket Concourse
          [-4, -1.5, 1.5, 4].forEach((xOff) => {
            const turnstile = LevelGenerator.createSubwayTurnstile();
            turnstile.position.set(room.xCenter + xOff, yFloor, room.zCenter - 2);
            turnstile.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(turnstile);
          });

          [-room.width / 2 + 2, room.width / 2 - 2].forEach((xOff) => {
            const machine = LevelGenerator.createSubwayTicketMachine();
            machine.position.set(room.xCenter + xOff, yFloor, room.zCenter);
            machine.rotation.y = xOff > 0 ? -Math.PI / 2 : Math.PI / 2;
            machine.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(machine);
          });

          [-6, 6].forEach((xOff) => {
            const bench = LevelGenerator.createSubwayBench();
            bench.position.set(room.xCenter + xOff, yFloor, room.zCenter + 5);
            bench.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(bench);
          });
        }
      } else {
        // Regular Combat Room
        if (isLabLevel) {
          // Create Logical High-Tech Laboratory Layouts per Floor (Level 1, 2, 3, 4)!
          const floorId = (levelNumber - 1) % 4; // 0: Floor 1, 1: Floor 2, 2: Floor 3, 3: Floor 4
          const roomVariant = (i + floorId) % 4;

          if (floorId === 0) {
            if (roomVariant === 0) {
              const holoTable = LevelGenerator.createUltraDetailedLabWorkstation();
              holoTable.position.set(room.xCenter, yFloor + 0.6, room.zCenter);
              holoTable.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(holoTable);

              [-room.width / 2 + 2, room.width / 2 - 2].forEach((xOff) => {
                const locker = LevelGenerator.createUltraDetailedEquipmentLocker();
                locker.position.set(room.xCenter + xOff, yFloor, room.zCenter);
                locker.rotation.y = xOff > 0 ? -Math.PI / 2 : Math.PI / 2;
                locker.traverse((child) => {
                  if (child instanceof THREE.Mesh) {
                    if (!child.name) child.name = 'wall';
                    markStatic(child);
                  }
                });
                scene.add(locker);
              });

            } else if (roomVariant === 1) {
              [-1, 1].forEach((side) => {
                const xPos = room.xCenter + side * (room.width / 3.2);
                const ws = LevelGenerator.createUltraDetailedLabWorkstation();
                ws.position.set(xPos, yFloor + 0.6, room.zCenter);
                ws.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
                ws.traverse((child) => {
                  if (child instanceof THREE.Mesh) {
                    if (!child.name) child.name = 'wall';
                    markStatic(child);
                  }
                });
                scene.add(ws);
              });

              const consoleGroup = LevelGenerator.createUltraDetailedControlConsole();
              consoleGroup.position.set(room.xCenter, yFloor, room.zCenter - room.depth / 3);
              consoleGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(consoleGroup);

            } else if (roomVariant === 2) {
              const ledgeWidth = 6.0;
              const ledgeDepth = room.depth * 0.55;
              const ledgeHeight = 3.6;
              const side = (i % 2 === 0 ? 1 : -1);

              sniperLedgeX = room.xCenter + side * (room.width / 2 - ledgeWidth / 2 - 1.0);
              sniperLedgeZ = room.zCenter;
              sniperLedgeTopY = yFloor + ledgeHeight;

              const ledgeGroup = LevelGenerator.createUltraDetailedStagePlatform(
                ledgeWidth,
                ledgeHeight,
                ledgeDepth,
                coverMat
              );
              ledgeGroup.position.set(sniperLedgeX, yFloor + ledgeHeight - 0.4, sniperLedgeZ);
              ledgeGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'ground';
                  markStatic(child);
                }
              });
              scene.add(ledgeGroup);

              const rampLength = 9.0;
              const rampAngle = Math.atan2(ledgeHeight, rampLength);
              const rampGroup = LevelGenerator.createUltraDetailedSlopeRampGroup(
                ledgeWidth * 0.8,
                rampLength + 0.5,
                -rampAngle,
                ledgeHeight,
                coverMat
              );
              rampGroup.position.set(
                sniperLedgeX,
                yFloor + ledgeHeight / 2,
                sniperLedgeZ + ledgeDepth / 2 + rampLength / 2 - 0.5
              );
              rampGroup.rotation.x = -rampAngle;
              rampGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'ground';
                  markStatic(child);
                }
              });
              scene.add(rampGroup);

              const locker = LevelGenerator.createUltraDetailedEquipmentLocker();
              locker.position.set(room.xCenter - side * (room.width / 3), yFloor, room.zCenter);
              locker.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
              locker.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(locker);

            } else {
              const consoleGroup = LevelGenerator.createUltraDetailedControlConsole();
              consoleGroup.position.set(room.xCenter - room.width / 3, yFloor, room.zCenter - 2);
              consoleGroup.rotation.y = Math.PI / 4;
              consoleGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(consoleGroup);

              const ws = LevelGenerator.createUltraDetailedLabWorkstation();
              ws.position.set(room.xCenter + room.width / 3, yFloor + 0.6, room.zCenter + 2);
              ws.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(ws);
            }

          } else if (floorId === 1) {
            if (roomVariant === 0) {
              [-1, 1].forEach((side) => {
                const xPos = room.xCenter + side * (room.width / 3.2);
                for (let r = -1; r <= 1; r++) {
                  const rackGroup = LevelGenerator.createUltraDetailedServerRack();
                  rackGroup.position.set(xPos, yFloor, room.zCenter + r * 3.5);
                  rackGroup.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
                  rackGroup.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                      if (!child.name) child.name = 'wall';
                      markStatic(child);
                    }
                  });
                  scene.add(rackGroup);
                }
              });

              const consoleGroup = LevelGenerator.createUltraDetailedControlConsole();
              consoleGroup.position.set(room.xCenter, yFloor, room.zCenter - room.depth / 3);
              consoleGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(consoleGroup);

            } else if (roomVariant === 1) {
              [
                [-room.width / 3, -room.depth / 3, Math.PI / 4],
                [room.width / 3, -room.depth / 3, -Math.PI / 4],
                [-room.width / 3, room.depth / 3, (3 * Math.PI) / 4],
                [room.width / 3, room.depth / 3, -(3 * Math.PI) / 4]
              ].forEach(([xOff, zOff, rotY]) => {
                const rackGroup = LevelGenerator.createUltraDetailedServerRack();
                rackGroup.position.set(room.xCenter + xOff, yFloor, room.zCenter + zOff);
                rackGroup.rotation.y = rotY;
                rackGroup.traverse((child) => {
                  if (child instanceof THREE.Mesh) {
                    if (!child.name) child.name = 'wall';
                    markStatic(child);
                  }
                });
                scene.add(rackGroup);
              });

              const consoleGroup = LevelGenerator.createUltraDetailedControlConsole();
              consoleGroup.position.set(room.xCenter, yFloor, room.zCenter);
              consoleGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(consoleGroup);

            } else if (roomVariant === 2) {
              const ledgeWidth = 6.0;
              const ledgeDepth = room.depth * 0.55;
              const ledgeHeight = 3.6;

              sniperLedgeX = room.xCenter - (room.width / 2 - ledgeWidth / 2 - 1.0);
              sniperLedgeZ = room.zCenter;
              sniperLedgeTopY = yFloor + ledgeHeight;

              const ledgeGroup = LevelGenerator.createUltraDetailedStagePlatform(
                ledgeWidth,
                ledgeHeight,
                ledgeDepth,
                coverMat
              );
              ledgeGroup.position.set(sniperLedgeX, yFloor + ledgeHeight - 0.4, sniperLedgeZ);
              ledgeGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'ground';
                  markStatic(child);
                }
              });
              scene.add(ledgeGroup);

              const rampLength = 9.0;
              const rampAngle = Math.atan2(ledgeHeight, rampLength);
              const rampGroup = LevelGenerator.createUltraDetailedSlopeRampGroup(
                ledgeWidth * 0.8,
                rampLength + 0.5,
                -rampAngle,
                ledgeHeight,
                coverMat
              );
              rampGroup.position.set(
                sniperLedgeX,
                yFloor + ledgeHeight / 2,
                sniperLedgeZ + ledgeDepth / 2 + rampLength / 2 - 0.5
              );
              rampGroup.rotation.x = -rampAngle;
              rampGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'ground';
                  markStatic(child);
                }
              });
              scene.add(rampGroup);

              const rack = LevelGenerator.createUltraDetailedServerRack();
              rack.position.set(room.xCenter + room.width / 3, yFloor, room.zCenter);
              rack.rotation.y = -Math.PI / 2;
              rack.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(rack);

            } else {
              const rack1 = LevelGenerator.createUltraDetailedServerRack();
              rack1.position.set(room.xCenter - room.width / 4, yFloor, room.zCenter - room.depth / 3);
              rack1.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(rack1);

              const rack2 = LevelGenerator.createUltraDetailedServerRack();
              rack2.position.set(room.xCenter + room.width / 4, yFloor, room.zCenter - room.depth / 3);
              rack2.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(rack2);

              const console1 = LevelGenerator.createUltraDetailedControlConsole();
              console1.position.set(room.xCenter, yFloor, room.zCenter + 2);
              console1.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(console1);
            }

          } else if (floorId === 2) {
            if (roomVariant === 0) {
              const cryoGroup = LevelGenerator.createUltraDetailedCryoTank();
              cryoGroup.position.set(room.xCenter, yFloor, room.zCenter);
              cryoGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(cryoGroup);

              [-5, 5].forEach((xOff) => {
                const consoleGroup = LevelGenerator.createUltraDetailedControlConsole();
                consoleGroup.position.set(room.xCenter + xOff, yFloor, room.zCenter);
                consoleGroup.rotation.y = xOff > 0 ? -Math.PI / 4 : Math.PI / 4;
                consoleGroup.traverse((child) => {
                  if (child instanceof THREE.Mesh) {
                    if (!child.name) child.name = 'wall';
                    markStatic(child);
                  }
                });
                scene.add(consoleGroup);
              });

              const bioStorage = LevelGenerator.createUltraDetailedBioStorage();
              bioStorage.position.set(room.xCenter - room.width / 3, yFloor, room.zCenter + 4);
              bioStorage.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(bioStorage);

            } else if (roomVariant === 1) {
              [-room.width / 3, room.width / 3].forEach((xPos) => {
                const cryo = LevelGenerator.createUltraDetailedCryoTank();
                cryo.position.set(room.xCenter + xPos, yFloor, room.zCenter);
                cryo.traverse((child) => {
                  if (child instanceof THREE.Mesh) {
                    if (!child.name) child.name = 'wall';
                    markStatic(child);
                  }
                });
                scene.add(cryo);
              });

              const console1 = LevelGenerator.createUltraDetailedControlConsole();
              console1.position.set(room.xCenter, yFloor, room.zCenter - room.depth / 3);
              console1.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(console1);

            } else if (roomVariant === 2) {
              const ledgeWidth = 6.0;
              const ledgeDepth = room.depth * 0.55;
              const ledgeHeight = 3.6;

              sniperLedgeX = room.xCenter + (room.width / 2 - ledgeWidth / 2 - 1.0);
              sniperLedgeZ = room.zCenter;
              sniperLedgeTopY = yFloor + ledgeHeight;

              const ledgeGroup = LevelGenerator.createUltraDetailedStagePlatform(
                ledgeWidth,
                ledgeHeight,
                ledgeDepth,
                coverMat
              );
              ledgeGroup.position.set(sniperLedgeX, yFloor + ledgeHeight - 0.4, sniperLedgeZ);
              ledgeGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'ground';
                  markStatic(child);
                }
              });
              scene.add(ledgeGroup);

              const rampLength = 9.0;
              const rampAngle = Math.atan2(ledgeHeight, rampLength);
              const rampGroup = LevelGenerator.createUltraDetailedSlopeRampGroup(
                ledgeWidth * 0.8,
                rampLength + 0.5,
                -rampAngle,
                ledgeHeight,
                coverMat
              );
              rampGroup.position.set(
                sniperLedgeX,
                yFloor + ledgeHeight / 2,
                sniperLedgeZ + ledgeDepth / 2 + rampLength / 2 - 0.5
              );
              rampGroup.rotation.x = -rampAngle;
              rampGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'ground';
                  markStatic(child);
                }
              });
              scene.add(rampGroup);

              const cryo = LevelGenerator.createUltraDetailedCryoTank();
              cryo.position.set(room.xCenter - room.width / 3, yFloor, room.zCenter);
              cryo.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(cryo);

            } else {
              const bioPallet1 = LevelGenerator.createUltraDetailedBioStorage();
              bioPallet1.position.set(room.xCenter - room.width / 3, yFloor, room.zCenter - 3);
              bioPallet1.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(bioPallet1);

              const bioPallet2 = LevelGenerator.createUltraDetailedBioStorage();
              bioPallet2.position.set(room.xCenter + room.width / 3, yFloor, room.zCenter - 3);
              bioPallet2.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(bioPallet2);

              const ws = LevelGenerator.createUltraDetailedLabWorkstation();
              ws.position.set(room.xCenter, yFloor + 0.6, room.zCenter + 2);
              ws.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(ws);
            }

          } else {
            if (roomVariant === 0) {
              [-room.width / 3, room.width / 3].forEach((xPos) => {
                const locker = LevelGenerator.createUltraDetailedEquipmentLocker();
                locker.position.set(room.xCenter + xPos, yFloor, room.zCenter);
                locker.rotation.y = xPos > 0 ? -Math.PI / 2 : Math.PI / 2;
                locker.traverse((child) => {
                  if (child instanceof THREE.Mesh) {
                    if (!child.name) child.name = 'wall';
                    markStatic(child);
                  }
                });
                scene.add(locker);
              });

              const ws = LevelGenerator.createUltraDetailedLabWorkstation();
              ws.position.set(room.xCenter, yFloor + 0.6, room.zCenter - room.depth / 3);
              ws.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(ws);

            } else if (roomVariant === 1) {
              const coreRingMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:5829810a83f9', () => new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xff5500, emissiveIntensity: 0.8 })) as THREE.MeshStandardMaterial);
              const coreRing = new THREE.Mesh(ModelBuilder.getGeo('lg:TorusGeometry:4a2e1b11651b', () => new THREE.TorusGeometry(3.5, 0.15, 8, 32)), coreRingMat);
              coreRing.rotation.x = Math.PI / 2;
              coreRing.position.set(room.xCenter, yFloor + 0.05, room.zCenter);
              markStatic(coreRing);
              scene.add(coreRing);

              const coreLight = new THREE.PointLight(0xffaa00, 3.5, 12);
              coreLight.position.set(room.xCenter, yFloor + 2.0, room.zCenter);
              scene.add(coreLight);

              const console1 = LevelGenerator.createUltraDetailedControlConsole();
              console1.position.set(room.xCenter - 5, yFloor, room.zCenter);
              console1.rotation.y = Math.PI / 2;
              console1.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(console1);

              const console2 = LevelGenerator.createUltraDetailedControlConsole();
              console2.position.set(room.xCenter + 5, yFloor, room.zCenter);
              console2.rotation.y = -Math.PI / 2;
              console2.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(console2);

            } else if (roomVariant === 2) {
              const ledgeWidth = 6.0;
              const ledgeDepth = room.depth * 0.55;
              const ledgeHeight = 3.6;

              sniperLedgeX = room.xCenter - (room.width / 2 - ledgeWidth / 2 - 1.0);
              sniperLedgeZ = room.zCenter;
              sniperLedgeTopY = yFloor + ledgeHeight;

              const ledgeGroup = LevelGenerator.createUltraDetailedStagePlatform(
                ledgeWidth,
                ledgeHeight,
                ledgeDepth,
                coverMat
              );
              ledgeGroup.position.set(sniperLedgeX, yFloor + ledgeHeight - 0.4, sniperLedgeZ);
              ledgeGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'ground';
                  markStatic(child);
                }
              });
              scene.add(ledgeGroup);

              const rampLength = 9.0;
              const rampAngle = Math.atan2(ledgeHeight, rampLength);
              const rampGroup = LevelGenerator.createUltraDetailedSlopeRampGroup(
                ledgeWidth * 0.8,
                rampLength + 0.5,
                -rampAngle,
                ledgeHeight,
                coverMat
              );
              rampGroup.position.set(
                sniperLedgeX,
                yFloor + ledgeHeight / 2,
                sniperLedgeZ + ledgeDepth / 2 + rampLength / 2 - 0.5
              );
              rampGroup.rotation.x = -rampAngle;
              rampGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'ground';
                  markStatic(child);
                }
              });
              scene.add(rampGroup);

              const locker = LevelGenerator.createUltraDetailedEquipmentLocker();
              locker.position.set(sniperLedgeX, sniperLedgeTopY, sniperLedgeZ - 2.0);
              locker.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(locker);

              const ws = LevelGenerator.createUltraDetailedLabWorkstation();
              ws.position.set(room.xCenter + room.width / 3, yFloor + 0.6, room.zCenter);
              ws.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(ws);

            } else {
              const cryo = LevelGenerator.createUltraDetailedCryoTank();
              cryo.position.set(room.xCenter - room.width / 3, yFloor, room.zCenter - room.depth / 3);
              cryo.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(cryo);

              const rack = LevelGenerator.createUltraDetailedServerRack();
              rack.position.set(room.xCenter + room.width / 3, yFloor, room.zCenter - room.depth / 3);
              rack.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(rack);

              const console1 = LevelGenerator.createUltraDetailedControlConsole();
              console1.position.set(room.xCenter, yFloor, room.zCenter + 2);
              console1.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(console1);
            }
          }
        } else if (isSubwayLevel) {
          // Levels 5-9: Subway Metro Catacombs - Every room features a Subway Metro Train Car Wreckage!
          const subwayVariant = i % 4;
          if (subwayVariant === 0) {
            // Metro Train Car on side track + station benches
            const trainCar = LevelGenerator.createSubwayTrainCar();
            trainCar.position.set(room.xCenter - room.width / 3.5, yFloor, room.zCenter);
            trainCar.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(trainCar);

            [-room.width / 3, room.width / 3].forEach((xOff) => {
              const bench = LevelGenerator.createSubwayBench();
              bench.position.set(room.xCenter + xOff, yFloor, room.zCenter + room.depth / 3);
              bench.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(bench);
            });

            const bin = LevelGenerator.createSubwayTrashBin();
            bin.position.set(room.xCenter + room.width / 3, yFloor, room.zCenter - room.depth / 3);
            bin.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(bin);

          } else if (subwayVariant === 1) {
            // Diagonal Crashed Train Car blocking middle lane + Turnstile Barrier Line
            const trainCar = LevelGenerator.createSubwayTrainCar();
            trainCar.position.set(room.xCenter, yFloor, room.zCenter - 2);
            trainCar.rotation.y = Math.PI / 4; // Angled crash
            trainCar.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(trainCar);

            [-4, 0, 4].forEach((xOff) => {
              const turnstile = LevelGenerator.createSubwayTurnstile();
              turnstile.position.set(room.xCenter + xOff, yFloor, room.zCenter + room.depth / 3);
              turnstile.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(turnstile);
            });

            [-room.width / 3, room.width / 3].forEach((xOff) => {
              const machine = LevelGenerator.createSubwayTicketMachine();
              machine.position.set(room.xCenter + xOff, yFloor, room.zCenter + room.depth / 3);
              machine.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(machine);
            });

          } else if (subwayVariant === 2) {
            // Elevated Derailed Metro Train Car acting as the Sniper Ledge / Platform!
            const ledgeWidth = 3.6;
            const ledgeHeight = 3.4;
            const side = (i % 4 === 0 ? 1 : -1);

            sniperLedgeX = room.xCenter + side * (room.width / 2 - ledgeWidth / 2 - 1.5);
            sniperLedgeZ = room.zCenter;
            sniperLedgeTopY = yFloor + ledgeHeight;

            // Train Car as Sniper Ledge
            const trainCar = LevelGenerator.createSubwayTrainCar();
            trainCar.position.set(sniperLedgeX, yFloor, sniperLedgeZ);
            trainCar.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                // Top roof meshes act as ground, sides act as wall
                if (child.position.y > 3.0) {
                  child.name = 'ground';
                } else if (!child.name) {
                  child.name = 'wall';
                }
                markStatic(child);
              }
            });
            scene.add(trainCar);

            // Metal Ramp leading up to Train Car roof
            const rampLength = 8.0;
            const rampAngle = Math.atan2(ledgeHeight, rampLength);
            const rampGroup = LevelGenerator.createUltraDetailedSlopeRampGroup(
              ledgeWidth * 0.9,
              rampLength + 0.5,
              -rampAngle,
              ledgeHeight,
              coverMat
            );
            rampGroup.position.set(
              sniperLedgeX,
              yFloor + ledgeHeight / 2,
              sniperLedgeZ + 5.0 + rampLength / 2 - 0.5
            );
            rampGroup.rotation.x = -rampAngle;
            rampGroup.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'ground';
                markStatic(child);
              }
            });
            scene.add(rampGroup);

            [-room.width / 3, room.width / 3].forEach((xOff) => {
              const pillar = LevelGenerator.createSubwayPlatformPillar();
              pillar.position.set(room.xCenter + xOff, yFloor, room.zCenter - 3);
              pillar.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(pillar);
            });

          } else {
            // Central Metro Train Car Aisle + Passenger Lounge & Platform Pillars
            const trainCar = LevelGenerator.createSubwayTrainCar();
            trainCar.position.set(room.xCenter, yFloor, room.zCenter);
            trainCar.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(trainCar);

            [-6, 6].forEach((xOff) => {
              const bench = LevelGenerator.createSubwayBench();
              bench.position.set(room.xCenter + xOff, yFloor, room.zCenter - 3);
              bench.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(bench);

              const bench2 = LevelGenerator.createSubwayBench();
              bench2.position.set(room.xCenter + xOff, yFloor, room.zCenter + 3);
              bench2.rotation.y = Math.PI;
              bench2.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  if (!child.name) child.name = 'wall';
                  markStatic(child);
                }
              });
              scene.add(bench2);
            });

            const machine = LevelGenerator.createSubwayTicketMachine();
            machine.position.set(room.xCenter - room.width / 3, yFloor, room.zCenter - room.depth / 3);
            machine.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'wall';
                markStatic(child);
              }
            });
            scene.add(machine);
          }
        } else {
          // Levels 10-17: Mines, Citadel, Void chapters
          if (i % 2 === 0) {
            const ledgeWidth = 6.0;
            const ledgeDepth = room.depth * 0.55;
            const ledgeHeight = 3.6;
            const side = (i % 4 === 0 ? 1 : -1);

            sniperLedgeX = room.xCenter + side * (room.width / 2 - ledgeWidth / 2 - 1.0);
            sniperLedgeZ = room.zCenter;
            sniperLedgeTopY = yFloor + ledgeHeight;

            const ledgeGroup = LevelGenerator.createUltraDetailedStagePlatform(
              ledgeWidth,
              ledgeHeight,
              ledgeDepth,
              coverMat
            );
            ledgeGroup.position.set(sniperLedgeX, yFloor + ledgeHeight - 0.4, sniperLedgeZ);
            ledgeGroup.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'ground';
                markStatic(child);
              }
            });
            scene.add(ledgeGroup);

            const rampLength = 9.0;
            const rampAngle = Math.atan2(ledgeHeight, rampLength);
            const rampGroup = LevelGenerator.createUltraDetailedSlopeRampGroup(
              ledgeWidth * 0.8,
              rampLength + 0.5,
              -rampAngle,
              ledgeHeight,
              coverMat
            );
            rampGroup.position.set(
              sniperLedgeX,
              yFloor + ledgeHeight / 2,
              sniperLedgeZ + ledgeDepth / 2 + rampLength / 2 - 0.5
            );
            rampGroup.rotation.x = -rampAngle;
            rampGroup.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (!child.name) child.name = 'ground';
                markStatic(child);
              }
            });
            scene.add(rampGroup);
          }
        }
      }

      // 5. DECORATE ALL ROOMS WITH THEMATIC PROPS
      LevelGenerator.decorateRoom(
        scene,
        room,
        biomeIndex,
        markStatic,
        wallMat,
        coverMat,
        frameMat,
        yFloor
      );

      // 6. CONNECTING SLOPED TURNING CORRIDOR TO NEXT ROOM
      if (i < rooms.length - 1) {
        const nextRoom = rooms[i + 1];
        const doorWidth = room.corridorWidth;
        const xA = room.xCenter;
        const xB = nextRoom.xCenter;
        const yA = room.yCenter;
        const yB = nextRoom.yCenter;

        const corridorStart = zMin;
        const corridorEnd = nextRoom.zCenter + nextRoom.depth / 2;

        // Exit Wall for Room i
        const exitWallLeft = (xA - (room.xCenter - room.width / 2)) - doorWidth / 2;
        const exitWallRight = ((room.xCenter + room.width / 2) - xA) - doorWidth / 2;

        if (exitWallLeft > 0) {
          const leftMesh = new THREE.Mesh(new THREE.BoxGeometry(exitWallLeft, wallHeight + 2, 1.5), wallMat);
          leftMesh.position.set((room.xCenter - room.width / 2) + exitWallLeft / 2, yA + wallHeight / 2, corridorStart);
          leftMesh.name = 'wall';
          markStatic(leftMesh);
          scene.add(leftMesh);
        }

        if (exitWallRight > 0) {
          const rightMesh = new THREE.Mesh(new THREE.BoxGeometry(exitWallRight, wallHeight + 2, 1.5), wallMat);
          rightMesh.position.set((room.xCenter + room.width / 2) - exitWallRight / 2, yA + wallHeight / 2, corridorStart);
          rightMesh.name = 'wall';
          markStatic(rightMesh);
          scene.add(rightMesh);
        }

        // Arch Beam
        const exitArchBeam = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 1, 1.5, 1.5), frameMat);
        exitArchBeam.position.set(xA, yA + wallHeight - 0.75, corridorStart);
        exitArchBeam.name = 'wall';
        markStatic(exitArchBeam);
        scene.add(exitArchBeam);

        // LOCK BARRIER (Unlocked pass-through arch frame)
        const barrierGeo = new THREE.BoxGeometry(doorWidth - 0.2, wallHeight - 1, 2.0);
        const barrierMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:05c032b9fd27', () => new THREE.MeshStandardMaterial({
          color: 0x00ff66,
          emissive: 0x00ff33,
          emissiveIntensity: 0.3,
          transparent: true,
          opacity: 0.1,
          side: THREE.DoubleSide,
        })) as THREE.MeshStandardMaterial);
        const barrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
        barrierMesh.position.set(xA, yA + wallHeight / 2 - 0.5, corridorStart);
        barrierMesh.name = 'unlocked_barrier';
        markStatic(barrierMesh);
        scene.add(barrierMesh);

        // LOCK INDICATOR LAMP
        const lockGroup = new THREE.Group();
        const lockBase = new THREE.Mesh(
          ModelBuilder.getGeo('lg:BoxGeometry:dae88def526d', () => new THREE.BoxGeometry(2.2, 0.8, 1.2)),
          (ModelBuilder.getMaterial('lg:MeshStandardMaterial:09e1dfa6e338', () => new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 })) as THREE.MeshStandardMaterial)
        );
        lockGroup.add(lockBase);

        const lockLightMesh = new THREE.Mesh(
          ModelBuilder.getGeo('lg:BoxGeometry:0142ac438440', () => new THREE.BoxGeometry(1.6, 0.4, 0.6)),
          (ModelBuilder.getMaterial('lg:MeshBasicMaterial:be559203ea98', () => new THREE.MeshBasicMaterial({ color: 0xff0000 })) as THREE.MeshBasicMaterial)
        );
        lockLightMesh.position.set(0, 0, 0.4);
        lockGroup.add(lockLightMesh);

        const pointL = new THREE.PointLight(0xff0000, 2.5, 8);
        pointL.position.set(0, 0, 1.0);
        lockGroup.add(pointL);

        lockGroup.position.set(xA, yA + wallHeight - 2.5, corridorStart + 1.2);
        scene.add(lockGroup);

        // TURNING CORRIDOR & INCLINE/DECLINE RAMP GEOMETRY
        const zBend = corridorStart + (corridorEnd - corridorStart) * room.zBendRatio;
        const halfW = doorWidth / 2;
        const zTop = zBend + halfW;
        const zBot = zBend - halfW;

        const xMin = Math.min(xA, xB) - halfW;
        const xMax = Math.max(xA, xB) + halfW;

        const yMid = (yA + yB) / 2;

        // Corridor Segment 1 (from corridorStart to zTop at xA) - Sloped Ramp from yA to yMid
        const f1Length = Math.abs(corridorStart - zTop) + 0.1;
        if (f1Length > 0.1) {
          const dy1 = yMid - yA;
          const slopeAngle1 = Math.atan2(dy1, f1Length);

          const corrFloor1 = LevelGenerator.createUltraDetailedSlopeRampGroup(
            doorWidth,
            f1Length + 0.2,
            slopeAngle1,
            dy1,
            floorMat
          );
          corrFloor1.position.set(xA, (yA + yMid) / 2 - 0.4, (corridorStart + zTop) / 2);
          corrFloor1.rotation.x = slopeAngle1;
          corrFloor1.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              if (!child.name) child.name = 'ground';
              markStatic(child);
            }
          });
          scene.add(corrFloor1);

          // Corridor Ceiling 1
          {
            const corrCeil1 = new THREE.Mesh(
              new THREE.BoxGeometry(doorWidth + 1.2, 0.8, f1Length + 0.4),
              ceilingMat
            );
            corrCeil1.position.set(xA, (yA + yMid) / 2 + wallHeight + 0.4, (corridorStart + zTop) / 2);
            corrCeil1.rotation.x = slopeAngle1;
            corrCeil1.name = 'wall';
            markStatic(corrCeil1);
            scene.add(corrCeil1);
          }
        }

        // Horizontal Bend Segment Floor & Ceiling at yMid
        const hWidth = Math.abs(xMax - xMin);
        const corrFloorH = new THREE.Mesh(
          new THREE.BoxGeometry(hWidth + 0.2, 0.8, doorWidth),
          floorMat
        );
        corrFloorH.position.set((xMin + xMax) / 2, yMid - 0.4, zBend);
        corrFloorH.name = 'ground';
        markStatic(corrFloorH);
        scene.add(corrFloorH);

        {
          const corrCeilH = new THREE.Mesh(
            new THREE.BoxGeometry(hWidth + 1.2, 0.8, doorWidth + 1.2),
            ceilingMat
          );
          corrCeilH.position.set((xMin + xMax) / 2, yMid + wallHeight + 0.4, zBend);
          corrCeilH.name = 'wall';
          markStatic(corrCeilH);
          scene.add(corrCeilH);
        }

        // Corridor Segment 2 (from zBot to corridorEnd at xB) - Sloped Ramp from yMid to yB
        const f2Length = Math.abs(zBot - corridorEnd) + 0.1;
        if (f2Length > 0.1) {
          const dy2 = yB - yMid;
          const slopeAngle2 = Math.atan2(dy2, f2Length);

          const corrFloor2 = LevelGenerator.createUltraDetailedSlopeRampGroup(
            doorWidth,
            f2Length + 0.2,
            slopeAngle2,
            dy2,
            floorMat
          );
          corrFloor2.position.set(xB, (yMid + yB) / 2 - 0.4, (zBot + corridorEnd) / 2);
          corrFloor2.rotation.x = slopeAngle2;
          corrFloor2.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              if (!child.name) child.name = 'ground';
              markStatic(child);
            }
          });
          scene.add(corrFloor2);

          // Corridor Ceiling 2
          {
            const corrCeil2 = new THREE.Mesh(
              new THREE.BoxGeometry(doorWidth + 1.2, 0.8, f2Length + 0.4),
              ceilingMat
            );
            corrCeil2.position.set(xB, (yMid + yB) / 2 + wallHeight + 0.4, (zBot + corridorEnd) / 2);
            corrCeil2.rotation.x = slopeAngle2;
            corrCeil2.name = 'wall';
            markStatic(corrCeil2);
            scene.add(corrCeil2);
          }
        }

        // Corridor Solid Enclosing Side Walls (Extending across min/max heights)
        const wallMinY = Math.min(yA, yB) - 1.0;
        const wallMaxY = Math.max(yA, yB) + wallHeight + 1.0;
        const corrWallH = wallMaxY - wallMinY;
        const corrWallCenterY = (wallMinY + wallMaxY) / 2;

        const addWallX = (xStart: number, xEnd: number, zPos: number) => {
          const w = Math.abs(xEnd - xStart);
          if (w < 0.2) return;
          const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(w, corrWallH, 1.5), wallMat);
          wallMesh.position.set((xStart + xEnd) / 2, corrWallCenterY, zPos);
          wallMesh.name = 'wall';
          markStatic(wallMesh);
          scene.add(wallMesh);
        };

        const addWallZ = (zStart: number, zEnd: number, xPos: number) => {
          const len = Math.abs(zEnd - zStart);
          if (len < 0.2) return;
          const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, corrWallH, len), wallMat);
          wallMesh.position.set(xPos, corrWallCenterY, (zStart + zEnd) / 2);
          wallMesh.name = 'wall';
          markStatic(wallMesh);
          scene.add(wallMesh);
        };

        // North & South Bend Walls
        if (xMin < xA - halfW) addWallX(xMin, xA - halfW, zTop);
        if (xMax > xA + halfW) addWallX(xA + halfW, xMax, zTop);

        if (xMin < xB - halfW) addWallX(xMin, xB - halfW, zBot);
        if (xMax > xB + halfW) addWallX(xB + halfW, xMax, zBot);

        // Side Z Walls
        if (xB > xA) {
          addWallZ(corridorStart, zBot, xA - halfW);
          addWallZ(corridorStart, zTop, xA + halfW);

          addWallZ(zBot, corridorEnd, xB - halfW);
          addWallZ(zTop, corridorEnd, xB + halfW);
        } else if (xB < xA) {
          addWallZ(corridorStart, zTop, xA - halfW);
          addWallZ(corridorStart, zBot, xA + halfW);

          addWallZ(zTop, corridorEnd, xB - halfW);
          addWallZ(zBot, corridorEnd, xB + halfW);
        } else {
          addWallZ(corridorStart, corridorEnd, xA - halfW);
          addWallZ(corridorStart, corridorEnd, xA + halfW);
        }

        // Corridor Thematic Decor & Point Light
        const theme = room.corridorTheme;
        const cornerX = (xA + xB) / 2;

        if (theme === 0) {
          const cyanLight = new THREE.PointLight(0x00f0ff, 4.0, 20);
          cyanLight.position.set(cornerX, yMid + 6, zBend);
          scene.add(cyanLight);

          const archMesh = new THREE.Mesh(
            new THREE.BoxGeometry(doorWidth + 1.0, 1.0, 1.0),
            (ModelBuilder.getMaterial('lg:MeshStandardMaterial:d54e1dbe42db', () => new THREE.MeshStandardMaterial({ color: 0x00e1ff, emissive: 0x00b7ff, emissiveIntensity: 0.9 })) as THREE.MeshStandardMaterial)
          );
          archMesh.position.set(cornerX, yMid + wallHeight - 1, zBend);
          markStatic(archMesh);
          scene.add(archMesh);
        } else if (theme === 1) {
          // Overhead Corridor Emergency Light & Wall Conduit
          const tealLight = new THREE.PointLight(0x00ffaa, 4.5, 22);
          tealLight.position.set(cornerX, yMid + wallHeight - 1.5, zBend);
          scene.add(tealLight);

          const conduit = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.3, doorWidth),
            (ModelBuilder.getMaterial('lg:MeshStandardMaterial:c0110c0c97b3', () => new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 })) as THREE.MeshStandardMaterial)
          );
          conduit.position.set(cornerX, yMid + wallHeight - 0.5, zBend);
          markStatic(conduit);
          scene.add(conduit);
        } else if (theme === 2) {
          const purpleLight = new THREE.PointLight(0xbf00ff, 4.5, 22);
          purpleLight.position.set(xA, yMid + 6, zBend);
          scene.add(purpleLight);
        } else if (theme === 3) {
          const hazardLight = new THREE.PointLight(0xffaa00, 4.5, 20);
          hazardLight.position.set(cornerX, yMid + 6, zBend);
          scene.add(hazardLight);
        } else {
          const crimsonLight = new THREE.PointLight(0xff0044, 5.0, 24);
          crimsonLight.position.set(cornerX, yMid + 6, zBend);
          scene.add(crimsonLight);
        }

        // REAR ENTRY BARRIER FOR NEXT ROOM
        const rearBarrierGeo = new THREE.BoxGeometry(doorWidth - 0.2, wallHeight - 1, 2.5);
        const rearBarrierMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:002e74920079', () => new THREE.MeshStandardMaterial({
          color: 0xff0022,
          emissive: 0xff0000,
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0.05,
          side: THREE.DoubleSide,
        })) as THREE.MeshStandardMaterial);
        const rearBarrierMesh = new THREE.Mesh(rearBarrierGeo, rearBarrierMat);
        rearBarrierMesh.position.set(xB, yB + wallHeight / 2 - 0.5, corridorEnd);
        rearBarrierMesh.name = 'unlocked_barrier';
        markStatic(rearBarrierMesh);
        scene.add(rearBarrierMesh);

        const rearLockGroup = lockGroup.clone();
        rearLockGroup.position.set(xB, yB + wallHeight + 4, corridorEnd);
        scene.add(rearLockGroup);

        const rearLockLightMesh = rearLockGroup.children[1] as THREE.Mesh;

        roomBarriers.push({
          roomId: room.id,
          roomXCenter: room.xCenter,
          roomZCenter: room.zCenter,
          roomWidth: room.width,
          roomDepth: room.depth,
          barrierMesh,
          lockLightMesh,
          lockGroup,
          unlocked: true,
          rearBarrierMesh,
          rearLockGroup,
          rearLockLightMesh,
          rearClosed: false,
          entryX: xB,
          entryZ: corridorEnd - 2.0,
        });

        // Entry Wall for Next Room
        const nextWallLeft = (xB - (nextRoom.xCenter - nextRoom.width / 2)) - doorWidth / 2;
        const nextWallRight = ((nextRoom.xCenter + nextRoom.width / 2) - xB) - doorWidth / 2;

        if (nextWallLeft > 0) {
          const entryLeft = new THREE.Mesh(new THREE.BoxGeometry(nextWallLeft, wallHeight + 2, 1.5), wallMat);
          entryLeft.position.set((nextRoom.xCenter - nextRoom.width / 2) + nextWallLeft / 2, yB + wallHeight / 2, corridorEnd);
          entryLeft.name = 'wall';
          markStatic(entryLeft);
          scene.add(entryLeft);
        }

        if (nextWallRight > 0) {
          const entryRight = new THREE.Mesh(new THREE.BoxGeometry(nextWallRight, wallHeight + 2, 1.5), wallMat);
          entryRight.position.set((nextRoom.xCenter + nextRoom.width / 2) - nextWallRight / 2, yB + wallHeight / 2, corridorEnd);
          entryRight.name = 'wall';
          markStatic(entryRight);
          scene.add(entryRight);
        }

        // Arch Beam
        const nextArchBeam = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 1, 1.5, 1.5), frameMat);
        nextArchBeam.position.set(xB, yB + wallHeight - 0.75, corridorEnd);
        nextArchBeam.name = 'wall';
        markStatic(nextArchBeam);
        scene.add(nextArchBeam);
      } else {
        // Back Wall for Final Room
        const endWall = new THREE.Mesh(new THREE.BoxGeometry(room.width, wallHeight + 2, 1.5), wallMat);
        endWall.position.set(room.xCenter, yFloor + wallHeight / 2, zMin);
        endWall.name = 'wall';
        markStatic(endWall);
        scene.add(endWall);
      }

      // 7. SPAWN ENEMIES IN THIS ROOM (Positioned on floor or elevated platforms)
      if (room.enemies.length > 0) {
        const enemiesPerRow = Math.min(4, room.enemies.length);
        const rows = Math.ceil(room.enemies.length / enemiesPerRow);

        for (let eIdx = 0; eIdx < room.enemies.length; eIdx++) {
          const type = room.enemies[eIdx];

          const col = eIdx % enemiesPerRow;
          const row = Math.floor(eIdx / enemiesPerRow);

          const xStep = room.width / (enemiesPerRow + 1);
          const zStep = Math.min(6, (room.depth * 0.5) / Math.max(1, rows));

          let xPos = room.xCenter - room.width / 2 + xStep * (col + 1);
          let zPos = room.zCenter + (row - (rows - 1) / 2) * zStep;
          let spawnY = yFloor;

          // Snipers and Archers spawn on elevated watchtower ledges/platforms!
          if ((type === 'doman_sniper' || type === 'doman_archer') && sniperLedgeTopY !== null) {
            xPos = sniperLedgeX + (col % 2 === 0 ? -1.5 : 1.5);
            zPos = sniperLedgeZ + (row % 2 === 0 ? -1.5 : 1.5);
            spawnY = sniperLedgeTopY;
          } else if (type === 'drone' || type === 'winged_doman') {
            spawnY = yFloor + 5.0; // Flying units hovering
          }

          enemySpawns.push({
            position: new THREE.Vector3(xPos, spawnY, zPos),
            type,
            roomId: room.id,
          });
        }
      }
    }

    // Restore original scene.add
    scene.add = originalSceneAdd;

    // Finish Zone Portal in Final Room
    const lastRoom = rooms[rooms.length - 1];
    const finishPos = new THREE.Vector3(lastRoom.xCenter, lastRoom.yCenter + 1.5, lastRoom.zCenter - lastRoom.depth / 2 + 6);
    const finishZone = {
      min: new THREE.Vector3(finishPos.x - 4, lastRoom.yCenter, finishPos.z - 4),
      max: new THREE.Vector3(finishPos.x + 4, lastRoom.yCenter + 5, finishPos.z + 4),
    };

    const portal = new THREE.Mesh(
      ModelBuilder.getGeo('lg:CylinderGeometry:90a694db5f8a', () => new THREE.CylinderGeometry(3.0, 3.0, 0.3, 24)),
      new THREE.MeshBasicMaterial({ color: isBossLevel ? 0xff0044 : 0xffaa00 })
    );
    portal.position.copy(finishPos);
    portal.rotation.x = Math.PI / 2;
    // BUGFIX: the portal/light were pushed into the room object list but never parented to
    // the scene (this code runs after scene.add is restored above), so the finish portal
    // was invisible and its light burned a SceneCuller budget slot while rendering nothing.
    scene.add(portal);
    roomObjLists[rooms.length - 1].push(portal);

    const portalLight = new THREE.PointLight(isBossLevel ? 0xff0044 : 0xffaa00, 4.0, 15);
    portalLight.position.copy(finishPos);
    scene.add(portalLight);
    roomObjLists[rooms.length - 1].push(portalLight);

    return {
      scene,
      playerSpawn,
      enemySpawns,
      finishZone,
      biomeName,
      isBossLevel,
      isSecretLevel,
      hasFlashlight,
      staticRoots: LevelGenerator.freezeStaticScene(scene),
      roomBarriers,
      rooms: rooms.map((r, idx) => ({
        id: r.id,
        xCenter: r.xCenter,
        zCenter: r.zCenter,
        yCenter: r.yCenter,
        width: r.width,
        depth: r.depth,
        isBossRoom: r.isBossRoom,
        objects: roomObjLists[idx],
        loaded: false,
        cleared: false,
      })),
    };
  }

  public static getRoomIdAtPosition(pos: THREE.Vector3, rooms?: RoomInfo[]): number {
    if (!rooms || rooms.length === 0) return 1;

    for (const r of rooms) {
      const halfW = r.width / 2 + 1.5;
      const halfD = r.depth / 2 + 1.5;
      if (Math.abs(pos.x - r.xCenter) <= halfW && Math.abs(pos.z - r.zCenter) <= halfD) {
        return r.id;
      }
    }

    let closestRoomId = 1;
    let minDistSq = Infinity;
    for (const r of rooms) {
      const dx = pos.x - r.xCenter;
      const dz = pos.z - r.zCenter;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestRoomId = r.id;
      }
    }
    return closestRoomId;
  }

  // HELPER: RICH ROOM DECORATIONS ACCORDING TO BIOME & THEME
  private static decorateRoom(
    scene: THREE.Scene,
    room: { xCenter: number; zCenter: number; width: number; depth: number; isBossRoom: boolean },
    biomeIndex: number,
    markStatic: (obj: THREE.Object3D) => void,
    wallMat: THREE.Material,
    coverMat: THREE.Material,
    frameMat: THREE.Material,
    yFloor: number
  ) {
    if (room.isBossRoom) {
      // Boss Arena Light Towers & Banner Monuments
      [-room.width / 2.5, room.width / 2.5].forEach((xOff) => {
        const beaconGeo = ModelBuilder.getGeo('lg:CylinderGeometry:604f6e38ce5a', () => new THREE.CylinderGeometry(0.8, 1.2, 8.0, 8));
        const beaconMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:75e101f5d0c8', () => new THREE.MeshStandardMaterial({ color: 0x11111d, emissive: 0xff0044, emissiveIntensity: 0.6 })) as THREE.MeshStandardMaterial);
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(room.xCenter + xOff, yFloor + 4.0, room.zCenter - room.depth / 3);
        beacon.name = 'wall';
        markStatic(beacon);
        scene.add(beacon);

        const bLight = new THREE.PointLight(0xff0044, 4.5, 18);
        bLight.position.set(room.xCenter + xOff, yFloor + 7.5, room.zCenter - room.depth / 3);
        scene.add(bLight);
      });
      return;
    }

    if (biomeIndex === 0) {
      // 0. CYBER DATA CORE WING: Wall Diagnostics & Ambient Sector Lights
      const signBoard = new THREE.Mesh(
        ModelBuilder.getGeo('lg:BoxGeometry:9dca59e2b677', () => new THREE.BoxGeometry(8.0, 3.0, 0.4)),
        (ModelBuilder.getMaterial('lg:MeshStandardMaterial:d015cbdd33bd', () => new THREE.MeshStandardMaterial({ color: 0x001122, emissive: 0x00f0ff, emissiveIntensity: 0.8 })) as THREE.MeshStandardMaterial)
      );
      signBoard.position.set(room.xCenter + room.width / 2 - 0.3, yFloor + 6.0, room.zCenter);
      signBoard.rotation.y = -Math.PI / 2;
      markStatic(signBoard);
      scene.add(signBoard);

      const sectorLight = new THREE.PointLight(0x00f0ff, 3.0, 16);
      sectorLight.position.set(room.xCenter, yFloor + 8.0, room.zCenter);
      sectorLight.name = 'light';
      scene.add(sectorLight);
    } else if (biomeIndex === 1) {
      // 1. SUBWAY METRO CATACOMBS: Wall Route Maps & Fluorescent Overhead Lighting
      const mapBoard = LevelGenerator.createSubwayStationMap();
      mapBoard.position.set(room.xCenter + room.width / 2 - 0.3, yFloor + 4.5, room.zCenter);
      mapBoard.rotation.y = -Math.PI / 2;
      mapBoard.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (!child.name) child.name = 'wall';
          markStatic(child);
        }
      });
      scene.add(mapBoard);

      const lampGroup = LevelGenerator.createSubwayStationLamps();
      lampGroup.position.set(room.xCenter, yFloor + 12.0 - 0.3, room.zCenter);
      markStatic(lampGroup);
      scene.add(lampGroup);

      const sectorLight = new THREE.PointLight(0x38bdf8, 3.5, 22);
      sectorLight.position.set(room.xCenter, yFloor + 10.0, room.zCenter);
      sectorLight.name = 'light';
      scene.add(sectorLight);
    }
  }

  // =========================================================================
  // SUBWAY METRO 3D PROP BUILDERS
  // =========================================================================

  public static createSubwayBench(): THREE.Group {
    const group = new THREE.Group();
    const metalMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:59d1ed6c9dd4', () => new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 })) as THREE.MeshStandardMaterial);
    const woodMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:9240f790f9f6', () => new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 })) as THREE.MeshStandardMaterial);

    // Seat Slats (3 wooden slats)
    for (let s = 0; s < 3; s++) {
      const slat = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:e7628192e4cb', () => new THREE.BoxGeometry(2.6, 0.08, 0.18)), woodMat);
      slat.position.set(0, 0.45, -0.2 + s * 0.2);
      slat.name = 'wall';
      group.add(slat);
    }

    // Backrest Slats (2 wooden slats)
    for (let b = 0; b < 2; b++) {
      const slat = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:bad11b2e0e25', () => new THREE.BoxGeometry(2.6, 0.18, 0.08)), woodMat);
      slat.position.set(0, 0.8 + b * 0.22, -0.32);
      slat.name = 'wall';
      group.add(slat);
    }

    // Metal Legs & Armrests
    [-1.1, 1.1].forEach((x) => {
      const leg = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:c007adef08f3', () => new THREE.BoxGeometry(0.08, 0.9, 0.6)), metalMat);
      leg.position.set(x, 0.45, -0.1);
      leg.name = 'wall';
      group.add(leg);

      const arm = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:336a4b251113', () => new THREE.BoxGeometry(0.08, 0.08, 0.6)), metalMat);
      arm.position.set(x, 0.7, -0.1);
      group.add(arm);
    });

    return group;
  }

  public static createSubwayTicketMachine(): THREE.Group {
    const group = new THREE.Group();
    const bodyMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:6914d6584bd3', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 })) as THREE.MeshStandardMaterial);
    const screenMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:3e50f56826f8', () => new THREE.MeshBasicMaterial({ color: 0x0284c7 })) as THREE.MeshBasicMaterial);
    const yellowMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:a0c7b3bb894f', () => new THREE.MeshBasicMaterial({ color: 0xeab308 })) as THREE.MeshBasicMaterial);
    const slotMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:ce37606e0f7d', () => new THREE.MeshStandardMaterial({ color: 0x020617, metalness: 0.9 })) as THREE.MeshStandardMaterial);

    // Main Cabinet Body
    const body = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:bd1b936c0a90', () => new THREE.BoxGeometry(1.2, 2.2, 0.8)), bodyMat);
    body.position.y = 1.1;
    body.name = 'wall';
    group.add(body);

    // Screen
    const screen = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:d12fa49a0446', () => new THREE.BoxGeometry(0.9, 0.6, 0.04)), screenMat);
    screen.position.set(0, 1.45, 0.41);
    group.add(screen);

    // Keypad & Slot Panel
    const panel = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:089fee6170f6', () => new THREE.BoxGeometry(0.9, 0.4, 0.06)), slotMat);
    panel.position.set(0, 0.85, 0.41);
    group.add(panel);

    // Yellow Metro Header Bar
    const header = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:1a7de6a346d9', () => new THREE.BoxGeometry(1.1, 0.2, 0.82)), yellowMat);
    header.position.set(0, 2.05, 0);
    group.add(header);

    return group;
  }

  public static createSubwayTurnstile(): THREE.Group {
    const group = new THREE.Group();
    const stainlessMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:8c2e447b7b33', () => new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 })) as THREE.MeshStandardMaterial);
    const glassMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:69d457d643bf', () => new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5, roughness: 0.1 })) as THREE.MeshStandardMaterial);
    const greenLedMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:4f09535dfd0b', () => new THREE.MeshBasicMaterial({ color: 0x22c55e })) as THREE.MeshBasicMaterial);

    // Cabinet Base
    const cabinet = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:41068953a9ce', () => new THREE.BoxGeometry(0.5, 1.1, 1.4)), stainlessMat);
    cabinet.position.y = 0.55;
    cabinet.name = 'wall';
    group.add(cabinet);

    // Glass Flap Gate
    const gate = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:4ca27a5399a4', () => new THREE.BoxGeometry(0.04, 0.7, 0.8)), glassMat);
    gate.position.set(0.26, 0.65, 0);
    group.add(gate);

    // Status LED Indicator
    const indicator = new THREE.Mesh(ModelBuilder.getGeo('lg:SphereGeometry:9dd485d4993f', () => new THREE.SphereGeometry(0.06, 12, 12)), greenLedMat);
    indicator.position.set(0, 1.12, 0.5);
    group.add(indicator);

    return group;
  }

  public static createSubwayStationMap(): THREE.Group {
    const group = new THREE.Group();
    const frameMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:c0110c0c97b3', () => new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 })) as THREE.MeshStandardMaterial);
    const mapMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:5ea587275960', () => new THREE.MeshBasicMaterial({ color: 0xe0f2fe })) as THREE.MeshBasicMaterial);
    const line1Mat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:af7c1c8b4672', () => new THREE.MeshBasicMaterial({ color: 0xef4444 })) as THREE.MeshBasicMaterial);
    const line2Mat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:4231facfa509', () => new THREE.MeshBasicMaterial({ color: 0x3b82f6 })) as THREE.MeshBasicMaterial);
    const line3Mat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:4f09535dfd0b', () => new THREE.MeshBasicMaterial({ color: 0x22c55e })) as THREE.MeshBasicMaterial);

    // Outer Frame
    const frame = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:c2598695b58f', () => new THREE.BoxGeometry(3.6, 2.0, 0.12)), frameMat);
    frame.position.y = 1.0;
    frame.name = 'wall';
    group.add(frame);

    // Map Face
    const mapFace = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:346a2b9651c2', () => new THREE.BoxGeometry(3.4, 1.8, 0.04)), mapMat);
    mapFace.position.set(0, 1.0, 0.05);
    group.add(mapFace);

    // Colored Subway Line Strips
    const redLine = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:750e378f106a', () => new THREE.BoxGeometry(3.0, 0.08, 0.02)), line1Mat);
    redLine.position.set(0, 1.2, 0.08);
    redLine.rotation.z = 0.15;
    group.add(redLine);

    const blueLine = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:750e378f106a', () => new THREE.BoxGeometry(3.0, 0.08, 0.02)), line2Mat);
    blueLine.position.set(0, 0.8, 0.08);
    blueLine.rotation.z = -0.1;
    group.add(blueLine);

    const greenLine = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:eb465b1d6a9b', () => new THREE.BoxGeometry(2.4, 0.08, 0.02)), line3Mat);
    greenLine.position.set(-0.2, 1.0, 0.08);
    greenLine.rotation.z = 0.4;
    group.add(greenLine);

    return group;
  }

  public static createSubwayTrainCar(): THREE.Group {
    const group = new THREE.Group();

    // Materials
    const trainTexture = TextureGenerator.getSubwayTrainHullTexture();
    const trainBump = TextureGenerator.getSubwayTrainHullBumpTexture();

    const hullMat = new THREE.MeshStandardMaterial({
      map: trainTexture,
      bumpMap: trainBump,
      bumpScale: 0.12,
      metalness: 0.85,
      roughness: 0.35,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      map: trainTexture,
      bumpMap: trainBump,
      bumpScale: 0.08,
      metalness: 0.7,
      roughness: 0.5,
    });
    const blueStripeMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:06903b2e2cd6', () => new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.5, roughness: 0.4 })) as THREE.MeshStandardMaterial);
    const darkGlassMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:0e4be138ac01', () => new THREE.MeshStandardMaterial({ color: 0x0f172a, transparent: true, opacity: 0.7, roughness: 0.1 })) as THREE.MeshStandardMaterial);
    const brokenGlassMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:94a4b093cb37', () => new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.3, roughness: 0.2 })) as THREE.MeshStandardMaterial);
    const wheelMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:47e73004a27c', () => new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.95, roughness: 0.2 })) as THREE.MeshStandardMaterial);
    const steelMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:8c2e447b7b33', () => new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 })) as THREE.MeshStandardMaterial);
    const seatMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:d2ad26fd602a', () => new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.6 })) as THREE.MeshStandardMaterial);
    const interiorFloorMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:a075968c33a5', () => new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.8 })) as THREE.MeshStandardMaterial);
    const ventMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:4c634c9a44b5', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 })) as THREE.MeshStandardMaterial);
    const headlightMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:bedf43e5bd24', () => new THREE.MeshBasicMaterial({ color: 0xfef08a })) as THREE.MeshBasicMaterial);
    const emergencyLightMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:af7c1c8b4672', () => new THREE.MeshBasicMaterial({ color: 0xef4444 })) as THREE.MeshBasicMaterial);
    const rustMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:ecd41ed1770b', () => new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 })) as THREE.MeshStandardMaterial);
    const debrisMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:948d56639ac3', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })) as THREE.MeshStandardMaterial);

    // --- 1. DERAILMENT POSTURE (Slight roll & pitch) ---
    group.rotation.z = 0.08; // Derailed side tilt
    group.rotation.x = -0.03; // Nose dipped forward

    // --- 2. MAIN CARRIAGE HULL & ROOF ---
    // Outer Shell (Width: 3.4, Height: 3.2, Length: 10.0)
    const hull = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:1d1e32575487', () => new THREE.BoxGeometry(3.4, 3.2, 10.0)), hullMat);
    hull.position.y = 1.8;
    hull.name = 'wall';
    group.add(hull);

    // Corrugated Roof Panel
    const roof = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:31a9643e67c8', () => new THREE.BoxGeometry(3.2, 0.3, 9.8)), roofMat);
    roof.position.y = 3.45;
    group.add(roof);

    // Roof Ribs (5 corrugated ridges along top)
    for (let r = -4.0; r <= 4.0; r += 2.0) {
      const rib = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:524f82e48f63', () => new THREE.BoxGeometry(3.0, 0.1, 0.2)), ventMat);
      rib.position.set(0, 3.6, r);
      group.add(rib);
    }

    // HVAC Air Conditioning Units on Roof
    [-2.2, 2.2].forEach((z) => {
      const hvac = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:65480828af08', () => new THREE.BoxGeometry(2.2, 0.45, 1.8)), ventMat);
      hvac.position.set(0, 3.8, z);
      group.add(hvac);

      // HVAC Vent Grills
      const grill = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:c56ebf7ba6ff', () => new THREE.BoxGeometry(1.8, 0.08, 1.4)), rustMat);
      grill.position.set(0, 4.05, z);
      group.add(grill);
    });

    // Severed Pantograph Power Collector Arm
    const pantoBase = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:1e3b71801888', () => new THREE.BoxGeometry(0.8, 0.2, 0.8)), steelMat);
    pantoBase.position.set(0, 3.7, 0);
    group.add(pantoBase);

    const pantoArm = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:8dd801c7dbe8', () => new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8)), steelMat);
    pantoArm.rotation.z = Math.PI / 4;
    pantoArm.rotation.x = 0.3;
    pantoArm.position.set(0.4, 4.3, 0.2);
    group.add(pantoArm);

    // --- 3. METRO SIDE STRIPES, DOORS & WINDOWS ---
    [-1.71, 1.71].forEach((x) => {
      const isLeftSide = x < 0;

      // Blue Line Accent Stripe
      const stripe = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:c5cffc8ff27c', () => new THREE.BoxGeometry(0.02, 0.4, 9.8)), blueStripeMat);
      stripe.position.set(x, 1.6, 0);
      group.add(stripe);

      // Windows
      for (let w = -3.8; w <= 3.8; w += 1.8) {
        // Skip window slot where jammed door sits
        if (Math.abs(w) < 0.6) continue;

        // Randomly make some windows shattered/broken
        const isSmashed = Math.abs(w) > 3.0 && isLeftSide;
        const windowMesh = new THREE.Mesh(
          ModelBuilder.getGeo('lg:BoxGeometry:89c802ce0c18', () => new THREE.BoxGeometry(0.04, 0.9, 1.1)),
          isSmashed ? brokenGlassMat : darkGlassMat
        );
        windowMesh.position.set(x * 1.01, 2.2, w);
        group.add(windowMesh);

        // Window Frame
        const frame = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:9aec42f5d976', () => new THREE.BoxGeometry(0.06, 0.96, 1.16)), steelMat);
        frame.position.set(x * 1.005, 2.2, w);
        group.add(frame);
      }

      // Jammed Sliding Doors (Center of carriage)
      const door1 = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:0d6a4121606a', () => new THREE.BoxGeometry(0.06, 2.2, 0.7)), steelMat);
      door1.position.set(x * 1.01, 1.5, -0.45);
      group.add(door1);

      const door2 = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:0d6a4121606a', () => new THREE.BoxGeometry(0.06, 2.2, 0.7)), steelMat);
      // On left side, door 2 is jammed open (pushed inward and sideways)
      if (isLeftSide) {
        door2.position.set(x * 0.85, 1.5, 0.5);
        door2.rotation.y = 0.25; // Bent off track
      } else {
        door2.position.set(x * 1.01, 1.5, 0.25);
      }
      group.add(door2);
    });

    // --- 4. INTERIOR PASSENGER CABIN & EMERGENCY LIGHTING ---
    // Interior Floor
    const intFloor = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:48f9de6b891d', () => new THREE.BoxGeometry(3.0, 0.05, 9.2)), interiorFloorMat);
    intFloor.position.set(0, 0.28, 0);
    group.add(intFloor);

    // Passenger Bench Seats along walls
    [-1.2, 1.2].forEach((sx) => {
      for (let sz = -3.2; sz <= 3.2; sz += 2.2) {
        if (Math.abs(sz) < 0.8) continue; // Doorway aisle clearance

        const seat = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:041d45b83e55', () => new THREE.BoxGeometry(0.6, 0.45, 1.6)), seatMat);
        seat.position.set(sx, 0.55, sz);
        group.add(seat);

        const seatBack = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:08c203acccd6', () => new THREE.BoxGeometry(0.12, 0.7, 1.6)), seatMat);
        seatBack.position.set(sx > 0 ? sx + 0.28 : sx - 0.28, 0.9, sz);
        group.add(seatBack);
      }
    });

    // Stainless Steel Handrail Stanchions / Grab Poles
    [-0.6, 0.6].forEach((hx) => {
      for (let hz = -3.5; hz <= 3.5; hz += 3.5) {
        const pole = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:15c0d65a8d63', () => new THREE.CylinderGeometry(0.03, 0.03, 2.8, 8)), steelMat);
        pole.position.set(hx, 1.7, hz);
        group.add(pole);
      }

      // Horizontal Ceiling Grab Rail
      const topRail = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:ef78c18d3aae', () => new THREE.CylinderGeometry(0.025, 0.025, 8.5, 8)), steelMat);
      topRail.rotation.x = Math.PI / 2;
      topRail.position.set(hx, 2.9, 0);
      group.add(topRail);
    });

    // Ominous Red Emergency Alert Beacon Light Inside Carriage
    const interiorBeacon = new THREE.Mesh(ModelBuilder.getGeo('lg:SphereGeometry:838dd79f7c8c', () => new THREE.SphereGeometry(0.12, 12, 12)), emergencyLightMat);
    interiorBeacon.position.set(0, 3.1, -1.0);
    group.add(interiorBeacon);

    const intPointLight = new THREE.PointLight(0xef4444, 4.0, 14);
    intPointLight.position.set(0, 2.8, -1.0);
    group.add(intPointLight);

    // --- 5. FRONT CAB CABIN & HEADLIGHTS ---
    // Sloped Front Nose Window Frame
    const noseWin = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:04a4287ca59f', () => new THREE.BoxGeometry(3.0, 1.2, 0.1)), darkGlassMat);
    noseWin.position.set(0, 2.2, 5.01);
    noseWin.rotation.x = -0.15;
    group.add(noseWin);

    // Headlights (One working beam, one smashed/off)
    const head1 = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:6a04b7df135f', () => new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12)), headlightMat);
    head1.rotation.x = Math.PI / 2;
    head1.position.set(-0.9, 1.2, 5.03);
    group.add(head1);

    const head1Light = new THREE.PointLight(0xfef08a, 3.5, 18);
    head1Light.position.set(-0.9, 1.2, 5.5);
    group.add(head1Light);

    const head2 = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:6a04b7df135f', () => new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12)), rustMat);
    head2.rotation.x = Math.PI / 2;
    head2.rotation.z = 0.4; // Broken fitting
    head2.position.set(0.9, 1.2, 5.03);
    group.add(head2);

    // --- 6. DERAILED BOGIES, TWISTED RAILS & CONCRETE DEBRIS ---
    // Derailed Wheel Bogies under train
    [-3.2, 3.2].forEach((z) => {
      const bogie = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:41a3d7a41c49', () => new THREE.BoxGeometry(2.8, 0.5, 1.8)), wheelMat);
      bogie.position.set(z === 3.2 ? 0.3 : -0.2, 0.25, z); // Off-center derailed position
      bogie.rotation.y = z === 3.2 ? 0.2 : -0.15; // Twisted wheel axis
      bogie.name = 'wall';
      group.add(bogie);

      // Heavy Steel Train Wheels
      [-1.1, 1.1].forEach((wx) => {
        [-0.6, 0.6].forEach((wz) => {
          const wheel = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:f3ad1fa8cd3c', () => new THREE.CylinderGeometry(0.38, 0.38, 0.12, 16)), steelMat);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(bogie.position.x + wx, 0.25, z + wz);
          group.add(wheel);
        });
      });
    });

    // Twisted Metallic Rail Tracks Ripped Up under carriage
    for (let t = -4.5; t <= 4.5; t += 3.0) {
      const railSegment = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:8443033b0c1a', () => new THREE.BoxGeometry(0.12, 0.12, 3.2)), steelMat);
      railSegment.position.set(-1.1 + Math.sin(t) * 0.4, 0.08, t);
      railSegment.rotation.y = Math.sin(t) * 0.3;
      railSegment.rotation.z = 0.1;
      group.add(railSegment);
    }

    // Concrete Impact Rubble / Debris Rocks scattered underneath
    const rubbleCoords = [
      { x: -1.8, z: 2.5, s: 0.7 },
      { x: -2.0, z: -1.0, s: 0.9 },
      { x: 1.6, z: 4.2, s: 0.8 },
      { x: 2.1, z: -3.0, s: 0.6 },
      { x: -1.2, z: -4.8, s: 0.85 },
    ];
    rubbleCoords.forEach((r) => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 * r.s, 0), debrisMat);
      rock.position.set(r.x, 0.2 * r.s, r.z);
      rock.rotation.set(r.x, r.z, r.s);
      rock.name = 'wall';
      group.add(rock);
    });

    return group;
  }

  public static createSubwayPlatformPillar(): THREE.Group {
    const group = new THREE.Group();
    const pillarMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:baec3c3b665e', () => new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 })) as THREE.MeshStandardMaterial);
    const tileCapMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:b481172f6648', () => new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.3, roughness: 0.4 })) as THREE.MeshStandardMaterial);

    // Main Pillar Body
    const body = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:097d0dc4cdc9', () => new THREE.BoxGeometry(1.2, 5.0, 1.2)), pillarMat);
    body.position.y = 2.5;
    body.name = 'wall';
    group.add(body);

    // Blue Station Tile Accent Band
    const band = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:bcaa3a7fc353', () => new THREE.BoxGeometry(1.26, 0.8, 1.26)), tileCapMat);
    band.position.y = 3.5;
    group.add(band);

    return group;
  }

  public static createSubwayTrashBin(): THREE.Group {
    const group = new THREE.Group();
    const steelMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:d7c8453261c8', () => new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.3 })) as THREE.MeshStandardMaterial);
    const topMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:9bc96d4a8e32', () => new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 })) as THREE.MeshStandardMaterial);

    const bin = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:62196d463529', () => new THREE.CylinderGeometry(0.35, 0.35, 0.9, 16)), steelMat);
    bin.position.y = 0.45;
    bin.name = 'wall';
    group.add(bin);

    const lid = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:e8360909d699', () => new THREE.CylinderGeometry(0.37, 0.37, 0.1, 16)), topMat);
    lid.position.y = 0.92;
    group.add(lid);

    return group;
  }

  public static createSubwayStationLamps(): THREE.Group {
    const group = new THREE.Group();
    const frameMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:c0110c0c97b3', () => new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 })) as THREE.MeshStandardMaterial);
    const lampMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:5ea587275960', () => new THREE.MeshBasicMaterial({ color: 0xe0f2fe })) as THREE.MeshBasicMaterial);

    const fixture = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:8a93af7ca376', () => new THREE.BoxGeometry(3.0, 0.15, 0.4)), frameMat);
    fixture.position.y = 0;
    group.add(fixture);

    const tube = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:9e4aa88ef4af', () => new THREE.CylinderGeometry(0.06, 0.06, 2.8, 12)), lampMat);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, -0.08, 0);
    group.add(tube);

    return group;
  }

  // =========================================================================
  // HYPER-DETAILED 3D PROP BUILDERS (Consisting of dozens of sub-components)
  // =========================================================================

  public static createUltraDetailedLabWorkstation(): THREE.Group {
    return LevelGenerator.createUltraDetailedWorkstation();
  }

  public static createUltraDetailedServerRack(): THREE.Group {
    const group = new THREE.Group();

    const bodyMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:ce085c54b213', () => new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.85 })) as THREE.MeshStandardMaterial);
    const frameMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:4b14f73fef94', () => new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.75 })) as THREE.MeshStandardMaterial);
    const glassDoorMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:75eaf54582b7', () => new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35, roughness: 0.1 })) as THREE.MeshStandardMaterial);
    const ledGreenMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:4f09535dfd0b', () => new THREE.MeshBasicMaterial({ color: 0x22c55e })) as THREE.MeshBasicMaterial);
    const ledCyanMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:2f6ef22c47d8', () => new THREE.MeshBasicMaterial({ color: 0x00f0ff })) as THREE.MeshBasicMaterial);
    const ledRedMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:af7c1c8b4672', () => new THREE.MeshBasicMaterial({ color: 0xef4444 })) as THREE.MeshBasicMaterial);

    // Main Tower Casing (W: 1.8, H: 3.6, D: 1.2)
    const tower = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:36f3f51f965a', () => new THREE.BoxGeometry(1.8, 3.6, 1.2)), bodyMat);
    tower.position.y = 1.8;
    tower.name = 'wall';
    group.add(tower);

    // Frame Borders
    const frontFrame = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:c07e1aac3569', () => new THREE.BoxGeometry(1.84, 3.64, 0.1)), frameMat);
    frontFrame.position.set(0, 1.8, 0.58);
    group.add(frontFrame);

    // Front Glass Door
    const glassDoor = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:8c8f08e7ff72', () => new THREE.BoxGeometry(1.7, 3.5, 0.04)), glassDoorMat);
    glassDoor.position.set(0, 1.8, 0.62);
    group.add(glassDoor);

    // 8 Server Blade Rack Modules inside
    for (let i = 0; i < 8; i++) {
      const bladeY = 0.4 + i * 0.42;

      const blade = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:e07dd10aabd2', () => new THREE.BoxGeometry(1.6, 0.35, 1.0)), frameMat);
      blade.position.set(0, bladeY, 0.05);
      group.add(blade);

      // Server LEDs
      const greenLed = new THREE.Mesh(ModelBuilder.getGeo('lg:SphereGeometry:81d3652f90e5', () => new THREE.SphereGeometry(0.04, 8, 8)), ledGreenMat);
      greenLed.position.set(-0.7, bladeY, 0.58);
      group.add(greenLed);

      const cyanLed = new THREE.Mesh(ModelBuilder.getGeo('lg:SphereGeometry:81d3652f90e5', () => new THREE.SphereGeometry(0.04, 8, 8)), ledCyanMat);
      cyanLed.position.set(-0.58, bladeY, 0.58);
      group.add(cyanLed);

      if (i % 3 === 0) {
        const redLed = new THREE.Mesh(ModelBuilder.getGeo('lg:SphereGeometry:81d3652f90e5', () => new THREE.SphereGeometry(0.04, 8, 8)), ledRedMat);
        redLed.position.set(-0.46, bladeY, 0.58);
        group.add(redLed);
      }
    }

    // Top Exhaust Fan Grille
    const fanGrille = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:395d3e6804ee', () => new THREE.CylinderGeometry(0.4, 0.4, 0.08, 16)), frameMat);
    fanGrille.position.set(0, 3.64, 0);
    group.add(fanGrille);

    return group;
  }

  public static createUltraDetailedControlConsole(): THREE.Group {
    const group = new THREE.Group();

    const bodyMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:f2d27d021b9c', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.8 })) as THREE.MeshStandardMaterial);
    const screenMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:2f6ef22c47d8', () => new THREE.MeshBasicMaterial({ color: 0x00f0ff })) as THREE.MeshBasicMaterial);
    const buttonRed = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:af7c1c8b4672', () => new THREE.MeshBasicMaterial({ color: 0xef4444 })) as THREE.MeshBasicMaterial);
    const buttonYellow = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:d1cb19c772e3', () => new THREE.MeshBasicMaterial({ color: 0xf59e0b })) as THREE.MeshBasicMaterial);
    const buttonGreen = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:4f09535dfd0b', () => new THREE.MeshBasicMaterial({ color: 0x22c55e })) as THREE.MeshBasicMaterial);

    // Base Desk Unit
    const baseDesk = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:96d05044bb77', () => new THREE.BoxGeometry(2.4, 1.1, 1.2)), bodyMat);
    baseDesk.position.y = 0.55;
    baseDesk.name = 'wall';
    group.add(baseDesk);

    // Angled Monitor Panel
    const monitorPanel = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:de254311e659', () => new THREE.BoxGeometry(2.2, 0.9, 0.2)), bodyMat);
    monitorPanel.position.set(0, 1.45, -0.3);
    monitorPanel.rotation.x = -0.35;
    group.add(monitorPanel);

    // Main Display Screen
    const screen = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:f59c0f55823f', () => new THREE.BoxGeometry(2.0, 0.75, 0.05)), screenMat);
    screen.position.set(0, 1.48, -0.22);
    screen.rotation.x = -0.35;
    group.add(screen);

    // Keypads & Control Switches
    for (let b = 0; b < 6; b++) {
      const mat = b % 3 === 0 ? buttonRed : (b % 3 === 1 ? buttonYellow : buttonGreen);
      const btn = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:f25a77cd3c35', () => new THREE.BoxGeometry(0.12, 0.05, 0.12)), mat);
      btn.position.set(-0.8 + b * 0.3, 1.12, 0.2);
      group.add(btn);
    }

    return group;
  }

  public static createUltraDetailedEquipmentLocker(): THREE.Group {
    const group = new THREE.Group();

    const bodyMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:6ab60ffe21e1', () => new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.8 })) as THREE.MeshStandardMaterial);
    const doorMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:1c3ed8449e57', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.85 })) as THREE.MeshStandardMaterial);
    const lockMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:4f09535dfd0b', () => new THREE.MeshBasicMaterial({ color: 0x22c55e })) as THREE.MeshBasicMaterial);

    // Main Cabinet
    const locker = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:213cec46afbe', () => new THREE.BoxGeometry(1.6, 2.8, 0.9)), bodyMat);
    locker.position.y = 1.4;
    locker.name = 'wall';
    group.add(locker);

    // Dual Doors
    [-0.38, 0.38].forEach((xOff) => {
      const door = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:aa218499659b', () => new THREE.BoxGeometry(0.72, 2.6, 0.05)), doorMat);
      door.position.set(xOff, 1.4, 0.46);
      group.add(door);
    });

    // Magnetic Keypad Lock
    const lockLight = new THREE.Mesh(ModelBuilder.getGeo('lg:SphereGeometry:67a3fd06ca5c', () => new THREE.SphereGeometry(0.05, 8, 8)), lockMat);
    lockLight.position.set(0, 1.6, 0.5);
    group.add(lockLight);

    return group;
  }

  public static createUltraDetailedBioStorage(): THREE.Group {
    const group = new THREE.Group();

    const palletMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:e3f4f194c9c9', () => new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 })) as THREE.MeshStandardMaterial);

    // Wooden Pallet Base
    const pallet = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:6abd081bf4dc', () => new THREE.BoxGeometry(2.2, 0.2, 2.2)), palletMat);
    pallet.position.y = 0.1;
    pallet.name = 'wall';
    group.add(pallet);

    // 2 Biohazard Barrels on top
    [-0.5, 0.5].forEach((xOff) => {
      const barrel = LevelGenerator.createUltraDetailedBiohazardBarrel();
      barrel.position.set(xOff, 0.2 + 0.7, 0);
      group.add(barrel);
    });

    return group;
  }

  public static createUltraDetailedWorkstation(): THREE.Group {
    const group = new THREE.Group();

    // Materials
    const steelMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:3e2b3aaadf17', () => new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.25 })) as THREE.MeshStandardMaterial);
    const darkSteelMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:e5c180602e10', () => new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 })) as THREE.MeshStandardMaterial);
    const chromeMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:ec3dccf0c49b', () => new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.95, roughness: 0.1 })) as THREE.MeshStandardMaterial);
    const pcCaseMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:8934979f78bb', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 })) as THREE.MeshStandardMaterial);
    const pcbMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:bcdb63f89a0d', () => new THREE.MeshStandardMaterial({ color: 0x15803d, metalness: 0.3, roughness: 0.5 })) as THREE.MeshStandardMaterial); // Green motherboard
    const screenMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:4f09535dfd0b', () => new THREE.MeshBasicMaterial({ color: 0x22c55e })) as THREE.MeshBasicMaterial); // Glowing matrix code screen
    const paperMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:f309cb922679', () => new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 })) as THREE.MeshStandardMaterial);
    const copperWireMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:36bb3dea01c4', () => new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 })) as THREE.MeshStandardMaterial);

    // 1. Table Frame Assembly (12 sub-parts)
    const topPlate = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:4c73eccf52dc', () => new THREE.BoxGeometry(3.0, 0.12, 1.6)), steelMat);
    topPlate.position.set(0, 0, 0);
    group.add(topPlate);

    const topBevel = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:ef431ab597fc', () => new THREE.BoxGeometry(3.08, 0.04, 1.68)), darkSteelMat);
    topBevel.position.set(0, 0.04, 0);
    group.add(topBevel);

    // Cable grommet hole
    const grommet = new THREE.Mesh(ModelBuilder.getGeo('lg:TorusGeometry:d1ba2c30581e', () => new THREE.TorusGeometry(0.08, 0.02, 8, 16)), chromeMat);
    grommet.rotation.x = Math.PI / 2;
    grommet.position.set(1.1, 0.07, -0.5);
    group.add(grommet);

    // 4 Tubular legs with foot pads
    const legPositions = [
      [-1.3, -0.6, -0.6], [1.3, -0.6, -0.6],
      [-1.3, -0.6, 0.6], [1.3, -0.6, 0.6]
    ];
    legPositions.forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:c8471101b8b6', () => new THREE.CylinderGeometry(0.06, 0.06, 1.15, 12)), steelMat);
      leg.position.set(lx, ly, lz);
      group.add(leg);

      const foot = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:695bf13f0f5c', () => new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12)), darkSteelMat);
      foot.position.set(lx, ly - 0.58, lz);
      group.add(foot);
    });

    // Cross brace support bar under desk
    const brace = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:804fc2bd92f1', () => new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8)), chromeMat);
    brace.rotation.z = Math.PI / 2;
    brace.position.set(0, -0.5, -0.5);
    group.add(brace);

    // Wire tray basket under desk
    const tray = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:9543a9d917e6', () => new THREE.BoxGeometry(2.0, 0.1, 0.3)), darkSteelMat);
    tray.position.set(0, -0.15, -0.6);
    group.add(tray);

    // Coiled cable wire hanging from tray
    for (let w = 0; w < 3; w++) {
      const wire = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:1c93c17e2c07', () => new THREE.CylinderGeometry(0.015, 0.015, 0.8, 6)), copperWireMat);
      wire.position.set(-0.5 + w * 0.5, -0.5, -0.6);
      wire.rotation.set(0.2, 0, 0.3 * (w - 1));
      group.add(wire);
    }

    // 2. Computer Tower Chassis (10 sub-parts)
    const pcGroup = new THREE.Group();
    pcGroup.position.set(0.9, 0.4, 0.1);

    const pcCase = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:580a02bcc477', () => new THREE.BoxGeometry(0.5, 0.7, 0.8)), pcCaseMat);
    pcGroup.add(pcCase);

    // Motherboard PCB inside
    const mobo = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:b794f0fd9952', () => new THREE.BoxGeometry(0.04, 0.55, 0.65)), pcbMat);
    mobo.position.set(-0.2, 0, 0);
    pcGroup.add(mobo);

    // CPU cooler heatsink tower block
    const cooler = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:fac59a0c4a44', () => new THREE.BoxGeometry(0.18, 0.18, 0.18)), chromeMat);
    cooler.position.set(-0.08, 0.1, 0);
    pcGroup.add(cooler);

    // Power supply unit box
    const psu = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:868e5ec5791e', () => new THREE.BoxGeometry(0.42, 0.22, 0.3)), darkSteelMat);
    psu.position.set(0, -0.2, -0.2);
    pcGroup.add(psu);

    // Detached side panel popped off onto desk
    const sidePanel = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:b0d3ab10d9a1', () => new THREE.BoxGeometry(0.02, 0.68, 0.78)), chromeMat);
    sidePanel.position.set(-0.5, -0.1, 0.2);
    sidePanel.rotation.set(0.1, 0, 0.3);
    pcGroup.add(sidePanel);

    group.add(pcGroup);

    // 3. Monitor Workstation Setup (8 sub-parts)
    const monGroup = new THREE.Group();
    monGroup.position.set(-0.4, 0.45, -0.1);

    const monBase = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:4b608a8f44dd', () => new THREE.CylinderGeometry(0.25, 0.28, 0.04, 12)), darkSteelMat);
    monGroup.add(monBase);

    const monArm = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:e79e48a22ff2', () => new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8)), chromeMat);
    monArm.position.set(0, 0.25, -0.1);
    monArm.rotation.x = -0.2;
    monGroup.add(monArm);

    const monBody = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:148f49567bd0', () => new THREE.BoxGeometry(1.1, 0.75, 0.12)), pcCaseMat);
    monBody.position.set(0, 0.5, -0.15);
    monGroup.add(monBody);

    const monScreen = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:619224528393', () => new THREE.BoxGeometry(1.0, 0.66, 0.02)), screenMat);
    monScreen.position.set(0, 0.5, -0.08);
    monGroup.add(monScreen);

    group.add(monGroup);

    // 4. Mechanical Keyboard & Keycap Debris (15 sub-parts)
    const kbBase = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:010f977350a5', () => new THREE.BoxGeometry(0.8, 0.04, 0.3)), darkSteelMat);
    kbBase.position.set(-0.4, 0.08, 0.3);
    kbBase.rotation.y = -0.1;
    group.add(kbBase);

    for (let k = 0; k < 12; k++) {
      const keycap = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:6ea75f2697fe', () => new THREE.BoxGeometry(0.035, 0.03, 0.035)), chromeMat);
      keycap.position.set(
        -0.7 + Math.random() * 0.6,
        0.08 + Math.random() * 0.02,
        0.2 + Math.random() * 0.4
      );
      keycap.rotation.set(Math.random() * 0.5, Math.random() * 3, Math.random() * 0.5);
      group.add(keycap);
    }

    // 5. Scattered Lab Paper Sheets
    for (let p = 0; p < 5; p++) {
      const paper = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:bb43aee61dbd', () => new THREE.BoxGeometry(0.25, 0.005, 0.35)), paperMat);
      paper.position.set(-1.0 + Math.random() * 1.5, 0.07, -0.3 + Math.random() * 0.8);
      paper.rotation.y = Math.random() * Math.PI * 2;
      group.add(paper);
    }

    return group;
  }

  public static createUltraDetailedCryoTank(): THREE.Group {
    const group = new THREE.Group();

    const octMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:05f1f88c3e13', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.2 })) as THREE.MeshStandardMaterial);
    const chromeMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:fa07e6765c56', () => new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.95, roughness: 0.1 })) as THREE.MeshStandardMaterial);
    const warningYellowMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:c62bcf882f66', () => new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 })) as THREE.MeshStandardMaterial);
    // PERF: no `transmission` here. A transmissive material forces three.js to render the
    // ENTIRE opaque scene a second time each frame into a full-res multisampled render
    // target (+ mipmap chain) whenever any of these ~114 glass meshes is on screen. With
    // no envMap in the game, plain alpha transparency looks near-identical at a fraction
    // of the cost.
    const glassMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:f5de23d18db8', () => new THREE.MeshStandardMaterial({
      color: 0x86efac,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
    })) as THREE.MeshStandardMaterial);
    const slimeMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:4f09535dfd0b', () => new THREE.MeshBasicMaterial({ color: 0x22c55e })) as THREE.MeshBasicMaterial);
    const bubbleMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:a63f816f5076', () => new THREE.MeshBasicMaterial({ color: 0xbbf7d0 })) as THREE.MeshBasicMaterial);
    const dialFaceMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:af7c1c8b4672', () => new THREE.MeshBasicMaterial({ color: 0xef4444 })) as THREE.MeshBasicMaterial);

    // 1. Heavy Octagonal Base Pedestal (8 sub-parts)
    const basePedestal = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:f7291b426b84', () => new THREE.CylinderGeometry(1.2, 1.4, 0.5, 8)), octMat);
    basePedestal.position.set(0, 0.25, 0);
    group.add(basePedestal);

    const baseRim = new THREE.Mesh(ModelBuilder.getGeo('lg:TorusGeometry:ffd64fa4dec6', () => new THREE.TorusGeometry(1.25, 0.08, 8, 16)), warningYellowMat);
    baseRim.rotation.x = Math.PI / 2;
    baseRim.position.set(0, 0.45, 0);
    group.add(baseRim);

    // 4 Hydraulic Shock Absorber Pistons
    for (let h = 0; h < 4; h++) {
      const angle = (h / 4) * Math.PI * 2;
      const px = Math.cos(angle) * 1.0;
      const pz = Math.sin(angle) * 1.0;

      const piston = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:0bb7fdc8512a', () => new THREE.CylinderGeometry(0.08, 0.08, 0.6, 12)), chromeMat);
      piston.position.set(px, 0.4, pz);
      group.add(piston);
    }

    // Pressure Control Manifold with Gauge Dials
    const manifold = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:f4f36dff32d6', () => new THREE.BoxGeometry(0.4, 0.3, 0.2)), octMat);
    manifold.position.set(0, 0.4, 1.25);
    group.add(manifold);

    for (let g = 0; g < 3; g++) {
      const dial = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:bd1cd11f1695', () => new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12)), dialFaceMat);
      dial.rotation.x = Math.PI / 2;
      dial.position.set(-0.12 + g * 0.12, 0.45, 1.36);
      group.add(dial);
    }

    // 2. Shattered Glass Vessel & 18 Glass Shards
    const glassHull = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:d9ee38c680f5', () => new THREE.CylinderGeometry(0.9, 0.9, 2.2, 16, 1, true)), glassMat);
    glassHull.position.set(0, 1.6, 0);
    group.add(glassHull);

    const topCap = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:7f3eeb19e942', () => new THREE.CylinderGeometry(0.95, 1.05, 0.4, 12)), octMat);
    topCap.position.set(0, 2.8, 0);
    group.add(topCap);

    for (let s = 0; s < 18; s++) {
      const shardAngle = Math.random() * Math.PI * 2;
      const shardDist = 0.8 + Math.random() * 1.6;
      const sx = Math.cos(shardAngle) * shardDist;
      const sz = Math.sin(shardAngle) * shardDist;

      const shardGeo = new THREE.ConeGeometry(0.1 + Math.random() * 0.25, 0.2 + Math.random() * 0.4, 3);
      const shard = new THREE.Mesh(shardGeo, glassMat);
      shard.position.set(sx, 0.05 + Math.random() * 0.1, sz);
      shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      group.add(shard);
    }

    // 3. Toxic Slime Pool & 25 3D Mutagen Bubbles
    const slimePool = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:55f68e9c87ed', () => new THREE.CylinderGeometry(2.8, 2.8, 0.03, 24)), slimeMat);
    slimePool.position.set(0, 0.015, 0);
    group.add(slimePool);

    for (let b = 0; b < 25; b++) {
      const bAngle = Math.random() * Math.PI * 2;
      const bDist = Math.random() * 2.4;
      const bx = Math.cos(bAngle) * bDist;
      const bz = Math.sin(bAngle) * bDist;
      const br = 0.04 + Math.random() * 0.12;

      const bubble = new THREE.Mesh(new THREE.SphereGeometry(br, 8, 8), bubbleMat);
      bubble.position.set(bx, 0.02 + br * 0.5, bz);
      group.add(bubble);
    }

    // 4. Snake-Coiled Fluid Pressure Hoses
    for (let h = 0; h < 2; h++) {
      const hose = new THREE.Mesh(new THREE.TorusGeometry(1.5 + h * 0.4, 0.05, 8, 24, Math.PI * 1.2), chromeMat);
      hose.rotation.x = Math.PI / 2;
      hose.position.set(0.2 * h, 0.06, 0.3);
      group.add(hose);
    }

    return group;
  }

  public static createUltraDetailedBiohazardBarrel(): THREE.Group {
    const group = new THREE.Group();

    const barrelMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:01f357c15eae', () => new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45, metalness: 0.65 })) as THREE.MeshStandardMaterial);
    const rimMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:e5c180602e10', () => new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 })) as THREE.MeshStandardMaterial);
    const labelMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:af7c1c8b4672', () => new THREE.MeshBasicMaterial({ color: 0xef4444 })) as THREE.MeshBasicMaterial);

    const body = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:3b7389f2f364', () => new THREE.CylinderGeometry(0.55, 0.55, 1.4, 18)), barrelMat);
    group.add(body);

    [-0.4, 0, 0.4].forEach((yOff) => {
      const ring = new THREE.Mesh(ModelBuilder.getGeo('lg:TorusGeometry:02c880c338c1', () => new THREE.TorusGeometry(0.57, 0.03, 8, 20)), rimMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, yOff, 0);
      group.add(ring);
    });

    const topRim = new THREE.Mesh(ModelBuilder.getGeo('lg:TorusGeometry:bbdbdddf7892', () => new THREE.TorusGeometry(0.56, 0.04, 8, 20)), rimMat);
    topRim.rotation.x = Math.PI / 2;
    topRim.position.set(0, 0.7, 0);
    group.add(topRim);

    for (let c = 0; c < 2; c++) {
      const cap = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:c57b0078cd59', () => new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10)), rimMat);
      cap.position.set(-0.2 + c * 0.4, 0.72, 0);
      group.add(cap);
    }

    const label = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:60f47c09e086', () => new THREE.BoxGeometry(0.4, 0.3, 0.02)), labelMat);
    label.position.set(0, 0.1, 0.55);
    group.add(label);

    return group;
  }

  public static createUltraDetailedCeilingFixture(): THREE.Group {
    const group = new THREE.Group();

    const fixtureMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:05093779d574', () => new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 })) as THREE.MeshStandardMaterial);
    const tubeMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:bedf43e5bd24', () => new THREE.MeshBasicMaterial({ color: 0xfef08a })) as THREE.MeshBasicMaterial);
    const wireMat1 = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:c349b3f4ab6a', () => new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.9, roughness: 0.1 })) as THREE.MeshStandardMaterial);
    const wireMat2 = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:f2f62050fdd1', () => new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.9, roughness: 0.1 })) as THREE.MeshStandardMaterial);
    const wireMat3 = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:22362d77694f', () => new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.1 })) as THREE.MeshStandardMaterial);

    const housing = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:aab6a9d1e0e1', () => new THREE.BoxGeometry(2.4, 0.15, 0.8)), fixtureMat);
    group.add(housing);

    const tube1 = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:008e850bcecc', () => new THREE.CylinderGeometry(0.04, 0.04, 2.2, 12)), tubeMat);
    tube1.rotation.z = Math.PI / 2;
    tube1.position.set(0, -0.1, -0.2);
    group.add(tube1);

    const tube2 = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:008e850bcecc', () => new THREE.CylinderGeometry(0.04, 0.04, 2.2, 12)), tubeMat);
    tube2.rotation.z = Math.PI / 2 - 0.5;
    tube2.position.set(0.3, -0.6, 0.2);
    group.add(tube2);

    for (let w = 0; w < 8; w++) {
      const mat = w % 3 === 0 ? wireMat1 : (w % 3 === 1 ? wireMat2 : wireMat3);
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8 + Math.random() * 1.5, 8), mat);
      wire.position.set(-1.0 + w * 0.25, -1.0, (Math.random() - 0.5) * 0.6);
      wire.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
      group.add(wire);
    }

    return group;
  }

  public static createUltraDetailedWallProps(): THREE.Group {
    const group = new THREE.Group();

    const redMetalMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:b90107cf1b55', () => new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.8 })) as THREE.MeshStandardMaterial);
    const steelMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:5f41a951196f', () => new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.2 })) as THREE.MeshStandardMaterial);
    const glassMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:2f04b8b35075', () => new THREE.MeshStandardMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.5, roughness: 0.1 })) as THREE.MeshStandardMaterial);
    const crossMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:af7c1c8b4672', () => new THREE.MeshBasicMaterial({ color: 0xef4444 })) as THREE.MeshBasicMaterial);

    const extTank = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:ed50ea1dbc93', () => new THREE.CylinderGeometry(0.18, 0.18, 0.8, 16)), redMetalMat);
    extTank.position.set(0, 0, 0);
    group.add(extTank);

    const extCap = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:540edf10495b', () => new THREE.CylinderGeometry(0.08, 0.18, 0.15, 12)), steelMat);
    extCap.position.set(0, 0.45, 0);
    group.add(extCap);

    const extHandle = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:a17249105a9f', () => new THREE.BoxGeometry(0.15, 0.04, 0.1)), steelMat);
    extHandle.position.set(0.08, 0.52, 0);
    group.add(extHandle);

    const extHose = new THREE.Mesh(ModelBuilder.getGeo('lg:TorusGeometry:2c6518eb79d9', () => new THREE.TorusGeometry(0.15, 0.02, 8, 12, Math.PI)), steelMat);
    extHose.rotation.y = Math.PI / 2;
    extHose.position.set(0.15, 0.2, 0);
    group.add(extHose);

    const extBracket = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:41d5419b13fa', () => new THREE.BoxGeometry(0.05, 0.4, 0.25)), steelMat);
    extBracket.position.set(-0.18, 0, 0);
    group.add(extBracket);

    const boxGroup = new THREE.Group();
    boxGroup.position.set(0, 1.0, 0);

    const boxFrame = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:5d7beee11ddb', () => new THREE.BoxGeometry(0.15, 0.6, 0.5)), steelMat);
    boxGroup.add(boxFrame);

    const boxGlass = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:4227f1b5e8fc', () => new THREE.BoxGeometry(0.02, 0.5, 0.42)), glassMat);
    boxGlass.position.set(0.08, 0, 0);
    boxGroup.add(boxGlass);

    const crossH = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:17688df939aa', () => new THREE.BoxGeometry(0.03, 0.2, 0.06)), crossMat);
    crossH.position.set(0.09, 0, 0);
    boxGroup.add(crossH);

    const crossV = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:d3e595c2299f', () => new THREE.BoxGeometry(0.03, 0.06, 0.2)), crossMat);
    crossV.position.set(0.09, 0, 0);
    boxGroup.add(crossV);

    group.add(boxGroup);

    return group;
  }

  public static createUltraDetailedSlopeRampGroup(
    width: number,
    length: number,
    slopeAngle: number,
    dy: number,
    floorMat: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();

    // 1. Base Sloped Heavy Foundation Slab
    const slabGeo = new THREE.BoxGeometry(width, 0.8, length + 0.2);
    const slabMesh = new THREE.Mesh(slabGeo, floorMat);
    slabMesh.name = 'ground';
    group.add(slabMesh);

    // Materials
    const darkSteelMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:44abb9859223', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 })) as THREE.MeshStandardMaterial);
    const steelMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:5f41a951196f', () => new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.2 })) as THREE.MeshStandardMaterial);
    const chromeMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:ec3dccf0c49b', () => new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.95, roughness: 0.1 })) as THREE.MeshStandardMaterial);
    const hazardYellowMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:d1cb19c772e3', () => new THREE.MeshBasicMaterial({ color: 0xf59e0b })) as THREE.MeshBasicMaterial);
    const hazardBlackMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:a41461ed38c1', () => new THREE.MeshBasicMaterial({ color: 0x020617 })) as THREE.MeshBasicMaterial);
    const ledGlowMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:2f6ef22c47d8', () => new THREE.MeshBasicMaterial({ color: 0x00f0ff })) as THREE.MeshBasicMaterial); // Cyan LED strip

    // 2. Stepped Anti-Slip Serrated Metal Treads across slope length
    const stepInterval = 0.6;
    const numSteps = Math.floor(length / stepInterval);
    const halfLen = length / 2;

    for (let s = 0; s < numSteps; s++) {
      const zPos = -halfLen + 0.3 + s * stepInterval;

      // Serrated Metal Tread Plate
      const tread = new THREE.Mesh(new THREE.BoxGeometry(width - 0.4, 0.06, 0.45), darkSteelMat);
      tread.position.set(0, 0.43, zPos);
      group.add(tread);

      // Yellow Safety Nose Bar along front edge of step
      const yellowNose = new THREE.Mesh(new THREE.BoxGeometry(width - 0.4, 0.07, 0.08), hazardYellowMat);
      yellowNose.position.set(0, 0.435, zPos + (dy >= 0 ? 0.2 : -0.2));
      group.add(yellowNose);

      // Black anti-slip rubber grip strip
      const gripStrip = new THREE.Mesh(new THREE.BoxGeometry(width - 0.6, 0.08, 0.1), hazardBlackMat);
      gripStrip.position.set(0, 0.44, zPos);
      group.add(gripStrip);
    }

    // 3. Heavy Industrial Tubular Safety Handrails (Left & Right)
    const railXOffset = width / 2 - 0.25;
    [-railXOffset, railXOffset].forEach((rx) => {
      // Top Primary Handrail Bar
      const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, length, 12), steelMat);
      topRail.rotation.x = Math.PI / 2;
      topRail.position.set(rx, 1.5, 0);
      group.add(topRail);

      // Mid Safety Guard Rail
      const midRail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, length, 12), steelMat);
      midRail.rotation.x = Math.PI / 2;
      midRail.position.set(rx, 0.95, 0);
      group.add(midRail);

      // Bottom Toe-Board Kickplate
      const kickplate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.25, length), darkSteelMat);
      kickplate.position.set(rx, 0.55, 0);
      group.add(kickplate);

      // Vertical Stanchion Support Posts every ~1.8m
      const postInterval = 1.8;
      const numPosts = Math.floor(length / postInterval);
      for (let p = 0; p <= numPosts; p++) {
        const pz = -halfLen + 0.3 + p * postInterval;

        const post = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:aa505e18bbc6', () => new THREE.CylinderGeometry(0.05, 0.05, 1.1, 12)), steelMat);
        post.position.set(rx, 0.95, pz);
        group.add(post);

        // Flange Mounting Baseplate
        const baseplate = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:7a84090e3f12', () => new THREE.BoxGeometry(0.2, 0.06, 0.2)), darkSteelMat);
        baseplate.position.set(rx, 0.43, pz);
        group.add(baseplate);

        // 4 Steel Anchor Bolts
        for (let b = 0; b < 4; b++) {
          const bx = rx + (b % 2 === 0 ? -0.07 : 0.07);
          const bz = pz + (b < 2 ? -0.07 : 0.07);
          const bolt = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:c3e84b2c5f2a', () => new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8)), chromeMat);
          bolt.position.set(bx, 0.46, bz);
          group.add(bolt);
        }
      }
    });

    // 4. Recessed LED Step-Lighting Channels (Left & Right)
    [-width / 2 + 0.15, width / 2 - 0.15].forEach((lx) => {
      const ledChannel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, length), darkSteelMat);
      ledChannel.position.set(lx, 0.44, 0);
      group.add(ledChannel);

      const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, length), ledGlowMat);
      ledStrip.position.set(lx, 0.45, 0);
      group.add(ledStrip);
    });

    // 5. Under-Floor Structural I-Beams / Support Trusses
    const beamSpacing = 2.4;
    const numBeams = Math.floor(length / beamSpacing);
    for (let b = 0; b <= numBeams; b++) {
      const bz = -halfLen + 0.4 + b * beamSpacing;

      // Cross I-beam girder
      const girder = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.35, 0.25), darkSteelMat);
      girder.position.set(0, -0.55, bz);
      group.add(girder);

      // Diagonal Truss Braces under girder
      for (let t = -1; t <= 1; t += 2) {
        const brace = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:4673369e91df', () => new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8)), steelMat);
        brace.position.set(t * (width * 0.3), -0.9, bz);
        brace.rotation.z = t * 0.5;
        group.add(brace);
      }
    }

    // 6. Top & Bottom Hazard Threshold Landing Plates with diagonal warning stripes
    [-halfLen, halfLen].forEach((endZ) => {
      const thresholdPlate = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.6), hazardYellowMat);
      thresholdPlate.position.set(0, 0.44, endZ);
      group.add(thresholdPlate);

      for (let s = -width / 2 + 0.4; s < width / 2; s += 0.8) {
        const stripe = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:505b1c3268f3', () => new THREE.BoxGeometry(0.35, 0.09, 0.62)), hazardBlackMat);
        stripe.position.set(s, 0.445, endZ);
        stripe.rotation.y = 0.5;
        group.add(stripe);
      }
    });

    return group;
  }

  public static createUltraDetailedStagePlatform(
    width: number,
    height: number,
    depth: number,
    floorMat?: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();

    // Materials
    const steelMat = floorMat || (ModelBuilder.getMaterial('lg:MeshStandardMaterial:44abb9859223', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 })) as THREE.MeshStandardMaterial);
    const darkSteelMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:e5c180602e10', () => new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 })) as THREE.MeshStandardMaterial);
    const plateMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:05093779d574', () => new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 })) as THREE.MeshStandardMaterial);
    const yellowHazardMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:d1cb19c772e3', () => new THREE.MeshBasicMaterial({ color: 0xf59e0b })) as THREE.MeshBasicMaterial);
    const blackHazardMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:a41461ed38c1', () => new THREE.MeshBasicMaterial({ color: 0x020617 })) as THREE.MeshBasicMaterial);
    const cyanLedMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:2f6ef22c47d8', () => new THREE.MeshBasicMaterial({ color: 0x00f0ff })) as THREE.MeshBasicMaterial);
    const chromeMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:ec3dccf0c49b', () => new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.95, roughness: 0.1 })) as THREE.MeshStandardMaterial);

    // 1. Primary Solid Deck Slab (for player physics & standing)
    const mainDeck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.8, depth), steelMat);
    mainDeck.position.set(0, 0, 0);
    mainDeck.name = 'ground';
    group.add(mainDeck);

    // 2. Beveled Metallic Deck Frame / Perimeter Trim
    const outerTrim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.2, depth + 0.3), darkSteelMat);
    outerTrim.position.set(0, -0.3, 0);
    group.add(outerTrim);

    // 3. Grid of Anti-Skid Tread Plates across the top surface
    const plateCols = Math.max(2, Math.floor(width / 3.0));
    const plateRows = Math.max(2, Math.floor(depth / 3.0));
    const plateW = (width - 0.6) / plateCols;
    const plateD = (depth - 0.6) / plateRows;

    for (let c = 0; c < plateCols; c++) {
      for (let r = 0; r < plateRows; r++) {
        const px = -width / 2 + 0.3 + plateW / 2 + c * plateW;
        const pz = -depth / 2 + 0.3 + plateD / 2 + r * plateD;

        const treadPlate = new THREE.Mesh(new THREE.BoxGeometry(plateW - 0.08, 0.04, plateD - 0.08), plateMat);
        treadPlate.position.set(px, 0.42, pz);
        group.add(treadPlate);

        // Center rivets / bolts on plate corners
        [
          [px - plateW / 2 + 0.15, pz - plateD / 2 + 0.15],
          [px + plateW / 2 - 0.15, pz - plateD / 2 + 0.15],
          [px - plateW / 2 + 0.15, pz + plateD / 2 - 0.15],
          [px + plateW / 2 - 0.15, pz + plateD / 2 - 0.15]
        ].forEach(([bx, bz]) => {
          const rivet = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:c521a48bdfc9', () => new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8)), chromeMat);
          rivet.position.set(bx, 0.44, bz);
          group.add(rivet);
        });
      }
    }

    // 4. Perimeter Yellow/Black Warning Hazard Stripes along deck edges
    [-depth / 2 + 0.15, depth / 2 - 0.15].forEach((zEdge) => {
      const hazardBorder = new THREE.Mesh(new THREE.BoxGeometry(width - 0.4, 0.05, 0.3), yellowHazardMat);
      hazardBorder.position.set(0, 0.425, zEdge);
      group.add(hazardBorder);

      for (let s = -width / 2 + 0.5; s < width / 2 - 0.5; s += 1.0) {
        const stripe = new THREE.Mesh(ModelBuilder.getGeo('lg:BoxGeometry:3aadd102341f', () => new THREE.BoxGeometry(0.4, 0.06, 0.32)), blackHazardMat);
        stripe.position.set(s, 0.43, zEdge);
        stripe.rotation.y = 0.5;
        group.add(stripe);
      }
    });

    // 5. Four Heavy Corner Hydraulic Support Columns / Legs going down to floor
    const cornerX = width / 2 - 0.6;
    const cornerZ = depth / 2 - 0.6;
    const legH = Math.max(1.0, height - 0.4);

    [
      [-cornerX, -cornerZ], [cornerX, -cornerZ],
      [-cornerX, cornerZ], [cornerX, cornerZ]
    ].forEach(([cx, cz]) => {
      // Outer Pillar Base Column
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, legH, 12), darkSteelMat);
      pillar.position.set(cx, -legH / 2 - 0.4, cz);
      group.add(pillar);

      // Chrome Hydraulic Piston Shaft
      const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, legH * 0.8, 12), chromeMat);
      piston.position.set(cx, -legH / 2 - 0.4, cz);
      group.add(piston);

      // Flange Base Collar
      const collar = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:66601ad84f54', () => new THREE.CylinderGeometry(0.6, 0.7, 0.2, 12)), darkSteelMat);
      collar.position.set(cx, -legH - 0.3, cz);
      group.add(collar);

      // Corner Amber Warning Beacon Light
      const beacon = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:89a07a0f87ad', () => new THREE.CylinderGeometry(0.12, 0.12, 0.2, 12)), cyanLedMat);
      beacon.position.set(cx, 0.52, cz);
      group.add(beacon);
    });

    // 6. Perimeter Recessed LED Strip Lighting Channels
    [-width / 2 + 0.1, width / 2 - 0.1].forEach((lx) => {
      const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, depth - 1.2), cyanLedMat);
      ledStrip.position.set(lx, 0.0, 0);
      group.add(ledStrip);
    });

    // 7. Structural Under-Deck Steel I-Beams
    const beamCount = Math.max(1, Math.floor(depth / 4.0));
    for (let b = 0; b < beamCount; b++) {
      const bz = -depth / 2 + (depth / (beamCount + 1)) * (b + 1);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(width - 0.8, 0.4, 0.25), darkSteelMat);
      beam.position.set(0, -0.6, bz);
      group.add(beam);
    }

    return group;
  }

  public static createUltraDetailedCommandHubPedestal(): THREE.Group {
    const group = new THREE.Group();

    // Materials
    const darkSteelMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:e5c180602e10', () => new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 })) as THREE.MeshStandardMaterial);
    const steelMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:44abb9859223', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 })) as THREE.MeshStandardMaterial);
    const chromeMat = (ModelBuilder.getMaterial('lg:MeshStandardMaterial:ec3dccf0c49b', () => new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.95, roughness: 0.1 })) as THREE.MeshStandardMaterial);
    const cyanLedMat = (ModelBuilder.getMaterial('lg:MeshBasicMaterial:2f6ef22c47d8', () => new THREE.MeshBasicMaterial({ color: 0x00f0ff })) as THREE.MeshBasicMaterial);

    // 1. Octagonal Main Deck Base
    const baseGeo = ModelBuilder.getGeo('lg:CylinderGeometry:e8bec2ec92c3', () => new THREE.CylinderGeometry(2.8, 3.2, 1.2, 8));
    const baseMesh = new THREE.Mesh(baseGeo, darkSteelMat);
    baseMesh.position.y = 0.6;
    baseMesh.name = 'ground';
    group.add(baseMesh);

    // 2. Beveled Metallic Outer Rim
    const rimGeo = ModelBuilder.getGeo('lg:CylinderGeometry:cdd3bdc6cc5a', () => new THREE.CylinderGeometry(3.1, 3.3, 0.2, 8));
    const rimMesh = new THREE.Mesh(rimGeo, steelMat);
    rimMesh.position.y = 1.1;
    group.add(rimMesh);

    // 3. Glowing Cyan LED Perimeter Ring
    const ledRingGeo = ModelBuilder.getGeo('lg:TorusGeometry:66f646c62abe', () => new THREE.TorusGeometry(2.9, 0.06, 8, 32));
    const ledRing = new THREE.Mesh(ledRingGeo, cyanLedMat);
    ledRing.rotation.x = Math.PI / 2;
    ledRing.position.y = 1.21;
    group.add(ledRing);

    // 4. Tread Plates & Corner Rivets on Octagon
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const rx = Math.cos(angle) * 2.2;
      const rz = Math.sin(angle) * 2.2;

      const rivet = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:557c29e5a483', () => new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8)), chromeMat);
      rivet.position.set(rx, 1.22, rz);
      group.add(rivet);
    }

    // 5. Cable Conduits going down to floor
    for (let c = 0; c < 4; c++) {
      const angle = (c * Math.PI) / 2 + Math.PI / 4;
      const cx = Math.cos(angle) * 3.0;
      const cz = Math.sin(angle) * 3.0;

      const pipe = new THREE.Mesh(ModelBuilder.getGeo('lg:CylinderGeometry:ec8542d4cc66', () => new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8)), chromeMat);
      pipe.position.set(cx, 0.6, cz);
      group.add(pipe);
    }

    return group;
  }
}
