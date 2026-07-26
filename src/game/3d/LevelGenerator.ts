import * as THREE from 'three';
import { EnemyType } from '../../types';
import { TextureGenerator } from './TextureGenerator';
import { ModelBuilder } from './ModelBuilder';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
    const hasFlashlight = levelNumber >= 9 && levelNumber <= 12;

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
    const isSubwayLevel = levelNumber >= 5 && levelNumber <= 8;
    const isMineLevel = levelNumber >= 9 && levelNumber <= 12;
    const isHellLevel = levelNumber >= 13 && levelNumber <= 16;

    if (levelNumber >= 1 && levelNumber <= 4) {
      biomeIndex = 0;
      biomeName = `Abandoned Biohazard Laboratory (Floor ${levelNumber})`;
      fogColor = 0x020d12;
      lightColor = 0x22c55e;
      floorTexture = TextureGenerator.getAbandonedLabFloorTexture();
      wallTexture = TextureGenerator.getAbandonedLabWallTexture();
    } else if (levelNumber >= 5 && levelNumber <= 8) {
      biomeIndex = 1;
      biomeName = `Subway Metro Catacombs (Floor ${levelNumber})`;
      fogColor = 0x030c14;
      lightColor = 0x00aaff;
      floorTexture = TextureGenerator.getSubwayFloorTexture();
      wallTexture = TextureGenerator.getSubwayTileTexture();
    } else if (levelNumber >= 9 && levelNumber <= 12) {
      biomeIndex = 2;
      biomeName = `Abyssal Mine Caverns (Floor ${levelNumber})`;
      fogColor = 0x020202;
      lightColor = 0xffaa00;
      floorTexture = TextureGenerator.getMineFloorTexture();
      wallTexture = TextureGenerator.getMineRockTexture();
    } else if (levelNumber >= 13 && levelNumber <= 16) {
      biomeIndex = 3;
      biomeName = `Hellish Citadel (Floor ${levelNumber})`;
      fogColor = 0x180202;
      lightColor = 0xff0022;
      floorTexture = TextureGenerator.getHellFloorTexture();
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
      : isMineLevel
        ? TextureGenerator.getMineCeilingTexture()
        : isHellLevel
          ? TextureGenerator.getHellCeilingTexture()
          : wallTexture;

    // Per-biome surface bump maps. Mines are raw hewn rock (deep bump, matte, no metal);
    // hell is polished obsidian shot through with molten runes (shallower bump, glassier).
    const floorBumpTexture = isSubwayLevel
      ? TextureGenerator.getSubwayFloorBumpTexture()
      : isLabLevel
        ? TextureGenerator.getAbandonedLabFloorBumpTexture()
        : isMineLevel
          ? TextureGenerator.getMineFloorBumpTexture()
          : isHellLevel
            ? TextureGenerator.getHellFloorBumpTexture()
            : undefined;
    const wallBumpTexture = isSubwayLevel
      ? TextureGenerator.getSubwayTileBumpTexture()
      : isLabLevel
        ? TextureGenerator.getAbandonedLabWallBumpTexture()
        : isMineLevel
          ? TextureGenerator.getMineRockBumpTexture()
          : isHellLevel
            ? TextureGenerator.getObsidianRuneBumpTexture()
            : undefined;

    // Materials.
    // NOTE: bumpMap is attached only when a biome actually has one - handing THREE an
    // explicit `bumpMap: undefined` makes Material.setValues log a warning per material.
    const makeSurfaceMat = (
      map: THREE.CanvasTexture,
      bump: THREE.CanvasTexture | undefined,
      bumpScale: number,
      roughness: number,
      metalness: number
    ) => {
      const mat = new THREE.MeshStandardMaterial({ map, roughness, metalness });
      if (bump) {
        mat.bumpMap = bump;
        mat.bumpScale = bumpScale;
      }
      return mat;
    };

    const floorMat = makeSurfaceMat(
      floorTexture,
      floorBumpTexture,
      isSubwayLevel ? 0.1 : (isLabLevel ? 0.1 : (isMineLevel ? 0.32 : 0.2)),
      isSubwayLevel ? 0.4 : (isLabLevel ? 0.4 : (isMineLevel ? 0.95 : (isHellLevel ? 0.5 : 0.5))),
      isSubwayLevel ? 0.25 : (isLabLevel ? 0.35 : (isMineLevel ? 0.04 : (isHellLevel ? 0.35 : 0.3)))
    );
    const wallMat = makeSurfaceMat(
      wallTexture,
      wallBumpTexture,
      isSubwayLevel ? 0.12 : (isLabLevel ? 0.14 : (isMineLevel ? 0.42 : 0.26)),
      isSubwayLevel ? 0.35 : (isLabLevel ? 0.6 : (isMineLevel ? 0.98 : (isHellLevel ? 0.42 : 0.7))),
      isSubwayLevel ? 0.2 : (isLabLevel ? 0.3 : (isMineLevel ? 0.03 : (isHellLevel ? 0.4 : 0.2)))
    );
    const ceilingMat = makeSurfaceMat(
      ceilingTexture,
      isMineLevel ? TextureGenerator.getMineRockBumpTexture() : undefined,
      0.3,
      isMineLevel ? 0.98 : (isHellLevel ? 0.55 : 0.7),
      isMineLevel ? 0.02 : (isHellLevel ? 0.3 : 0.4)
    );
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
      : isMineLevel
        ? (ModelBuilder.getMaterial('lg:mine:cover-timber', () => new THREE.MeshStandardMaterial({
            color: 0x5b3a1d,
            roughness: 0.92,
            metalness: 0.04,
          })) as THREE.MeshStandardMaterial)
        : isHellLevel
          ? (ModelBuilder.getMaterial('lg:hell:cover-basalt', () => new THREE.MeshStandardMaterial({
              color: 0x24121a,
              roughness: 0.55,
              metalness: 0.45,
            })) as THREE.MeshStandardMaterial)
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
      } else if (isMineLevel) {
        // ABYSSAL MINE - overhead dressing: raw rock ceiling, timber roof supports,
        // one working oil lantern (the room's only warm practical light).
        for (let s = 0; s < 3; s++) {
          const stal = LevelGenerator.createMineStalactiteCluster();
          stal.position.set(
            room.xCenter + (rng() - 0.5) * room.width * 0.78,
            yFloor + wallHeight - 0.3,
            room.zCenter + (rng() - 0.5) * room.depth * 0.78
          );
          stal.rotation.y = rng() * Math.PI * 2;
          markStatic(stal);
          scene.add(stal);
        }

        // Timber roof supports set near the front and back walls, offset to either side of
        // the doorway centreline. They span X, so they never foul the side ledge or its ramp.
        for (let a = 0; a < 2; a++) {
          const side = a === 0 ? -1 : 1;
          const arch = LevelGenerator.createMineSupportArch();
          arch.position.set(
            room.xCenter + side * room.width * 0.24,
            yFloor,
            room.zCenter + side * room.depth * 0.4
          );
          markStatic(arch);
          scene.add(arch);
        }

        const lantern = LevelGenerator.createMineLantern();
        lantern.position.set(
          room.xCenter + (rng() - 0.5) * room.width * 0.4,
          yFloor + wallHeight - 0.4,
          room.zCenter + (rng() - 0.5) * room.depth * 0.4
        );
        markStatic(lantern);
        scene.add(lantern);

        const warnSign = LevelGenerator.createMineWarningSign();
        warnSign.position.set(room.xCenter - room.width / 2 + 0.7, yFloor + 4.6, room.zCenter + room.depth * 0.18);
        warnSign.rotation.y = Math.PI / 2;
        markStatic(warnSign);
        scene.add(warnSign);
      } else if (isHellLevel) {
        // HELLISH CITADEL - overhead dressing: bone chandeliers, gibbets and butcher hooks.
        for (let c = 0; c < 2; c++) {
          const chandelier = LevelGenerator.createHellBoneChandelier();
          chandelier.position.set(
            room.xCenter + (c === 0 ? -1 : 1) * room.width * 0.24,
            yFloor + wallHeight - 0.3,
            room.zCenter + (rng() - 0.5) * room.depth * 0.3
          );
          chandelier.rotation.y = rng() * Math.PI;
          markStatic(chandelier);
          scene.add(chandelier);
        }

        const cage = LevelGenerator.createHellHangingCage();
        cage.position.set(
          room.xCenter + (rng() - 0.5) * room.width * 0.5,
          yFloor + wallHeight - 0.3,
          room.zCenter + (rng() - 0.5) * room.depth * 0.5
        );
        cage.rotation.y = rng() * Math.PI;
        markStatic(cage);
        scene.add(cage);

        for (let h = 0; h < 2; h++) {
          const hook = LevelGenerator.createHellHangingHook();
          hook.position.set(
            room.xCenter + (h === 0 ? -1 : 1) * room.width * 0.36,
            yFloor + wallHeight - 0.3,
            room.zCenter - room.depth * 0.3 + rng() * room.depth * 0.2
          );
          hook.rotation.y = rng() * Math.PI;
          markStatic(hook);
          scene.add(hook);
        }

        for (let b = 0; b < 2; b++) {
          const side = b === 0 ? -1 : 1;
          const banner = LevelGenerator.createHellBanner();
          banner.position.set(
            room.xCenter + side * (room.width / 2 - 1.4),
            yFloor,
            room.zCenter + side * room.depth * 0.22
          );
          banner.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          markStatic(banner);
          scene.add(banner);
        }
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
        } else if (isMineLevel) {
          // MINE BOSS CAVERN: the excavation head - hoist cage, scaffolds, a loaded
          // ore train on rails and spoil heaps ringing the arena. Centre stays open.
          // Offset from the room's centre line: the finish portal sits on it.
          const elevator = LevelGenerator.createMineElevatorCage();
          elevator.position.set(room.xCenter - 12.0, yFloor, room.zCenter - room.depth / 2 + 6.0);
          elevator.rotation.y = Math.PI / 2;
          markStatic(elevator);
          scene.add(elevator);

          [-1, 1].forEach((side) => {
            const scaffold = LevelGenerator.createMineScaffoldTower();
            scaffold.position.set(room.xCenter + side * (room.width / 2 - 5.0), yFloor, room.zCenter - room.depth / 4);
            scaffold.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
            markStatic(scaffold);
            scene.add(scaffold);
          });

          // Ore train: four rail segments laid along X with a loaded cart riding them.
          for (let t = -2; t <= 1; t++) {
            const rail = LevelGenerator.createMineRailSegment();
            rail.position.set(room.xCenter + t * 8 + 4, yFloor, room.zCenter + room.depth / 3);
            rail.rotation.y = Math.PI / 2;
            markStatic(rail);
            scene.add(rail);
          }

          const cart = LevelGenerator.createMineCart();
          cart.position.set(room.xCenter - 6, yFloor, room.zCenter + room.depth / 3);
          cart.rotation.y = Math.PI / 2;
          markStatic(cart);
          scene.add(cart);

          [-1, 1].forEach((side) => {
            const pillar = LevelGenerator.createMineChainedPillar();
            pillar.position.set(room.xCenter + side * (room.width / 2 - 4.0), yFloor, room.zCenter + room.depth / 4);
            markStatic(pillar);
            scene.add(pillar);

            const pile = LevelGenerator.createMineRubblePile();
            pile.position.set(room.xCenter + side * (room.width / 2 - 8.0), yFloor, room.zCenter - room.depth / 2 + 9.0);
            pile.rotation.y = rng() * Math.PI * 2;
            markStatic(pile);
            scene.add(pile);

            const crate = LevelGenerator.createMineDynamiteCrate();
            crate.position.set(room.xCenter + side * 13.0, yFloor, room.zCenter + room.depth / 2 - 5.0);
            crate.rotation.y = rng() * 0.6 - 0.3;
            markStatic(crate);
            scene.add(crate);
          });
        } else if (isHellLevel) {
          // HELL BOSS SANCTUM: an execution court - altar, throne, gargoyle wardens,
          // carved pillars and lava basins pushed out to the arena rim.
          const altar = LevelGenerator.createHellAltar();
          altar.position.set(room.xCenter - room.width / 4, yFloor, room.zCenter - room.depth / 3);
          altar.rotation.y = Math.PI / 8;
          markStatic(altar);
          scene.add(altar);

          const throne = LevelGenerator.createHellThrone();
          throne.position.set(room.xCenter + room.width / 4, yFloor, room.zCenter - room.depth / 3);
          throne.rotation.y = Math.PI;
          markStatic(throne);
          scene.add(throne);

          [-1, 1].forEach((side) => {
            const gargoyle = LevelGenerator.createHellGargoyleStatue();
            gargoyle.position.set(room.xCenter + side * 11.0, yFloor, room.zCenter + room.depth / 3);
            gargoyle.rotation.y = side > 0 ? -Math.PI / 5 : Math.PI / 5;
            markStatic(gargoyle);
            scene.add(gargoyle);

            const pillar = LevelGenerator.createHellDemonPillar();
            pillar.position.set(room.xCenter + side * (room.width / 2 - 4.5), yFloor, room.zCenter);
            markStatic(pillar);
            scene.add(pillar);

            const lava = LevelGenerator.createHellLavaPool();
            lava.position.set(room.xCenter + side * (room.width / 2 - 7.0), yFloor, room.zCenter - room.depth / 2 + 8.0);
            lava.rotation.y = rng() * Math.PI;
            markStatic(lava);
            scene.add(lava);

            const brazier = LevelGenerator.createHellBrazier();
            brazier.position.set(room.xCenter + side * 9.0, yFloor, room.zCenter + room.depth / 2 - 6.0);
            markStatic(brazier);
            scene.add(brazier);
          });

          // Kept off the centre line so the entry corridor mouth stays clear.
          [-1, 1].forEach((side) => {
            const spikes = LevelGenerator.createHellSpikeRow();
            spikes.position.set(room.xCenter + side * 15.0, yFloor, room.zCenter + room.depth / 2 - 4.0);
            markStatic(spikes);
            scene.add(spikes);
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
        } else if (isMineLevel) {
          // MINE PITHEAD: the shift muster point. Rails run out of the room toward the
          // exit to lead the eye; all gear is parked against the walls, spawn stays clear.
          for (let t = 0; t < 3; t++) {
            const rail = LevelGenerator.createMineRailSegment();
            rail.position.set(room.xCenter, yFloor, room.zCenter + 2 - t * 8);
            markStatic(rail);
            scene.add(rail);
          }

          const toolRack = LevelGenerator.createMineToolRack();
          toolRack.position.set(room.xCenter - room.width / 2 + 1.6, yFloor, room.zCenter + 2);
          toolRack.rotation.y = Math.PI / 2;
          markStatic(toolRack);
          scene.add(toolRack);

          const barrels = LevelGenerator.createMineBarrelSet();
          barrels.position.set(room.xCenter - room.width / 2 + 2.4, yFloor, room.zCenter - 6);
          markStatic(barrels);
          scene.add(barrels);

          const barrow = LevelGenerator.createMineWheelbarrow();
          barrow.position.set(room.xCenter + room.width / 2 - 3.2, yFloor, room.zCenter + 4);
          barrow.rotation.y = -Math.PI / 3;
          markStatic(barrow);
          scene.add(barrow);

          const crate = LevelGenerator.createMineDynamiteCrate();
          crate.position.set(room.xCenter + room.width / 2 - 2.4, yFloor, room.zCenter - 4);
          crate.rotation.y = 0.35;
          markStatic(crate);
          scene.add(crate);

          const ladder = LevelGenerator.createMineLadder();
          ladder.position.set(room.xCenter + room.width / 2 - 1.2, yFloor, room.zCenter + 10);
          ladder.rotation.y = -Math.PI / 2;
          markStatic(ladder);
          scene.add(ladder);

          const puddle = LevelGenerator.createMineWaterPuddle();
          puddle.position.set(room.xCenter - room.width / 4, yFloor, room.zCenter + 9);
          markStatic(puddle);
          scene.add(puddle);
        } else if (isHellLevel) {
          // HELL GATEHOUSE: braziers light the way to the exit, trophies line the walls.
          [-1, 1].forEach((side) => {
            const brazier = LevelGenerator.createHellBrazier();
            brazier.position.set(room.xCenter + side * 5.5, yFloor, room.zCenter - room.depth / 2 + 5.0);
            markStatic(brazier);
            scene.add(brazier);

            const pillar = LevelGenerator.createHellDemonPillar();
            pillar.position.set(room.xCenter + side * (room.width / 2 - 3.5), yFloor, room.zCenter - 4);
            markStatic(pillar);
            scene.add(pillar);

            const skulls = LevelGenerator.createHellSkullPile();
            skulls.position.set(room.xCenter + side * (room.width / 2 - 5.0), yFloor, room.zCenter + 8);
            skulls.rotation.y = rng() * Math.PI * 2;
            markStatic(skulls);
            scene.add(skulls);
          });

          const shards = LevelGenerator.createHellObsidianShards();
          shards.position.set(room.xCenter + room.width / 3, yFloor, room.zCenter + room.depth / 3);
          shards.rotation.y = rng() * Math.PI;
          markStatic(shards);
          scene.add(shards);

          const bones = LevelGenerator.createHellBoneHeap();
          bones.position.set(room.xCenter - room.width / 3, yFloor, room.zCenter + room.depth / 3);
          bones.rotation.y = rng() * Math.PI;
          markStatic(bones);
          scene.add(bones);
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

          // Heavy furniture goes on the wall opposite the sniper ledge, so the ramp and
          // its landing stay clear (see featureWallSide).
          const propSide = LevelGenerator.featureWallSide(i);
          const halfW = room.width / 2;
          const halfD = room.depth / 2;
          const variant = (i + levelNumber) % 4;

          if (isMineLevel) {
            // Every mine gallery gets an ore seam biting out of a side wall and a
            // stalagmite field, then a per-room working-face layout on top.
            const vein = LevelGenerator.createMineOreVein();
            vein.position.set(room.xCenter + propSide * (halfW - 0.9), yFloor + 2.2, room.zCenter - room.depth * 0.24);
            vein.rotation.y = propSide > 0 ? -Math.PI / 2 : Math.PI / 2;
            markStatic(vein);
            scene.add(vein);

            const stalagmites = LevelGenerator.createMineStalagmiteCluster();
            stalagmites.position.set(
              room.xCenter - propSide * (halfW - 3.5),
              yFloor,
              room.zCenter + room.depth * 0.3
            );
            stalagmites.rotation.y = rng() * Math.PI * 2;
            markStatic(stalagmites);
            scene.add(stalagmites);

            if (variant === 0) {
              // Working face: a live ore train hauling out of the seam.
              const railX = room.xCenter + propSide * (halfW * 0.55);
              for (let t = -1; t <= 1; t++) {
                const rail = LevelGenerator.createMineRailSegment();
                rail.position.set(railX, yFloor, room.zCenter + t * 8);
                markStatic(rail);
                scene.add(rail);
              }

              const cart = LevelGenerator.createMineCart();
              cart.position.set(railX, yFloor, room.zCenter - 3.5);
              markStatic(cart);
              scene.add(cart);

              const rubble = LevelGenerator.createMineRubblePile();
              rubble.position.set(railX + propSide * 3.0, yFloor, room.zCenter + 6.0);
              rubble.rotation.y = rng() * Math.PI * 2;
              markStatic(rubble);
              scene.add(rubble);

              const barrow = LevelGenerator.createMineWheelbarrow();
              barrow.position.set(room.xCenter - propSide * 7.0, yFloor, room.zCenter - room.depth * 0.28);
              barrow.rotation.y = rng() * Math.PI * 2;
              markStatic(barrow);
              scene.add(barrow);

            } else if (variant === 1) {
              // Roof fall: collapsed timbering, spoil heaps and standing water.
              for (let p = 0; p < 3; p++) {
                const rubble = LevelGenerator.createMineRubblePile();
                rubble.position.set(
                  room.xCenter + propSide * (halfW * 0.42) + (rng() - 0.5) * 6.0,
                  yFloor,
                  room.zCenter + (p - 1) * room.depth * 0.24
                );
                rubble.rotation.y = rng() * Math.PI * 2;
                rubble.scale.setScalar(0.8 + rng() * 0.6);
                markStatic(rubble);
                scene.add(rubble);
              }

              const pillar = LevelGenerator.createMineChainedPillar();
              pillar.position.set(room.xCenter - propSide * (halfW * 0.45), yFloor, room.zCenter - room.depth * 0.2);
              markStatic(pillar);
              scene.add(pillar);

              const puddle = LevelGenerator.createMineWaterPuddle();
              puddle.position.set(room.xCenter + propSide * 4.0, yFloor, room.zCenter + room.depth * 0.2);
              puddle.rotation.y = rng() * Math.PI;
              markStatic(puddle);
              scene.add(puddle);

            } else if (variant === 2) {
              // Supply depot: powder crates, barrels, tools and a scaffold tower.
              const crate1 = LevelGenerator.createMineDynamiteCrate();
              crate1.position.set(room.xCenter + propSide * (halfW - 3.0), yFloor, room.zCenter - 2.0);
              crate1.rotation.y = rng() * 0.5;
              markStatic(crate1);
              scene.add(crate1);

              const crate2 = LevelGenerator.createMineDynamiteCrate();
              crate2.position.set(room.xCenter + propSide * (halfW - 3.2), yFloor + 0.62, room.zCenter - 2.3);
              crate2.rotation.y = rng() * 0.9;
              crate2.scale.setScalar(0.92);
              markStatic(crate2);
              scene.add(crate2);

              const toolRack = LevelGenerator.createMineToolRack();
              toolRack.position.set(room.xCenter + propSide * (halfW - 1.4), yFloor, room.zCenter + 5.0);
              toolRack.rotation.y = propSide > 0 ? -Math.PI / 2 : Math.PI / 2;
              markStatic(toolRack);
              scene.add(toolRack);

              const barrels = LevelGenerator.createMineBarrelSet();
              barrels.position.set(room.xCenter - propSide * (halfW - 3.0), yFloor, room.zCenter + 3.0);
              barrels.rotation.y = rng() * Math.PI;
              markStatic(barrels);
              scene.add(barrels);

              const scaffold = LevelGenerator.createMineScaffoldTower();
              scaffold.position.set(room.xCenter - propSide * (halfW - 4.5), yFloor, room.zCenter - room.depth * 0.26);
              scaffold.rotation.y = propSide > 0 ? Math.PI / 2 : -Math.PI / 2;
              markStatic(scaffold);
              scene.add(scaffold);

            } else {
              // Shaft head: hoist cage against the back wall, ladders and sump water.
              const elevator = LevelGenerator.createMineElevatorCage();
              elevator.position.set(room.xCenter + propSide * 8.5, yFloor, room.zCenter - halfD + 4.0);
              elevator.rotation.y = propSide > 0 ? -Math.PI / 8 : Math.PI / 8;
              markStatic(elevator);
              scene.add(elevator);

              const ladder = LevelGenerator.createMineLadder();
              ladder.position.set(room.xCenter - propSide * (halfW - 1.1), yFloor, room.zCenter - 4.0);
              ladder.rotation.y = propSide > 0 ? Math.PI / 2 : -Math.PI / 2;
              markStatic(ladder);
              scene.add(ladder);

              for (let p = 0; p < 2; p++) {
                const puddle = LevelGenerator.createMineWaterPuddle();
                puddle.position.set(
                  room.xCenter + (p === 0 ? -1 : 1) * room.width * 0.2,
                  yFloor,
                  room.zCenter + room.depth * (p === 0 ? 0.26 : -0.22)
                );
                puddle.rotation.y = rng() * Math.PI;
                puddle.scale.setScalar(0.85 + rng() * 0.5);
                markStatic(puddle);
                scene.add(puddle);
              }

              const rubble = LevelGenerator.createMineRubblePile();
              rubble.position.set(room.xCenter + propSide * (halfW - 4.0), yFloor, room.zCenter + room.depth * 0.28);
              rubble.rotation.y = rng() * Math.PI * 2;
              markStatic(rubble);
              scene.add(rubble);
            }
          } else if (isHellLevel) {
            // Every citadel hall carries obsidian growth and a trophy heap, then a
            // per-room ritual layout.
            const shards = LevelGenerator.createHellObsidianShards();
            shards.position.set(
              room.xCenter + propSide * (halfW - 3.0),
              yFloor,
              room.zCenter + room.depth * 0.3
            );
            shards.rotation.y = rng() * Math.PI;
            markStatic(shards);
            scene.add(shards);

            const skulls = LevelGenerator.createHellSkullPile();
            skulls.position.set(
              room.xCenter - propSide * (halfW - 3.4),
              yFloor,
              room.zCenter - room.depth * 0.26
            );
            skulls.rotation.y = rng() * Math.PI * 2;
            markStatic(skulls);
            scene.add(skulls);

            if (variant === 0) {
              // Sacrificial court: altar, spikes and a lit brazier.
              const altar = LevelGenerator.createHellAltar();
              altar.position.set(room.xCenter + propSide * (halfW * 0.5), yFloor, room.zCenter);
              altar.rotation.y = propSide > 0 ? -Math.PI / 2 : Math.PI / 2;
              markStatic(altar);
              scene.add(altar);

              const spikes = LevelGenerator.createHellSpikeRow();
              spikes.position.set(room.xCenter + propSide * 6.5, yFloor, room.zCenter - room.depth * 0.3);
              markStatic(spikes);
              scene.add(spikes);

              const brazier = LevelGenerator.createHellBrazier();
              brazier.position.set(room.xCenter - propSide * (halfW * 0.5), yFloor, room.zCenter + 3.0);
              markStatic(brazier);
              scene.add(brazier);

            } else if (variant === 1) {
              // Charnel yard: bone heaps and a gargoyle warden watching the floor.
              for (let b = 0; b < 3; b++) {
                const heap = LevelGenerator.createHellBoneHeap();
                heap.position.set(
                  room.xCenter + propSide * (halfW * 0.44) + (rng() - 0.5) * 6.0,
                  yFloor,
                  room.zCenter + (b - 1) * room.depth * 0.22
                );
                heap.rotation.y = rng() * Math.PI * 2;
                heap.scale.setScalar(0.85 + rng() * 0.5);
                markStatic(heap);
                scene.add(heap);
              }

              const gargoyle = LevelGenerator.createHellGargoyleStatue();
              gargoyle.position.set(room.xCenter - propSide * (halfW * 0.5), yFloor, room.zCenter - room.depth * 0.2);
              gargoyle.rotation.y = propSide > 0 ? Math.PI / 3 : -Math.PI / 3;
              markStatic(gargoyle);
              scene.add(gargoyle);

              const firePit = LevelGenerator.createHellFirePit();
              firePit.position.set(room.xCenter - propSide * 6.0, yFloor, room.zCenter + room.depth * 0.26);
              firePit.rotation.y = rng() * Math.PI;
              markStatic(firePit);
              scene.add(firePit);

            } else if (variant === 2) {
              // Fissure hall: lava basins burning either side of the fighting floor.
              for (let l = 0; l < 2; l++) {
                const lava = LevelGenerator.createHellLavaPool();
                lava.position.set(
                  room.xCenter + (l === 0 ? -1 : 1) * (halfW * 0.55),
                  yFloor,
                  room.zCenter + (l === 0 ? 1 : -1) * room.depth * 0.22
                );
                lava.rotation.y = rng() * Math.PI;
                lava.scale.setScalar(0.9 + rng() * 0.4);
                markStatic(lava);
                scene.add(lava);
              }

              [-1, 1].forEach((side) => {
                const pillar = LevelGenerator.createHellDemonPillar();
                pillar.position.set(room.xCenter + side * (halfW - 3.2), yFloor, room.zCenter - room.depth * 0.06);
                markStatic(pillar);
                scene.add(pillar);
              });

              const brazier = LevelGenerator.createHellBrazier();
              brazier.position.set(room.xCenter + propSide * 7.5, yFloor, room.zCenter - room.depth * 0.3);
              markStatic(brazier);
              scene.add(brazier);

            } else {
              // Warlord's hall: throne on a dais, wardens and a spike gauntlet.
              const throne = LevelGenerator.createHellThrone();
              throne.position.set(room.xCenter + propSide * (halfW * 0.52), yFloor, room.zCenter - room.depth * 0.18);
              throne.rotation.y = propSide > 0 ? -Math.PI / 2 : Math.PI / 2;
              markStatic(throne);
              scene.add(throne);

              [-1, 1].forEach((side) => {
                const gargoyle = LevelGenerator.createHellGargoyleStatue();
                gargoyle.position.set(
                  room.xCenter + propSide * (halfW * 0.52) + side * 4.5,
                  yFloor,
                  room.zCenter + room.depth * 0.06
                );
                gargoyle.rotation.y = propSide > 0 ? -Math.PI / 2 : Math.PI / 2;
                gargoyle.scale.setScalar(0.85);
                markStatic(gargoyle);
                scene.add(gargoyle);
              });

              const spikes = LevelGenerator.createHellSpikeRow();
              spikes.position.set(room.xCenter - propSide * (halfW * 0.5), yFloor, room.zCenter + room.depth * 0.22);
              spikes.rotation.y = Math.PI / 2;
              markStatic(spikes);
              scene.add(spikes);

              const firePit = LevelGenerator.createHellFirePit();
              firePit.position.set(room.xCenter - propSide * (halfW * 0.42), yFloor, room.zCenter - room.depth * 0.26);
              firePit.rotation.y = rng() * Math.PI;
              markStatic(firePit);
              scene.add(firePit);
            }
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
        yFloor,
        i
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

  /**
   * Which side wall a room's signature dressing belongs on.
   *
   * Even-indexed rooms carry a sniper ledge hugging one side wall (see the mine/hell
   * layout branch in the room loop). Wall furniture has to land on the OTHER side or it
   * intersects the platform and its ramp. Odd rooms have no ledge, so the side simply
   * alternates to stop consecutive rooms reading as copies.
   */
  private static featureWallSide(roomIndex: number): number {
    const ledgeSide = roomIndex % 2 === 0 ? (roomIndex % 4 === 0 ? 1 : -1) : 0;
    if (ledgeSide !== 0) return -ledgeSide;
    return roomIndex % 3 === 0 ? 1 : -1;
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
    yFloor: number,
    roomIndex: number = 0
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
    } else if (biomeIndex === 2) {
      // 2. ABYSSAL MINE CAVERNS: a fat ore seam torn out of one wall, braced by timber,
      // lit by the warm amber of the gallery lamps.
      //
      // The signature feature always goes on the wall OPPOSITE the room's sniper ledge
      // (same derivation as the combat-room layouts), so it can never intersect the
      // platform or its ramp.
      const wallSide = LevelGenerator.featureWallSide(roomIndex);

      const seam = LevelGenerator.createMineOreVein();
      seam.position.set(
        room.xCenter + wallSide * (room.width / 2 - 0.9),
        yFloor + 4.4,
        room.zCenter + (roomIndex % 3 === 0 ? 1 : -1) * room.depth * 0.16
      );
      seam.rotation.y = wallSide > 0 ? -Math.PI / 2 : Math.PI / 2;
      seam.scale.set(1.5, 1.45, 1.5);
      markStatic(seam);
      scene.add(seam);

      // Sits between the two arches the room dressing already placed near the end walls,
      // so the gallery reads as a continuous timbered drift rather than duplicate props.
      const brace = LevelGenerator.createMineSupportArch();
      brace.position.set(
        room.xCenter + wallSide * room.width * 0.3,
        yFloor,
        room.zCenter + (roomIndex % 3 === 0 ? -1 : 1) * room.depth * 0.14
      );
      markStatic(brace);
      scene.add(brace);

      const sectorLight = new THREE.PointLight(0xffaa00, 3.2, 20);
      sectorLight.position.set(
        room.xCenter + wallSide * (room.width * 0.18),
        yFloor + 7.0,
        room.zCenter
      );
      sectorLight.name = 'light';
      scene.add(sectorLight);
    } else if (biomeIndex === 3) {
      // 3. HELLISH CITADEL: a face-carved pillar fused to the wall over a lava seam,
      // washing the hall in red-orange furnace light. Same ledge-avoiding wall choice
      // as the mine chapter above.
      const wallSide = LevelGenerator.featureWallSide(roomIndex);

      const pillar = LevelGenerator.createHellDemonPillar();
      pillar.position.set(
        room.xCenter + wallSide * (room.width / 2 - 2.2),
        yFloor,
        room.zCenter + (roomIndex % 3 === 0 ? -1 : 1) * room.depth * 0.18
      );
      pillar.rotation.y = wallSide > 0 ? -Math.PI / 2 : Math.PI / 2;
      markStatic(pillar);
      scene.add(pillar);

      const seam = LevelGenerator.createHellLavaPool();
      seam.position.set(
        room.xCenter + wallSide * (room.width / 2 - 4.0),
        yFloor,
        room.zCenter - (roomIndex % 3 === 0 ? -1 : 1) * room.depth * 0.2
      );
      seam.rotation.y = wallSide > 0 ? 0.4 : -0.4;
      seam.scale.set(0.8, 1.0, 1.35);
      markStatic(seam);
      scene.add(seam);

      const sectorLight = new THREE.PointLight(0xff3300, 3.6, 22);
      sectorLight.position.set(
        room.xCenter + wallSide * (room.width * 0.2),
        yFloor + 2.4,
        room.zCenter
      );
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

  /**
   * PERF: collapse a prop group's unnamed decorative meshes into one merged mesh per
   * material. A single ramp used to be ~260 separate meshes (treads, rails, posts, bolts,
   * stripes) = ~260 draw calls; merged it renders in ~6. Collision semantics are
   * unchanged: named meshes (e.g. the 'ground' slab) are left untouched, the merged
   * output contains byte-identical triangles, and call sites rename it 'ground' exactly
   * like they renamed the individual parts - vertical probes still hit the same surfaces.
   *
   * Only safe for groups whose children end up named 'ground' (or stay decorative):
   * 'wall'-named parts feed the player's per-part AABB ejection, where merging would
   * inflate the ejection box to the whole prop. Do not use on wall-named props.
   */
  private static mergeStaticGroup(group: THREE.Group): THREE.Group {
    group.updateMatrixWorld(true);

    const buckets = new Map<THREE.Material, THREE.Mesh[]>();
    group.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.name === '' &&
        !Array.isArray(child.material)
      ) {
        let list = buckets.get(child.material);
        if (!list) {
          list = [];
          buckets.set(child.material, list);
        }
        list.push(child);
      }
    });

    const inverseGroup = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const relative = new THREE.Matrix4();

    for (const [material, meshes] of buckets) {
      if (meshes.length < 2) continue;

      const geos: THREE.BufferGeometry[] = [];
      for (const mesh of meshes) {
        const g = mesh.geometry.clone();
        relative.copy(inverseGroup).multiply(mesh.matrixWorld);
        g.applyMatrix4(relative);
        geos.push(g);
      }

      const merged = mergeGeometries(geos, false);
      if (!merged) continue; // attribute mismatch - keep the originals as-is

      for (const mesh of meshes) {
        mesh.parent?.remove(mesh);
        // Shared cached geometries stay alive for other props; private ones are done.
        if (!ModelBuilder.isCachedResource(mesh.geometry)) {
          mesh.geometry.dispose();
        }
      }

      const mergedMesh = new THREE.Mesh(merged, material);
      group.add(mergedMesh);
    }

    // PERF: merging empties the little sub-assembly Groups that only existed to position
    // their parts (a skull is 7 meshes in one group, and a bone heap holds 20 of them).
    // An empty Group still costs a scene-graph visit in projectObject every frame and a
    // node in markStatic/freezeStaticScene, so drop the husks. Repeat until stable, since
    // removing a child can empty its parent.
    for (;;) {
      const husks: THREE.Object3D[] = [];
      group.traverse((child) => {
        if (child !== group && (child as THREE.Group).isGroup && child.children.length === 0) {
          husks.push(child);
        }
      });
      if (husks.length === 0) break;
      for (const husk of husks) husk.parent?.remove(husk);
    }

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

    // PERF: ~260 decorative meshes -> ~6 merged draw calls (slab keeps its own mesh).
    return LevelGenerator.mergeStaticGroup(group);
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

    // PERF: ~100 decorative meshes -> ~6 merged draw calls (deck keeps its own mesh).
    return LevelGenerator.mergeStaticGroup(group);
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

  // =========================================================================
  // SHARED CACHE ACCESSORS (mine + hell chapters)
  //
  // PERF: every geometry and material below goes through ModelBuilder's process-wide
  // caches. The key is derived from the exact constructor arguments, so two props asking
  // for the same box really do share one BufferGeometry (and one GPU buffer) instead of
  // allocating a fresh one per instance - a mine level places several hundred of these.
  // Never swap these for a bare `new THREE.XGeometry(...)`.
  // =========================================================================

  private static geoBox(w: number, h: number, d: number): THREE.BufferGeometry {
    return ModelBuilder.getGeo(`lg:g:box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
  }

  private static geoCyl(rt: number, rb: number, h: number, seg: number, open: boolean = false): THREE.BufferGeometry {
    return ModelBuilder.getGeo(
      `lg:g:cyl:${rt}:${rb}:${h}:${seg}:${open ? 1 : 0}`,
      () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)
    );
  }

  private static geoCone(r: number, h: number, seg: number): THREE.BufferGeometry {
    return ModelBuilder.getGeo(`lg:g:cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg));
  }

  private static geoSphere(r: number, ws: number, hs: number): THREE.BufferGeometry {
    return ModelBuilder.getGeo(`lg:g:sph:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
  }

  private static geoTorus(r: number, tube: number, rs: number, ts: number, arc: number = Math.PI * 2): THREE.BufferGeometry {
    return ModelBuilder.getGeo(
      `lg:g:tor:${r}:${tube}:${rs}:${ts}:${arc.toFixed(3)}`,
      () => new THREE.TorusGeometry(r, tube, rs, ts, arc)
    );
  }

  private static stdMat(key: string, params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    return ModelBuilder.getMaterial(key, () => new THREE.MeshStandardMaterial(params)) as THREE.MeshStandardMaterial;
  }

  private static basicMat(key: string, params: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
    return ModelBuilder.getMaterial(key, () => new THREE.MeshBasicMaterial(params)) as THREE.MeshBasicMaterial;
  }

  /** Cheap deterministic hash in [0,1) - keeps prop jitter identical on every playthrough. */
  private static hash01(n: number): number {
    const s = Math.sin(n * 127.1 + 3.77) * 43758.5453;
    return s - Math.floor(s);
  }

  // ---- MINE PALETTE ----
  private static get mineTimber() { return LevelGenerator.stdMat('lg:mine:timber', { color: 0x6b4a25, roughness: 0.93, metalness: 0.03 }); }
  private static get mineTimberDark() { return LevelGenerator.stdMat('lg:mine:timber-dark', { color: 0x3b2712, roughness: 0.95, metalness: 0.02 }); }
  private static get mineIron() { return LevelGenerator.stdMat('lg:mine:iron', { color: 0x3a3a40, roughness: 0.45, metalness: 0.85 }); }
  private static get mineRust() { return LevelGenerator.stdMat('lg:mine:rust', { color: 0x76391d, roughness: 0.82, metalness: 0.35 }); }
  private static get mineRock() { return LevelGenerator.stdMat('lg:mine:rock', { color: 0x4c4746, roughness: 1.0, metalness: 0.02 }); }
  private static get mineRockDark() { return LevelGenerator.stdMat('lg:mine:rock-dark', { color: 0x2b2726, roughness: 1.0, metalness: 0.02 }); }
  private static get mineOre() { return LevelGenerator.stdMat('lg:mine:ore', { color: 0xc39433, roughness: 0.32, metalness: 0.85, emissive: 0x2a1c00, emissiveIntensity: 0.7 }); }
  private static get mineCrystal() { return LevelGenerator.stdMat('lg:mine:crystal', { color: 0x53c4d8, roughness: 0.15, metalness: 0.2, emissive: 0x0d4652, emissiveIntensity: 0.9 }); }
  private static get mineWater() { return LevelGenerator.stdMat('lg:mine:water', { color: 0x1b3b42, roughness: 0.06, metalness: 0.72, transparent: true, opacity: 0.82 }); }
  private static get mineRope() { return LevelGenerator.stdMat('lg:mine:rope', { color: 0x8a6b3c, roughness: 0.96, metalness: 0.0 }); }
  private static get mineRedPaint() { return LevelGenerator.stdMat('lg:mine:red-paint', { color: 0x9d2116, roughness: 0.7, metalness: 0.05 }); }
  private static get mineWarnYellow() { return LevelGenerator.basicMat('lg:mine:warn-yellow', { color: 0xf0c419 }); }
  private static get mineLampGlow() { return LevelGenerator.basicMat('lg:mine:lamp-glow', { color: 0xffc25c }); }
  private static get mineFlame() { return LevelGenerator.basicMat('lg:mine:flame', { color: 0xfff0b0 }); }

  // =========================================================================
  // MINE CHAPTER 3D PROP BUILDERS (levels 9-12)
  //
  // Collision contract: only simple convex blockers are named 'wall', walkable decks are
  // named 'ground', and everything else is left unnamed so mergeStaticGroup can collapse
  // it into a couple of draw calls at the end of each builder.
  // =========================================================================

  /** 8m of narrow-gauge track: sleepers, rails, fishplates. Flat, so no collider. */
  public static createMineRailSegment(): THREE.Group {
    const group = new THREE.Group();
    const timber = LevelGenerator.mineTimberDark;
    const iron = LevelGenerator.mineIron;
    const rust = LevelGenerator.mineRust;

    for (let s = 0; s < 9; s++) {
      const sleeper = new THREE.Mesh(LevelGenerator.geoBox(1.8, 0.14, 0.3), timber);
      sleeper.position.set(0, 0.07, -4 + s);
      sleeper.rotation.y = (LevelGenerator.hash01(s * 3.1) - 0.5) * 0.06;
      group.add(sleeper);

      // Ballast stones packed between the sleepers
      for (let b = 0; b < 2; b++) {
        const stone = new THREE.Mesh(LevelGenerator.geoSphere(0.11, 5, 4), LevelGenerator.mineRock);
        stone.position.set(
          (LevelGenerator.hash01(s * 7.3 + b) - 0.5) * 1.7,
          0.05,
          -3.5 + s + (LevelGenerator.hash01(s + b * 5.1) - 0.5) * 0.5
        );
        stone.scale.set(1, 0.5, 1);
        group.add(stone);
      }
    }

    [-0.62, 0.62].forEach((x) => {
      const rail = new THREE.Mesh(LevelGenerator.geoBox(0.12, 0.16, 8.0), iron);
      rail.position.set(x, 0.21, 0);
      group.add(rail);

      const foot = new THREE.Mesh(LevelGenerator.geoBox(0.26, 0.05, 8.0), rust);
      foot.position.set(x, 0.15, 0);
      group.add(foot);

      // Fishplates joining the rail lengths
      for (let f = -1; f <= 1; f++) {
        const plate = new THREE.Mesh(LevelGenerator.geoBox(0.05, 0.14, 0.5), rust);
        plate.position.set(x + 0.08, 0.21, f * 3.0);
        group.add(plate);
      }
    });

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Ore cart riding the rails: solid tub (the collider) plus wheels, ribs and an ore load. */
  public static createMineCart(): THREE.Group {
    const group = new THREE.Group();
    const rust = LevelGenerator.mineRust;
    const iron = LevelGenerator.mineIron;
    const ore = LevelGenerator.mineOre;

    // The tub itself is the only blocker - one clean convex box for AABB ejection.
    const tub = new THREE.Mesh(LevelGenerator.geoBox(1.5, 0.95, 2.1), rust);
    tub.position.y = 0.95;
    tub.name = 'wall';
    group.add(tub);

    // Riveted flare, rim and corner posts
    const rim = new THREE.Mesh(LevelGenerator.geoBox(1.64, 0.12, 2.24), iron);
    rim.position.y = 1.44;
    group.add(rim);

    for (let r = 0; r < 4; r++) {
      const rib = new THREE.Mesh(LevelGenerator.geoBox(1.56, 0.1, 0.12), iron);
      rib.position.set(0, 0.62 + (r % 2) * 0.5, -0.8 + Math.floor(r / 2) * 1.6);
      group.add(rib);
    }

    [-0.79, 0.79].forEach((x) => {
      const post = new THREE.Mesh(LevelGenerator.geoBox(0.1, 1.0, 0.12), iron);
      post.position.set(x, 0.95, 0);
      group.add(post);
    });

    // Chassis, axles and wheels
    const chassis = new THREE.Mesh(LevelGenerator.geoBox(1.3, 0.16, 1.9), iron);
    chassis.position.y = 0.45;
    group.add(chassis);

    for (let w = 0; w < 4; w++) {
      const wx = w % 2 === 0 ? -0.8 : 0.8;
      const wz = w < 2 ? -0.68 : 0.68;

      const wheel = new THREE.Mesh(LevelGenerator.geoCyl(0.32, 0.32, 0.12, 12), iron);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.32, wz);
      group.add(wheel);

      const hub = new THREE.Mesh(LevelGenerator.geoCyl(0.1, 0.1, 0.16, 8), rust);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(wx, 0.32, wz);
      group.add(hub);
    }

    [-0.68, 0.68].forEach((z) => {
      const axle = new THREE.Mesh(LevelGenerator.geoCyl(0.06, 0.06, 1.6, 8), iron);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, 0.32, z);
      group.add(axle);
    });

    // Coupling bar and tow ring at the head end
    const coupler = new THREE.Mesh(LevelGenerator.geoBox(0.14, 0.14, 0.5), iron);
    coupler.position.set(0, 0.5, 1.25);
    group.add(coupler);

    const towRing = new THREE.Mesh(LevelGenerator.geoTorus(0.13, 0.03, 6, 12), iron);
    towRing.position.set(0, 0.5, 1.5);
    towRing.rotation.y = Math.PI / 2;
    group.add(towRing);

    // Heaped ore load spilling over the rim
    for (let o = 0; o < 11; o++) {
      const a = o * 2.399;
      const lump = new THREE.Mesh(LevelGenerator.geoSphere(0.2, 6, 5), o % 3 === 0 ? ore : LevelGenerator.mineRockDark);
      lump.position.set(
        Math.cos(a) * 0.5 * LevelGenerator.hash01(o),
        1.46 + LevelGenerator.hash01(o * 2.2) * 0.22,
        Math.sin(a) * 0.85 * LevelGenerator.hash01(o + 1)
      );
      lump.scale.setScalar(0.7 + LevelGenerator.hash01(o * 5.5) * 0.8);
      group.add(lump);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Timber roof support: two posts (colliders), a lintel, corbels and diagonal bracing. */
  public static createMineSupportArch(): THREE.Group {
    const group = new THREE.Group();
    const timber = LevelGenerator.mineTimber;
    const dark = LevelGenerator.mineTimberDark;
    const iron = LevelGenerator.mineIron;

    [-2.7, 2.7].forEach((x) => {
      const post = new THREE.Mesh(LevelGenerator.geoBox(0.44, 4.6, 0.44), timber);
      post.position.set(x, 2.3, 0);
      post.name = 'wall';
      group.add(post);

      // Foot plate and packing wedges
      const foot = new THREE.Mesh(LevelGenerator.geoBox(0.7, 0.18, 0.7), dark);
      foot.position.set(x, 0.09, 0);
      group.add(foot);

      // Corbel bracket under the lintel
      const corbel = new THREE.Mesh(LevelGenerator.geoBox(0.34, 1.5, 0.34), timber);
      corbel.position.set(x - Math.sign(x) * 0.5, 4.0, 0);
      corbel.rotation.z = Math.sign(x) * 0.62;
      group.add(corbel);

      // Iron strap bolts
      for (let b = 0; b < 2; b++) {
        const strap = new THREE.Mesh(LevelGenerator.geoBox(0.48, 0.09, 0.48), iron);
        strap.position.set(x, 1.2 + b * 2.0, 0);
        group.add(strap);
      }
    });

    const lintel = new THREE.Mesh(LevelGenerator.geoBox(6.6, 0.5, 0.5), timber);
    lintel.position.y = 4.85;
    group.add(lintel);

    const lintel2 = new THREE.Mesh(LevelGenerator.geoBox(6.2, 0.3, 0.42), dark);
    lintel2.position.y = 4.5;
    group.add(lintel2);

    // Lagging boards packed above the lintel against the rock
    for (let p = 0; p < 6; p++) {
      const plank = new THREE.Mesh(LevelGenerator.geoBox(0.9, 0.16, 0.7), dark);
      plank.position.set(-2.5 + p * 1.0, 5.18, (LevelGenerator.hash01(p * 4.1) - 0.5) * 0.3);
      plank.rotation.z = (LevelGenerator.hash01(p * 9.3) - 0.5) * 0.12;
      group.add(plank);
    }

    // Cross tie halfway up
    const tie = new THREE.Mesh(LevelGenerator.geoBox(5.4, 0.22, 0.22), dark);
    tie.position.y = 2.6;
    group.add(tie);

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Ore seam biting out of a wall - rock knuckles, metal crystals and blue mineral shards. */
  public static createMineOreVein(): THREE.Group {
    const group = new THREE.Group();
    const rock = LevelGenerator.mineRockDark;
    const ore = LevelGenerator.mineOre;
    const crystal = LevelGenerator.mineCrystal;

    for (let r = 0; r < 11; r++) {
      const t = r / 11;
      const knuckle = new THREE.Mesh(LevelGenerator.geoSphere(0.55, 6, 5), rock);
      knuckle.position.set(
        (LevelGenerator.hash01(r * 1.7) - 0.5) * 3.4,
        (t - 0.5) * 3.6 + (LevelGenerator.hash01(r * 3.3) - 0.5) * 0.6,
        0.18
      );
      knuckle.scale.set(
        0.7 + LevelGenerator.hash01(r * 5.9) * 0.8,
        0.5 + LevelGenerator.hash01(r * 2.7) * 0.7,
        0.45
      );
      knuckle.rotation.z = LevelGenerator.hash01(r * 8.1) * Math.PI;
      group.add(knuckle);
    }

    for (let c = 0; c < 14; c++) {
      const shard = new THREE.Mesh(LevelGenerator.geoCone(0.15, 0.72, 5), ore);
      shard.position.set(
        (LevelGenerator.hash01(c * 2.9 + 11) - 0.5) * 3.0,
        (LevelGenerator.hash01(c * 4.4) - 0.5) * 3.2,
        0.42
      );
      shard.rotation.set(Math.PI / 2 + (LevelGenerator.hash01(c) - 0.5) * 0.9, 0, LevelGenerator.hash01(c * 6.6) * Math.PI);
      shard.scale.setScalar(0.6 + LevelGenerator.hash01(c * 7.7) * 0.9);
      group.add(shard);
    }

    for (let c = 0; c < 6; c++) {
      const gem = new THREE.Mesh(LevelGenerator.geoCone(0.1, 0.5, 4), crystal);
      gem.position.set(
        (LevelGenerator.hash01(c * 13.1) - 0.5) * 2.6,
        (LevelGenerator.hash01(c * 3.9 + 5) - 0.5) * 2.8,
        0.46
      );
      gem.rotation.set(Math.PI / 2 + (LevelGenerator.hash01(c * 2.1) - 0.5) * 0.8, 0, LevelGenerator.hash01(c * 5.3) * Math.PI);
      group.add(gem);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /**
   * Hanging oil lantern - the ONE mine prop that owns a PointLight, because it is the
   * light. Origin sits at the ceiling; the whole assembly hangs below it.
   */
  public static createMineLantern(): THREE.Group {
    const group = new THREE.Group();
    const iron = LevelGenerator.mineIron;
    const rust = LevelGenerator.mineRust;

    const bracket = new THREE.Mesh(LevelGenerator.geoBox(0.3, 0.12, 0.3), iron);
    bracket.position.y = -0.06;
    group.add(bracket);

    for (let l = 0; l < 8; l++) {
      const link = new THREE.Mesh(LevelGenerator.geoTorus(0.06, 0.018, 5, 8), iron);
      link.position.y = -0.2 - l * 0.15;
      link.rotation.x = l % 2 === 0 ? Math.PI / 2 : 0;
      group.add(link);
    }

    const hook = new THREE.Mesh(LevelGenerator.geoTorus(0.09, 0.022, 5, 10, Math.PI * 1.4), iron);
    hook.position.y = -1.48;
    hook.rotation.y = Math.PI / 2;
    group.add(hook);

    const cap = new THREE.Mesh(LevelGenerator.geoCyl(0.14, 0.26, 0.12, 10), rust);
    cap.position.y = -1.68;
    group.add(cap);

    for (let p = 0; p < 4; p++) {
      const a = (p * Math.PI) / 2 + Math.PI / 4;
      const post = new THREE.Mesh(LevelGenerator.geoBox(0.03, 0.5, 0.03), iron);
      post.position.set(Math.cos(a) * 0.17, -1.98, Math.sin(a) * 0.17);
      group.add(post);
    }

    const glass = new THREE.Mesh(LevelGenerator.geoCyl(0.17, 0.17, 0.44, 10, true), LevelGenerator.mineLampGlow);
    glass.position.y = -1.98;
    group.add(glass);

    const flame = new THREE.Mesh(LevelGenerator.geoSphere(0.09, 8, 6), LevelGenerator.mineFlame);
    flame.position.y = -2.0;
    flame.scale.set(1, 1.5, 1);
    group.add(flame);

    const fuelPot = new THREE.Mesh(LevelGenerator.geoCyl(0.19, 0.15, 0.2, 10), rust);
    fuelPot.position.y = -2.3;
    group.add(fuelPot);

    const merged = LevelGenerator.mergeStaticGroup(group);

    const light = new THREE.PointLight(0xffb347, 3.0, 15);
    light.position.y = -2.0;
    merged.add(light);

    return merged;
  }

  /** Timber scaffold: 'wall' legs, a 'ground' deck you can actually stand on, cross braces. */
  public static createMineScaffoldTower(): THREE.Group {
    const group = new THREE.Group();
    const timber = LevelGenerator.mineTimber;
    const dark = LevelGenerator.mineTimberDark;
    const rope = LevelGenerator.mineRope;

    for (let l = 0; l < 4; l++) {
      const lx = l % 2 === 0 ? -1.3 : 1.3;
      const lz = l < 2 ? -1.3 : 1.3;

      const leg = new THREE.Mesh(LevelGenerator.geoBox(0.24, 3.3, 0.24), timber);
      leg.position.set(lx, 1.65, lz);
      leg.name = 'wall';
      group.add(leg);

      const pad = new THREE.Mesh(LevelGenerator.geoBox(0.5, 0.12, 0.5), dark);
      pad.position.set(lx, 0.06, lz);
      group.add(pad);
    }

    const deck = new THREE.Mesh(LevelGenerator.geoBox(3.0, 0.18, 3.0), timber);
    deck.position.y = 3.35;
    deck.name = 'ground';
    group.add(deck);

    for (let p = 0; p < 6; p++) {
      const plank = new THREE.Mesh(LevelGenerator.geoBox(2.9, 0.06, 0.42), dark);
      plank.position.set(0, 3.47, -1.25 + p * 0.5);
      group.add(plank);
    }

    // Cross bracing on all four faces
    for (let f = 0; f < 4; f++) {
      const a = (f * Math.PI) / 2;
      const cx = Math.cos(a) * 1.3;
      const cz = Math.sin(a) * 1.3;
      for (let d = 0; d < 2; d++) {
        const brace = new THREE.Mesh(LevelGenerator.geoBox(0.14, 3.6, 0.14), dark);
        brace.position.set(cx, 1.7, cz);
        brace.rotation.y = a + Math.PI / 2;
        brace.rotation.z = d === 0 ? 0.62 : -0.62;
        group.add(brace);
      }
    }

    // Waist rails around three sides of the deck
    for (let r = 0; r < 3; r++) {
      const a = (r * Math.PI) / 2;
      const rail = new THREE.Mesh(LevelGenerator.geoBox(2.9, 0.12, 0.12), timber);
      rail.position.set(Math.cos(a) * 1.4, 4.2, Math.sin(a) * 1.4);
      rail.rotation.y = a + Math.PI / 2;
      group.add(rail);

      const upright = new THREE.Mesh(LevelGenerator.geoBox(0.12, 0.9, 0.12), timber);
      upright.position.set(Math.cos(a) * 1.4, 3.85, Math.sin(a) * 1.4);
      group.add(upright);
    }

    // Access rungs up the open face
    for (let r = 0; r < 7; r++) {
      const rung = new THREE.Mesh(LevelGenerator.geoCyl(0.05, 0.05, 2.5, 6), dark);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0, 0.4 + r * 0.44, 1.42);
      group.add(rung);
    }

    // Coil of rope hung on a leg
    for (let c = 0; c < 3; c++) {
      const coil = new THREE.Mesh(LevelGenerator.geoTorus(0.22, 0.045, 6, 12), rope);
      coil.position.set(-1.3, 2.3 - c * 0.09, 1.3);
      coil.rotation.x = Math.PI / 2;
      group.add(coil);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Stencilled powder crate with dynamite sticks and iron strapping. */
  public static createMineDynamiteCrate(): THREE.Group {
    const group = new THREE.Group();
    const timber = LevelGenerator.mineTimber;
    const dark = LevelGenerator.mineTimberDark;
    const iron = LevelGenerator.mineIron;
    const red = LevelGenerator.mineRedPaint;

    const body = new THREE.Mesh(LevelGenerator.geoBox(1.2, 1.1, 0.95), timber);
    body.position.y = 0.55;
    body.name = 'wall';
    group.add(body);

    // Plank seams on the front and top faces
    for (let p = 0; p < 3; p++) {
      const seam = new THREE.Mesh(LevelGenerator.geoBox(1.22, 0.05, 0.06), dark);
      seam.position.set(0, 0.28 + p * 0.34, 0.48);
      group.add(seam);

      const topSeam = new THREE.Mesh(LevelGenerator.geoBox(1.22, 0.06, 0.05), dark);
      topSeam.position.set(0, 1.11, -0.3 + p * 0.3);
      group.add(topSeam);
    }

    // Iron corner straps
    for (let c = 0; c < 4; c++) {
      const sx = c % 2 === 0 ? -0.58 : 0.58;
      const sz = c < 2 ? -0.46 : 0.46;
      const strap = new THREE.Mesh(LevelGenerator.geoBox(0.08, 1.12, 0.08), iron);
      strap.position.set(sx, 0.55, sz);
      group.add(strap);
    }

    const bandTop = new THREE.Mesh(LevelGenerator.geoBox(1.24, 0.07, 0.99), iron);
    bandTop.position.y = 1.0;
    group.add(bandTop);

    // Stencilled hazard mark: bars plus a warning dot
    for (let s = 0; s < 2; s++) {
      const bar = new THREE.Mesh(LevelGenerator.geoBox(0.62, 0.09, 0.03), red);
      bar.position.set(-0.16, 0.66 - s * 0.2, 0.49);
      group.add(bar);
    }
    const dot = new THREE.Mesh(LevelGenerator.geoCyl(0.11, 0.11, 0.03, 10), red);
    dot.rotation.x = Math.PI / 2;
    dot.position.set(0.38, 0.6, 0.49);
    group.add(dot);

    // Loose sticks poking out of the lid
    for (let d = 0; d < 4; d++) {
      const stick = new THREE.Mesh(LevelGenerator.geoCyl(0.055, 0.055, 0.42, 8), red);
      stick.position.set(-0.3 + d * 0.2, 1.2, -0.1 + LevelGenerator.hash01(d * 3.7) * 0.2);
      stick.rotation.set(0.2 + LevelGenerator.hash01(d) * 0.5, LevelGenerator.hash01(d * 2.3) * Math.PI, 0.15);
      group.add(stick);

      const fuse = new THREE.Mesh(LevelGenerator.geoCyl(0.012, 0.012, 0.2, 5), LevelGenerator.mineRope);
      fuse.position.set(-0.3 + d * 0.2, 1.44, -0.1 + LevelGenerator.hash01(d * 3.7) * 0.2);
      fuse.rotation.z = 0.5;
      group.add(fuse);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Wall tool rack hung with pickaxes, shovels and a sledge. */
  public static createMineToolRack(): THREE.Group {
    const group = new THREE.Group();
    const timber = LevelGenerator.mineTimber;
    const dark = LevelGenerator.mineTimberDark;
    const iron = LevelGenerator.mineIron;
    const rust = LevelGenerator.mineRust;

    const board = new THREE.Mesh(LevelGenerator.geoBox(2.6, 2.1, 0.12), dark);
    board.position.set(0, 1.3, 0);
    board.name = 'wall';
    group.add(board);

    [-1.2, 1.2].forEach((x) => {
      const post = new THREE.Mesh(LevelGenerator.geoBox(0.16, 2.4, 0.16), timber);
      post.position.set(x, 1.2, 0.02);
      group.add(post);
    });

    const shelf = new THREE.Mesh(LevelGenerator.geoBox(2.6, 0.1, 0.4), timber);
    shelf.position.set(0, 0.35, 0.2);
    group.add(shelf);

    // Pickaxe
    const pickHandle = new THREE.Mesh(LevelGenerator.geoCyl(0.05, 0.05, 1.5, 8), timber);
    pickHandle.position.set(-0.85, 1.3, 0.2);
    pickHandle.rotation.z = 0.12;
    group.add(pickHandle);

    const pickHead = new THREE.Mesh(LevelGenerator.geoBox(0.16, 0.14, 0.14), iron);
    pickHead.position.set(-0.76, 2.05, 0.2);
    group.add(pickHead);

    [-1, 1].forEach((d) => {
      const tip = new THREE.Mesh(LevelGenerator.geoCone(0.07, 0.5, 6), iron);
      tip.position.set(-0.76 + d * 0.3, 2.02, 0.2);
      tip.rotation.z = d * (Math.PI / 2) - d * 0.12;
      group.add(tip);
    });

    // Shovels
    for (let s = 0; s < 2; s++) {
      const sx = 0.2 + s * 0.62;
      const handle = new THREE.Mesh(LevelGenerator.geoCyl(0.045, 0.045, 1.6, 8), timber);
      handle.position.set(sx, 1.35, 0.22);
      handle.rotation.z = -0.06 - s * 0.05;
      group.add(handle);

      const blade = new THREE.Mesh(LevelGenerator.geoBox(0.32, 0.42, 0.05), rust);
      blade.position.set(sx + 0.08, 0.45, 0.22);
      group.add(blade);

      const tipEdge = new THREE.Mesh(LevelGenerator.geoCone(0.2, 0.24, 4), rust);
      tipEdge.position.set(sx + 0.08, 0.2, 0.22);
      tipEdge.rotation.x = Math.PI;
      group.add(tipEdge);

      const grip = new THREE.Mesh(LevelGenerator.geoTorus(0.08, 0.025, 5, 10), dark);
      grip.position.set(sx - 0.04, 2.15, 0.22);
      group.add(grip);
    }

    // Sledge leaning against the rack
    const sledgeHandle = new THREE.Mesh(LevelGenerator.geoCyl(0.05, 0.05, 1.3, 8), timber);
    sledgeHandle.position.set(1.2, 0.7, 0.42);
    sledgeHandle.rotation.z = 0.3;
    group.add(sledgeHandle);

    const sledgeHead = new THREE.Mesh(LevelGenerator.geoCyl(0.11, 0.11, 0.42, 10), iron);
    sledgeHead.position.set(1.42, 1.34, 0.42);
    sledgeHead.rotation.z = Math.PI / 2;
    group.add(sledgeHead);

    // Hanging hooks
    for (let h = 0; h < 4; h++) {
      const hook = new THREE.Mesh(LevelGenerator.geoTorus(0.05, 0.015, 5, 8, Math.PI), iron);
      hook.position.set(-1.0 + h * 0.66, 2.3, 0.12);
      group.add(hook);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Tipped-up wheelbarrow with a rubble load. */
  public static createMineWheelbarrow(): THREE.Group {
    const group = new THREE.Group();
    const rust = LevelGenerator.mineRust;
    const iron = LevelGenerator.mineIron;
    const timber = LevelGenerator.mineTimber;

    const tray = new THREE.Mesh(LevelGenerator.geoBox(0.95, 0.5, 1.3), rust);
    tray.position.set(0, 0.62, 0);
    tray.rotation.x = -0.12;
    tray.name = 'wall';
    group.add(tray);

    const trayLip = new THREE.Mesh(LevelGenerator.geoBox(1.05, 0.08, 1.4), iron);
    trayLip.position.set(0, 0.88, 0);
    trayLip.rotation.x = -0.12;
    group.add(trayLip);

    [-1, 1].forEach((d) => {
      const handle = new THREE.Mesh(LevelGenerator.geoCyl(0.05, 0.05, 1.9, 8), timber);
      handle.position.set(d * 0.42, 0.62, -0.6);
      handle.rotation.x = Math.PI / 2 - 0.25;
      group.add(handle);

      const leg = new THREE.Mesh(LevelGenerator.geoCyl(0.045, 0.045, 0.55, 6), iron);
      leg.position.set(d * 0.4, 0.28, -0.35);
      group.add(leg);

      const strut = new THREE.Mesh(LevelGenerator.geoBox(0.06, 0.06, 1.1), iron);
      strut.position.set(d * 0.36, 0.42, 0.35);
      strut.rotation.x = 0.45;
      group.add(strut);
    });

    const wheel = new THREE.Mesh(LevelGenerator.geoCyl(0.3, 0.3, 0.14, 12), iron);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.3, 0.92);
    group.add(wheel);

    const tyre = new THREE.Mesh(LevelGenerator.geoTorus(0.3, 0.06, 6, 14), LevelGenerator.mineRockDark);
    tyre.rotation.y = Math.PI / 2;
    tyre.position.set(0, 0.3, 0.92);
    group.add(tyre);

    for (let o = 0; o < 7; o++) {
      const a = o * 2.399;
      const lump = new THREE.Mesh(LevelGenerator.geoSphere(0.16, 5, 4), o % 3 === 0 ? LevelGenerator.mineOre : LevelGenerator.mineRockDark);
      lump.position.set(Math.cos(a) * 0.28, 0.92, Math.sin(a) * 0.42);
      lump.scale.setScalar(0.7 + LevelGenerator.hash01(o * 4.3) * 0.7);
      group.add(lump);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Spoil heap: rock, ore and splintered timber. Low enough to walk over, so no collider. */
  public static createMineRubblePile(): THREE.Group {
    const group = new THREE.Group();

    for (let r = 0; r < 26; r++) {
      const a = r * 2.399;
      const radius = 0.25 + (r / 26) * 1.7;
      const h = Math.max(0.08, 1.0 - (radius / 1.95) * 0.95);
      const rock = new THREE.Mesh(
        LevelGenerator.geoSphere(0.3, 5, 4),
        r % 5 === 0 ? LevelGenerator.mineRock : LevelGenerator.mineRockDark
      );
      rock.position.set(Math.cos(a) * radius, h * 0.5, Math.sin(a) * radius);
      rock.scale.set(
        0.55 + LevelGenerator.hash01(r) * 0.9,
        (0.4 + LevelGenerator.hash01(r * 2.1) * 0.6) * (h + 0.3),
        0.55 + LevelGenerator.hash01(r * 3.3) * 0.9
      );
      rock.rotation.set(LevelGenerator.hash01(r * 5.1) * 3.1, LevelGenerator.hash01(r * 7.7) * 3.1, 0);
      group.add(rock);
    }

    for (let o = 0; o < 4; o++) {
      const a = o * 1.9 + 0.7;
      const chunk = new THREE.Mesh(LevelGenerator.geoSphere(0.18, 5, 4), LevelGenerator.mineOre);
      chunk.position.set(Math.cos(a) * 0.9, 0.42, Math.sin(a) * 0.9);
      chunk.scale.setScalar(0.7 + LevelGenerator.hash01(o * 9.1) * 0.6);
      group.add(chunk);
    }

    for (let t = 0; t < 3; t++) {
      const splinter = new THREE.Mesh(LevelGenerator.geoBox(0.18, 0.18, 1.7), LevelGenerator.mineTimberDark);
      splinter.position.set((LevelGenerator.hash01(t * 3.1) - 0.5) * 2.2, 0.35 + t * 0.16, (LevelGenerator.hash01(t * 6.2) - 0.5) * 2.2);
      splinter.rotation.set(0.3 + LevelGenerator.hash01(t) * 0.6, LevelGenerator.hash01(t * 4.4) * Math.PI, 0.2);
      group.add(splinter);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Rock support pillar bound in iron chain, with fallen scree at the base. */
  public static createMineChainedPillar(): THREE.Group {
    const group = new THREE.Group();
    const iron = LevelGenerator.mineIron;
    const rust = LevelGenerator.mineRust;

    const shaft = new THREE.Mesh(LevelGenerator.geoCyl(0.6, 0.78, 4.8, 8), LevelGenerator.mineRock);
    shaft.position.y = 2.4;
    shaft.name = 'wall';
    group.add(shaft);

    const cap = new THREE.Mesh(LevelGenerator.geoCyl(0.95, 0.66, 0.4, 8), LevelGenerator.mineRockDark);
    cap.position.y = 4.95;
    group.add(cap);

    const base = new THREE.Mesh(LevelGenerator.geoCyl(1.0, 1.15, 0.35, 8), LevelGenerator.mineRockDark);
    base.position.y = 0.18;
    group.add(base);

    // Chain wraps
    [1.1, 2.3, 3.4].forEach((y, idx) => {
      const wrap = new THREE.Mesh(LevelGenerator.geoTorus(0.74 - idx * 0.04, 0.055, 6, 16), iron);
      wrap.rotation.x = Math.PI / 2;
      wrap.position.y = y;
      group.add(wrap);

      const band = new THREE.Mesh(LevelGenerator.geoCyl(0.72 - idx * 0.04, 0.72 - idx * 0.04, 0.12, 10, true), rust);
      band.position.y = y - 0.16;
      group.add(band);
    });

    // A slack loop of chain hanging off the top wrap
    for (let l = 0; l < 7; l++) {
      const link = new THREE.Mesh(LevelGenerator.geoTorus(0.075, 0.02, 5, 8), iron);
      link.position.set(0.72, 3.3 - l * 0.16, 0.16 + l * 0.03);
      link.rotation.x = l % 2 === 0 ? Math.PI / 2 : 0;
      link.rotation.z = 0.2;
      group.add(link);
    }

    for (let s = 0; s < 8; s++) {
      const a = s * 2.399;
      const scree = new THREE.Mesh(LevelGenerator.geoSphere(0.22, 5, 4), LevelGenerator.mineRockDark);
      scree.position.set(Math.cos(a) * (1.0 + LevelGenerator.hash01(s) * 0.5), 0.12, Math.sin(a) * (1.0 + LevelGenerator.hash01(s * 2.2) * 0.5));
      scree.scale.set(1, 0.5, 1);
      group.add(scree);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Seep puddle: a mirror-flat sheet ringed with wet stones and ripple rings. */
  public static createMineWaterPuddle(): THREE.Group {
    const group = new THREE.Group();

    const sheet = new THREE.Mesh(LevelGenerator.geoCyl(1.7, 1.7, 0.06, 16), LevelGenerator.mineWater);
    sheet.position.y = 0.04;
    sheet.scale.set(1.15, 1, 0.85);
    group.add(sheet);

    for (let r = 0; r < 2; r++) {
      const ripple = new THREE.Mesh(LevelGenerator.geoTorus(0.6 + r * 0.5, 0.02, 5, 20), LevelGenerator.mineWater);
      ripple.rotation.x = Math.PI / 2;
      ripple.position.y = 0.08;
      ripple.scale.set(1.15, 0.85, 1);
      group.add(ripple);
    }

    for (let s = 0; s < 14; s++) {
      const a = s * 2.399;
      const stone = new THREE.Mesh(LevelGenerator.geoSphere(0.19, 5, 4), LevelGenerator.mineRockDark);
      stone.position.set(
        Math.cos(a) * (1.75 + LevelGenerator.hash01(s) * 0.35) * 1.15,
        0.05,
        Math.sin(a) * (1.6 + LevelGenerator.hash01(s * 3.1) * 0.35) * 0.85
      );
      stone.scale.set(0.8 + LevelGenerator.hash01(s * 5.5) * 0.7, 0.45, 0.8 + LevelGenerator.hash01(s * 7.1) * 0.7);
      group.add(stone);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Stalactites - origin at the ceiling, everything hangs downward. */
  public static createMineStalactiteCluster(): THREE.Group {
    const group = new THREE.Group();

    const boss = new THREE.Mesh(LevelGenerator.geoSphere(1.3, 8, 5), LevelGenerator.mineRock);
    boss.position.y = -0.1;
    boss.scale.set(1, 0.32, 1);
    group.add(boss);

    for (let s = 0; s < 10; s++) {
      const a = s * 2.399;
      const radius = 0.2 + (s / 10) * 1.5;
      const len = 0.7 + LevelGenerator.hash01(s * 4.7) * 1.7;
      const spike = new THREE.Mesh(LevelGenerator.geoCone(0.24, 1.6, 6), s % 4 === 0 ? LevelGenerator.mineRockDark : LevelGenerator.mineRock);
      spike.position.set(Math.cos(a) * radius, -len / 2, Math.sin(a) * radius);
      spike.scale.set(0.5 + LevelGenerator.hash01(s) * 0.7, len / 1.6, 0.5 + LevelGenerator.hash01(s * 2.3) * 0.7);
      spike.rotation.x = Math.PI;
      spike.rotation.z = (LevelGenerator.hash01(s * 8.9) - 0.5) * 0.25;
      group.add(spike);
    }

    for (let c = 0; c < 4; c++) {
      const a = c * 1.7;
      const drip = new THREE.Mesh(LevelGenerator.geoCone(0.08, 0.5, 5), LevelGenerator.mineCrystal);
      drip.position.set(Math.cos(a) * 0.8, -0.45, Math.sin(a) * 0.8);
      drip.rotation.x = Math.PI;
      group.add(drip);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Stalagmites growing off the cave floor. The tallest spire blocks, the rest is dressing. */
  public static createMineStalagmiteCluster(): THREE.Group {
    const group = new THREE.Group();

    const spire = new THREE.Mesh(LevelGenerator.geoCone(0.42, 2.1, 7), LevelGenerator.mineRock);
    spire.position.y = 1.05;
    spire.name = 'wall';
    group.add(spire);

    for (let s = 0; s < 9; s++) {
      const a = s * 2.399 + 0.6;
      const radius = 0.6 + (s / 9) * 1.3;
      const len = 0.45 + LevelGenerator.hash01(s * 3.9) * 1.25;
      const cone = new THREE.Mesh(LevelGenerator.geoCone(0.26, 1.4, 6), s % 3 === 0 ? LevelGenerator.mineRockDark : LevelGenerator.mineRock);
      cone.position.set(Math.cos(a) * radius, len / 2, Math.sin(a) * radius);
      cone.scale.set(0.55 + LevelGenerator.hash01(s) * 0.6, len / 1.4, 0.55 + LevelGenerator.hash01(s * 2.7) * 0.6);
      cone.rotation.z = (LevelGenerator.hash01(s * 6.1) - 0.5) * 0.24;
      group.add(cone);
    }

    for (let b = 0; b < 8; b++) {
      const a = b * 2.399;
      const nub = new THREE.Mesh(LevelGenerator.geoSphere(0.2, 5, 4), LevelGenerator.mineRockDark);
      nub.position.set(Math.cos(a) * (1.5 + LevelGenerator.hash01(b) * 0.6), 0.08, Math.sin(a) * (1.5 + LevelGenerator.hash01(b * 4.1) * 0.6));
      nub.scale.set(1, 0.45, 1);
      group.add(nub);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Shaft hoist: barred cage on a 'ground' floor plate, winch drum and cable to the roof. */
  public static createMineElevatorCage(): THREE.Group {
    const group = new THREE.Group();
    const iron = LevelGenerator.mineIron;
    const rust = LevelGenerator.mineRust;

    const floor = new THREE.Mesh(LevelGenerator.geoBox(2.5, 0.16, 2.5), iron);
    floor.position.y = 0.08;
    floor.name = 'ground';
    group.add(floor);

    // Tread stripe on the deck
    for (let t = 0; t < 4; t++) {
      const stripe = new THREE.Mesh(LevelGenerator.geoBox(2.3, 0.03, 0.16), LevelGenerator.mineWarnYellow);
      stripe.position.set(0, 0.17, -0.9 + t * 0.6);
      group.add(stripe);
    }

    for (let p = 0; p < 4; p++) {
      const px = p % 2 === 0 ? -1.18 : 1.18;
      const pz = p < 2 ? -1.18 : 1.18;
      const post = new THREE.Mesh(LevelGenerator.geoBox(0.14, 3.2, 0.14), iron);
      post.position.set(px, 1.6, pz);
      post.name = 'wall';
      group.add(post);
    }

    // Barred sides (three walls, one open face)
    for (let s = 0; s < 3; s++) {
      const a = (s * Math.PI) / 2;
      const nx = Math.cos(a) * 1.2;
      const nz = Math.sin(a) * 1.2;

      for (let b = 0; b < 7; b++) {
        const bar = new THREE.Mesh(LevelGenerator.geoCyl(0.035, 0.035, 3.1, 6), rust);
        const off = -1.05 + b * 0.35;
        bar.position.set(nx + Math.cos(a + Math.PI / 2) * off, 1.6, nz + Math.sin(a + Math.PI / 2) * off);
        group.add(bar);
      }

      for (let h = 0; h < 3; h++) {
        const band = new THREE.Mesh(LevelGenerator.geoBox(2.4, 0.08, 0.06), rust);
        band.position.set(nx, 0.55 + h * 1.2, nz);
        band.rotation.y = a + Math.PI / 2;
        group.add(band);
      }
    }

    const roof = new THREE.Mesh(LevelGenerator.geoBox(2.7, 0.14, 2.7), iron);
    roof.position.y = 3.28;
    group.add(roof);

    // Bridle chains converging on the cable
    for (let c = 0; c < 4; c++) {
      const cx = c % 2 === 0 ? -1.0 : 1.0;
      const cz = c < 2 ? -1.0 : 1.0;
      const bridle = new THREE.Mesh(LevelGenerator.geoCyl(0.035, 0.035, 1.6, 6), iron);
      bridle.position.set(cx * 0.5, 4.0, cz * 0.5);
      bridle.rotation.set(cz * 0.3, 0, -cx * 0.3);
      group.add(bridle);
    }

    const cable = new THREE.Mesh(LevelGenerator.geoCyl(0.07, 0.07, 7.4, 6), iron);
    cable.position.y = 8.4;
    group.add(cable);

    const pulley = new THREE.Mesh(LevelGenerator.geoTorus(0.34, 0.09, 6, 14), rust);
    pulley.position.y = 4.85;
    pulley.rotation.y = Math.PI / 2;
    group.add(pulley);

    // Winch drum bolted beside the shaft
    const drum = new THREE.Mesh(LevelGenerator.geoCyl(0.42, 0.42, 0.9, 12), rust);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(2.1, 0.7, 0);
    group.add(drum);

    const drumFrame = new THREE.Mesh(LevelGenerator.geoBox(1.1, 0.7, 0.14), iron);
    drumFrame.position.set(2.1, 0.35, 0.5);
    group.add(drumFrame);

    for (let w = 0; w < 5; w++) {
      const wind = new THREE.Mesh(LevelGenerator.geoTorus(0.44, 0.035, 5, 12), iron);
      wind.position.set(1.75 + w * 0.18, 0.7, 0);
      wind.rotation.y = Math.PI / 2;
      group.add(wind);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Hazard sign board with stripes, skull glyph and mounting bolts. */
  public static createMineWarningSign(): THREE.Group {
    const group = new THREE.Group();
    const iron = LevelGenerator.mineIron;
    const dark = LevelGenerator.mineRockDark;

    const board = new THREE.Mesh(LevelGenerator.geoBox(1.5, 1.05, 0.08), LevelGenerator.mineWarnYellow);
    group.add(board);

    for (let f = 0; f < 4; f++) {
      const isSide = f < 2;
      const frame = new THREE.Mesh(
        isSide ? LevelGenerator.geoBox(0.07, 1.09, 0.1) : LevelGenerator.geoBox(1.54, 0.07, 0.1),
        iron
      );
      frame.position.set(isSide ? (f === 0 ? -0.74 : 0.74) : 0, isSide ? 0 : (f === 2 ? -0.51 : 0.51), 0);
      group.add(frame);
    }

    for (let s = 0; s < 4; s++) {
      const stripe = new THREE.Mesh(LevelGenerator.geoBox(0.13, 1.0, 0.03), dark);
      stripe.position.set(-0.52 + s * 0.35, 0.28, 0.055);
      stripe.rotation.z = 0.7;
      stripe.scale.y = 0.42;
      group.add(stripe);
    }

    // Skull glyph
    const skull = new THREE.Mesh(LevelGenerator.geoSphere(0.16, 8, 6), dark);
    skull.position.set(0, -0.14, 0.07);
    skull.scale.set(1, 0.9, 0.5);
    group.add(skull);

    const jaw = new THREE.Mesh(LevelGenerator.geoBox(0.16, 0.07, 0.06), dark);
    jaw.position.set(0, -0.29, 0.07);
    group.add(jaw);

    [-0.06, 0.06].forEach((x) => {
      const socket = new THREE.Mesh(LevelGenerator.geoSphere(0.04, 5, 4), LevelGenerator.mineWarnYellow);
      socket.position.set(x, -0.11, 0.14);
      group.add(socket);
    });

    for (let b = 0; b < 2; b++) {
      const bolt = new THREE.Mesh(LevelGenerator.geoCyl(0.05, 0.05, 0.14, 6), iron);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(b === 0 ? -0.6 : 0.6, 0.42, -0.06);
      group.add(bolt);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Rough timber ladder propped against the rock. */
  public static createMineLadder(): THREE.Group {
    const group = new THREE.Group();
    const timber = LevelGenerator.mineTimber;
    const dark = LevelGenerator.mineTimberDark;

    [-0.36, 0.36].forEach((x) => {
      const rail = new THREE.Mesh(LevelGenerator.geoBox(0.11, 4.3, 0.11), timber);
      rail.position.set(x, 2.15, 0);
      group.add(rail);
    });

    for (let r = 0; r < 11; r++) {
      const rung = new THREE.Mesh(LevelGenerator.geoCyl(0.045, 0.045, 0.82, 6), dark);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0, 0.28 + r * 0.38, 0.02);
      rung.rotation.y = (LevelGenerator.hash01(r * 2.9) - 0.5) * 0.08;
      group.add(rung);
    }

    // Lashings holding the top of the ladder to the rock
    for (let l = 0; l < 2; l++) {
      const lash = new THREE.Mesh(LevelGenerator.geoTorus(0.13, 0.03, 5, 10), LevelGenerator.mineRope);
      lash.position.set(l === 0 ? -0.36 : 0.36, 4.05, 0);
      lash.rotation.y = Math.PI / 2;
      group.add(lash);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Water barrels and buckets stacked at a shift station. */
  public static createMineBarrelSet(): THREE.Group {
    const group = new THREE.Group();
    const timber = LevelGenerator.mineTimber;
    const iron = LevelGenerator.mineIron;
    const rust = LevelGenerator.mineRust;

    const barrelSpots: Array<[number, number]> = [[0, 0], [1.0, 0.55]];
    barrelSpots.forEach(([bx, bz], idx) => {
      const barrel = new THREE.Mesh(LevelGenerator.geoCyl(0.42, 0.46, 1.15, 12), timber);
      barrel.position.set(bx, 0.58, bz);
      barrel.name = 'wall';
      group.add(barrel);

      for (let h = 0; h < 3; h++) {
        const hoop = new THREE.Mesh(LevelGenerator.geoTorus(0.45, 0.035, 6, 14), iron);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.set(bx, 0.18 + h * 0.4, bz);
        group.add(hoop);
      }

      const lid = new THREE.Mesh(LevelGenerator.geoCyl(0.4, 0.4, 0.06, 12), idx === 0 ? timber : rust);
      lid.position.set(bx, 1.18, bz);
      group.add(lid);
    });

    // Tipped barrel on its side
    const tipped = new THREE.Mesh(LevelGenerator.geoCyl(0.4, 0.4, 1.1, 12), timber);
    tipped.rotation.z = Math.PI / 2;
    tipped.rotation.y = 0.4;
    tipped.position.set(-0.95, 0.4, 0.6);
    group.add(tipped);

    for (let h = 0; h < 2; h++) {
      const hoop = new THREE.Mesh(LevelGenerator.geoTorus(0.43, 0.035, 6, 14), iron);
      hoop.position.set(-0.95 + (h === 0 ? -0.34 : 0.34) * Math.cos(0.4), 0.4, 0.6 + (h === 0 ? 0.34 : -0.34) * Math.sin(0.4));
      hoop.rotation.y = 0.4;
      group.add(hoop);
    }

    // Buckets
    const bucket = new THREE.Mesh(LevelGenerator.geoCyl(0.22, 0.17, 0.34, 10), rust);
    bucket.position.set(0.5, 0.17, -0.75);
    group.add(bucket);

    const bail = new THREE.Mesh(LevelGenerator.geoTorus(0.21, 0.018, 5, 12, Math.PI), iron);
    bail.position.set(0.5, 0.34, -0.75);
    bail.rotation.y = Math.PI / 2;
    group.add(bail);

    const bucket2 = new THREE.Mesh(LevelGenerator.geoCyl(0.2, 0.16, 0.3, 10), rust);
    bucket2.position.set(-0.4, 0.16, -0.55);
    bucket2.rotation.z = Math.PI / 2.4;
    group.add(bucket2);

    return LevelGenerator.mergeStaticGroup(group);
  }

  // ---- HELL PALETTE ----
  private static get hellBone() { return LevelGenerator.stdMat('lg:hell:bone', { color: 0xd9d2bd, roughness: 0.72, metalness: 0.02 }); }
  private static get hellBoneDark() { return LevelGenerator.stdMat('lg:hell:bone-dark', { color: 0x968b73, roughness: 0.8, metalness: 0.02 }); }
  private static get hellObsidian() { return LevelGenerator.stdMat('lg:hell:obsidian', { color: 0x150a11, roughness: 0.22, metalness: 0.55 }); }
  private static get hellBasalt() { return LevelGenerator.stdMat('lg:hell:basalt', { color: 0x2c1519, roughness: 0.85, metalness: 0.1 }); }
  private static get hellIron() { return LevelGenerator.stdMat('lg:hell:iron', { color: 0x1c1517, roughness: 0.42, metalness: 0.8 }); }
  private static get hellChar() { return LevelGenerator.stdMat('lg:hell:char', { color: 0x110c0c, roughness: 0.96, metalness: 0.02 }); }
  private static get hellBlood() { return LevelGenerator.stdMat('lg:hell:blood', { color: 0x5c0c0c, roughness: 0.32, metalness: 0.12 }); }
  private static get hellCloth() { return LevelGenerator.stdMat('lg:hell:cloth', { color: 0x6d1220, roughness: 0.92, metalness: 0.0 }); }
  private static get hellGold() { return LevelGenerator.stdMat('lg:hell:gold', { color: 0xb8912f, roughness: 0.28, metalness: 0.9 }); }
  private static get hellFlesh() { return LevelGenerator.stdMat('lg:hell:flesh', { color: 0x7a2230, roughness: 0.62, metalness: 0.05 }); }
  private static get hellEmber() { return LevelGenerator.stdMat('lg:hell:ember', { color: 0x431403, roughness: 0.8, metalness: 0.0, emissive: 0xff3300, emissiveIntensity: 1.3 }); }
  private static get hellLava() { return LevelGenerator.basicMat('lg:hell:lava', { color: 0xff5a12 }); }
  private static get hellFlame() { return LevelGenerator.basicMat('lg:hell:flame', { color: 0xffb43c }); }
  private static get hellEyeGlow() { return LevelGenerator.basicMat('lg:hell:eye-glow', { color: 0xff2b0a }); }

  /** Reusable skull sub-assembly (cranium, snout, jaw, sockets). Purely decorative. */
  private static buildSkull(scale: number): THREE.Group {
    const g = new THREE.Group();
    const bone = LevelGenerator.hellBone;

    const cranium = new THREE.Mesh(LevelGenerator.geoSphere(0.16, 7, 5), bone);
    cranium.scale.set(1.0, 0.95, 1.1);
    g.add(cranium);

    const snout = new THREE.Mesh(LevelGenerator.geoBox(0.14, 0.11, 0.13), bone);
    snout.position.set(0, -0.09, 0.16);
    g.add(snout);

    const jaw = new THREE.Mesh(LevelGenerator.geoBox(0.15, 0.05, 0.17), LevelGenerator.hellBoneDark);
    jaw.position.set(0, -0.16, 0.11);
    g.add(jaw);

    [-0.065, 0.065].forEach((x) => {
      const socket = new THREE.Mesh(LevelGenerator.geoSphere(0.05, 5, 4), LevelGenerator.hellChar);
      socket.position.set(x, 0.01, 0.15);
      g.add(socket);
    });

    const nose = new THREE.Mesh(LevelGenerator.geoCone(0.03, 0.08, 4), LevelGenerator.hellChar);
    nose.position.set(0, -0.06, 0.2);
    nose.rotation.x = Math.PI / 2;
    g.add(nose);

    g.scale.setScalar(scale);
    return g;
  }

  /** Reusable long bone (shaft + two knuckle ends), aligned on Y. Purely decorative. */
  private static buildBone(len: number): THREE.Group {
    const g = new THREE.Group();
    const bone = LevelGenerator.hellBone;

    const shaft = new THREE.Mesh(LevelGenerator.geoCyl(0.045, 0.045, len, 6), bone);
    g.add(shaft);

    [-1, 1].forEach((d) => {
      const knuckle = new THREE.Mesh(LevelGenerator.geoSphere(0.08, 6, 5), bone);
      knuckle.position.y = (d * len) / 2;
      knuckle.scale.set(1, 0.8, 1);
      g.add(knuckle);
    });

    return g;
  }

  // =========================================================================
  // HELL CHAPTER 3D PROP BUILDERS (levels 13-16)
  // =========================================================================

  /** Heap of skulls with loose bones spilling out of it. */
  public static createHellSkullPile(): THREE.Group {
    const group = new THREE.Group();

    for (let s = 0; s < 15; s++) {
      const a = s * 2.399;
      const radius = 0.15 + (s / 15) * 1.25;
      const y = Math.max(0.14, 0.85 - radius * 0.5);
      const skull = LevelGenerator.buildSkull(0.85 + LevelGenerator.hash01(s * 3.3) * 0.5);
      skull.position.set(Math.cos(a) * radius, y * (0.35 + LevelGenerator.hash01(s) * 0.65), Math.sin(a) * radius);
      skull.rotation.set(
        (LevelGenerator.hash01(s * 1.7) - 0.5) * 1.2,
        LevelGenerator.hash01(s * 5.1) * Math.PI * 2,
        (LevelGenerator.hash01(s * 7.9) - 0.5) * 1.2
      );
      group.add(skull);
    }

    for (let b = 0; b < 7; b++) {
      const a = b * 1.9 + 0.4;
      const bone = LevelGenerator.buildBone(0.8);
      bone.position.set(Math.cos(a) * (1.1 + LevelGenerator.hash01(b) * 0.5), 0.1, Math.sin(a) * (1.1 + LevelGenerator.hash01(b * 2.2) * 0.5));
      bone.rotation.set(Math.PI / 2, LevelGenerator.hash01(b * 4.4) * Math.PI, (LevelGenerator.hash01(b * 6.6) - 0.5) * 0.6);
      group.add(bone);
    }

    // Ash and dried blood pooled under the heap
    const stain = new THREE.Mesh(LevelGenerator.geoCyl(1.5, 1.5, 0.04, 14), LevelGenerator.hellBlood);
    stain.position.y = 0.02;
    stain.scale.set(1.15, 1, 0.9);
    group.add(stain);

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Long charnel windrow: femurs, ribcages and a couple of skulls. */
  public static createHellBoneHeap(): THREE.Group {
    const group = new THREE.Group();

    for (let b = 0; b < 22; b++) {
      const t = b / 22;
      const bone = LevelGenerator.buildBone(b % 3 === 0 ? 1.2 : 0.8);
      bone.position.set(
        (t - 0.5) * 3.4 + (LevelGenerator.hash01(b * 2.1) - 0.5) * 0.6,
        0.1 + LevelGenerator.hash01(b * 3.7) * 0.55,
        (LevelGenerator.hash01(b * 5.3) - 0.5) * 1.1
      );
      bone.rotation.set(
        Math.PI / 2 + (LevelGenerator.hash01(b) - 0.5) * 0.9,
        LevelGenerator.hash01(b * 7.1) * Math.PI * 2,
        (LevelGenerator.hash01(b * 9.7) - 0.5) * 1.4
      );
      group.add(bone);
    }

    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 4; i++) {
        const rib = new THREE.Mesh(LevelGenerator.geoTorus(0.32, 0.035, 5, 10, Math.PI), LevelGenerator.hellBoneDark);
        rib.position.set(-1.2 + r * 0.85, 0.3 + i * 0.06, (LevelGenerator.hash01(r * 3.1) - 0.5) * 0.8);
        rib.rotation.set(0, LevelGenerator.hash01(r * 4.9) * Math.PI, 0.2 + i * 0.05);
        rib.scale.setScalar(0.8 + i * 0.12);
        group.add(rib);
      }

      const spine = new THREE.Mesh(LevelGenerator.geoCyl(0.05, 0.05, 1.0, 6), LevelGenerator.hellBoneDark);
      spine.position.set(-1.2 + r * 0.85, 0.22, (LevelGenerator.hash01(r * 3.1) - 0.5) * 0.8);
      spine.rotation.z = Math.PI / 2;
      group.add(spine);
    }

    for (let s = 0; s < 3; s++) {
      const skull = LevelGenerator.buildSkull(1.0);
      skull.position.set(-1.4 + s * 1.4, 0.2, (LevelGenerator.hash01(s * 8.3) - 0.5) * 0.9);
      skull.rotation.set(1.1, LevelGenerator.hash01(s * 2.7) * Math.PI * 2, 0.4);
      group.add(skull);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Lava basin: molten sheet, glowing seam ring, cooled crust rim and drifting plates. */
  public static createHellLavaPool(): THREE.Group {
    const group = new THREE.Group();

    const surface = new THREE.Mesh(LevelGenerator.geoCyl(1.55, 1.55, 0.1, 14), LevelGenerator.hellLava);
    surface.position.y = 0.06;
    surface.scale.set(1.12, 1, 0.86);
    group.add(surface);

    const glowRing = new THREE.Mesh(LevelGenerator.geoTorus(1.25, 0.07, 6, 20), LevelGenerator.hellEmber);
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = 0.11;
    glowRing.scale.set(1.12, 0.86, 1);
    group.add(glowRing);

    // Cooled crust boulders ringing the basin
    for (let c = 0; c < 16; c++) {
      const a = c * 2.399;
      const chunk = new THREE.Mesh(LevelGenerator.geoSphere(0.3, 5, 4), LevelGenerator.hellBasalt);
      chunk.position.set(
        Math.cos(a) * (1.62 + LevelGenerator.hash01(c) * 0.3) * 1.12,
        0.1,
        Math.sin(a) * (1.5 + LevelGenerator.hash01(c * 3.1) * 0.3) * 0.86
      );
      chunk.scale.set(0.7 + LevelGenerator.hash01(c * 5.5) * 0.8, 0.55 + LevelGenerator.hash01(c * 2.2) * 0.6, 0.7 + LevelGenerator.hash01(c * 7.7) * 0.8);
      chunk.rotation.set(LevelGenerator.hash01(c * 1.3) * 3.0, LevelGenerator.hash01(c * 4.1) * 3.0, 0);
      group.add(chunk);
    }

    // Solidified plates drifting on the melt
    for (let p = 0; p < 4; p++) {
      const a = p * 1.6 + 0.3;
      const plate = new THREE.Mesh(LevelGenerator.geoBox(0.6, 0.09, 0.45), LevelGenerator.hellChar);
      plate.position.set(Math.cos(a) * 0.7, 0.12, Math.sin(a) * 0.55);
      plate.rotation.y = LevelGenerator.hash01(p * 6.1) * Math.PI;
      group.add(plate);
    }

    // Bubbles breaking the surface
    for (let b = 0; b < 3; b++) {
      const a = b * 2.1 + 1.1;
      const bubble = new THREE.Mesh(LevelGenerator.geoSphere(0.18, 6, 5), LevelGenerator.hellLava);
      bubble.position.set(Math.cos(a) * 0.45, 0.14, Math.sin(a) * 0.35);
      bubble.scale.set(1, 0.6, 1);
      group.add(bubble);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /**
   * Iron brazier burning coal. This prop IS a lamp, so it owns the only PointLight in the
   * hell prop set - one per room keeps SceneCuller's 8-light budget comfortable.
   */
  public static createHellBrazier(): THREE.Group {
    const group = new THREE.Group();
    const iron = LevelGenerator.hellIron;

    for (let l = 0; l < 3; l++) {
      const a = (l * Math.PI * 2) / 3;
      const leg = new THREE.Mesh(LevelGenerator.geoBox(0.13, 1.35, 0.13), iron);
      leg.position.set(Math.cos(a) * 0.34, 0.65, Math.sin(a) * 0.34);
      leg.rotation.set(-Math.sin(a) * 0.22, 0, Math.cos(a) * 0.22);
      group.add(leg);

      const claw = new THREE.Mesh(LevelGenerator.geoCone(0.1, 0.24, 5), iron);
      claw.position.set(Math.cos(a) * 0.46, 0.1, Math.sin(a) * 0.46);
      claw.rotation.x = Math.PI;
      group.add(claw);
    }

    const bowl = new THREE.Mesh(LevelGenerator.geoCyl(0.66, 0.36, 0.52, 12), iron);
    bowl.position.y = 1.5;
    bowl.name = 'wall';
    group.add(bowl);

    const rim = new THREE.Mesh(LevelGenerator.geoTorus(0.66, 0.06, 6, 16), iron);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.76;
    group.add(rim);

    for (let s = 0; s < 6; s++) {
      const a = (s * Math.PI) / 3;
      const stud = new THREE.Mesh(LevelGenerator.geoSphere(0.07, 6, 5), iron);
      stud.position.set(Math.cos(a) * 0.6, 1.55, Math.sin(a) * 0.6);
      group.add(stud);
    }

    for (let c = 0; c < 9; c++) {
      const a = c * 2.399;
      const coal = new THREE.Mesh(LevelGenerator.geoSphere(0.14, 5, 4), c % 3 === 0 ? LevelGenerator.hellChar : LevelGenerator.hellEmber);
      coal.position.set(Math.cos(a) * 0.4 * LevelGenerator.hash01(c), 1.78, Math.sin(a) * 0.4 * LevelGenerator.hash01(c + 3));
      coal.scale.setScalar(0.7 + LevelGenerator.hash01(c * 3.7) * 0.7);
      group.add(coal);
    }

    for (let f = 0; f < 5; f++) {
      const a = f * 1.3;
      const flame = new THREE.Mesh(LevelGenerator.geoCone(0.22, 0.95, 6), f % 2 === 0 ? LevelGenerator.hellLava : LevelGenerator.hellFlame);
      flame.position.set(Math.cos(a) * 0.22, 2.2 + LevelGenerator.hash01(f) * 0.3, Math.sin(a) * 0.22);
      flame.scale.setScalar(0.55 + LevelGenerator.hash01(f * 5.1) * 0.75);
      flame.rotation.z = (LevelGenerator.hash01(f * 2.3) - 0.5) * 0.4;
      group.add(flame);
    }

    const merged = LevelGenerator.mergeStaticGroup(group);

    const light = new THREE.PointLight(0xff6a1a, 3.4, 17);
    light.position.y = 2.2;
    merged.add(light);

    return merged;
  }

  /** Butcher's chain and meat hook hanging from the vault. Origin at the ceiling. */
  public static createHellHangingHook(): THREE.Group {
    const group = new THREE.Group();
    const iron = LevelGenerator.hellIron;

    const plate = new THREE.Mesh(LevelGenerator.geoBox(0.28, 0.1, 0.28), iron);
    plate.position.y = -0.05;
    group.add(plate);

    for (let l = 0; l < 12; l++) {
      const link = new THREE.Mesh(LevelGenerator.geoTorus(0.07, 0.02, 5, 8), iron);
      link.position.y = -0.2 - l * 0.16;
      link.rotation.x = l % 2 === 0 ? Math.PI / 2 : 0;
      group.add(link);
    }

    const hook = new THREE.Mesh(LevelGenerator.geoTorus(0.24, 0.05, 6, 12, Math.PI * 1.35), iron);
    hook.position.y = -2.35;
    hook.rotation.y = Math.PI / 2;
    group.add(hook);

    const barb = new THREE.Mesh(LevelGenerator.geoCone(0.05, 0.24, 5), iron);
    barb.position.set(0, -2.2, 0.24);
    barb.rotation.x = -0.5;
    group.add(barb);

    // Carcass on the hook
    const carcass = new THREE.Mesh(LevelGenerator.geoBox(0.52, 0.95, 0.42), LevelGenerator.hellFlesh);
    carcass.position.set(0, -2.9, 0.05);
    carcass.rotation.z = 0.12;
    group.add(carcass);

    for (let r = 0; r < 4; r++) {
      const rib = new THREE.Mesh(LevelGenerator.geoTorus(0.2, 0.03, 5, 8, Math.PI), LevelGenerator.hellBone);
      rib.position.set(0.2, -2.6 - r * 0.2, 0.05);
      rib.rotation.set(0, Math.PI / 2, 0.3);
      group.add(rib);
    }

    const drip = new THREE.Mesh(LevelGenerator.geoCone(0.05, 0.34, 5), LevelGenerator.hellBlood);
    drip.position.set(0, -3.5, 0.05);
    drip.rotation.x = Math.PI;
    group.add(drip);

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Basalt pillar carved with screaming faces and molten rune bands. */
  public static createHellDemonPillar(): THREE.Group {
    const group = new THREE.Group();
    const basalt = LevelGenerator.hellBasalt;
    const obsidian = LevelGenerator.hellObsidian;

    const shaft = new THREE.Mesh(LevelGenerator.geoCyl(0.62, 0.74, 5.0, 8), basalt);
    shaft.position.y = 2.5;
    shaft.name = 'wall';
    group.add(shaft);

    const base = new THREE.Mesh(LevelGenerator.geoCyl(0.98, 1.1, 0.55, 8), obsidian);
    base.position.y = 0.27;
    group.add(base);

    const plinthTrim = new THREE.Mesh(LevelGenerator.geoCyl(0.85, 0.9, 0.16, 8), LevelGenerator.hellGold);
    plinthTrim.position.y = 0.62;
    group.add(plinthTrim);

    const cap = new THREE.Mesh(LevelGenerator.geoCyl(0.92, 0.76, 0.5, 8), obsidian);
    cap.position.y = 5.25;
    group.add(cap);

    // Carved faces staring out at three heights
    for (let f = 0; f < 3; f++) {
      const a = f * 2.1;
      const y = 1.4 + f * 1.3;
      const nx = Math.cos(a);
      const nz = Math.sin(a);

      const face = new THREE.Mesh(LevelGenerator.geoSphere(0.34, 8, 6), obsidian);
      face.position.set(nx * 0.6, y, nz * 0.6);
      face.scale.set(1, 1.15, 0.6);
      group.add(face);

      const brow = new THREE.Mesh(LevelGenerator.geoBox(0.42, 0.08, 0.1), basalt);
      brow.position.set(nx * 0.78, y + 0.16, nz * 0.78);
      brow.rotation.y = -a;
      group.add(brow);

      const maw = new THREE.Mesh(LevelGenerator.geoBox(0.26, 0.16, 0.1), LevelGenerator.hellChar);
      maw.position.set(nx * 0.78, y - 0.2, nz * 0.78);
      maw.rotation.y = -a;
      group.add(maw);

      for (let e = -1; e <= 1; e += 2) {
        const eye = new THREE.Mesh(LevelGenerator.geoSphere(0.06, 6, 5), LevelGenerator.hellEyeGlow);
        eye.position.set(
          nx * 0.78 - Math.sin(-a) * e * 0.12,
          y + 0.04,
          nz * 0.78 - Math.cos(-a) * e * 0.12
        );
        group.add(eye);
      }

      for (let h = -1; h <= 1; h += 2) {
        const horn = new THREE.Mesh(LevelGenerator.geoCone(0.07, 0.42, 5), LevelGenerator.hellBoneDark);
        horn.position.set(
          nx * 0.74 - Math.sin(-a) * h * 0.2,
          y + 0.42,
          nz * 0.74 - Math.cos(-a) * h * 0.2
        );
        horn.rotation.z = h * 0.5;
        group.add(horn);
      }
    }

    // Molten rune bands
    [0.95, 3.9].forEach((y) => {
      const band = new THREE.Mesh(LevelGenerator.geoTorus(0.72, 0.055, 6, 16), LevelGenerator.hellEmber);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      group.add(band);
    });

    for (let s = 0; s < 6; s++) {
      const a = (s * Math.PI) / 3;
      const spike = new THREE.Mesh(LevelGenerator.geoCone(0.09, 0.5, 5), obsidian);
      spike.position.set(Math.cos(a) * 0.72, 5.6, Math.sin(a) * 0.72);
      spike.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
      group.add(spike);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Crouching gargoyle on a plinth: horned head, folded wings, claws. */
  public static createHellGargoyleStatue(): THREE.Group {
    const group = new THREE.Group();
    const stone = LevelGenerator.hellObsidian;
    const basalt = LevelGenerator.hellBasalt;

    const plinth = new THREE.Mesh(LevelGenerator.geoBox(1.4, 1.0, 1.4), basalt);
    plinth.position.y = 0.5;
    plinth.name = 'wall';
    group.add(plinth);

    const plinthCap = new THREE.Mesh(LevelGenerator.geoBox(1.6, 0.14, 1.6), stone);
    plinthCap.position.y = 1.05;
    group.add(plinthCap);

    const plinthFoot = new THREE.Mesh(LevelGenerator.geoBox(1.62, 0.16, 1.62), stone);
    plinthFoot.position.y = 0.08;
    group.add(plinthFoot);

    for (let r = 0; r < 4; r++) {
      const rune = new THREE.Mesh(LevelGenerator.geoBox(0.5, 0.06, 0.04), LevelGenerator.hellEmber);
      const a = (r * Math.PI) / 2;
      rune.position.set(Math.cos(a) * 0.71, 0.55, Math.sin(a) * 0.71);
      rune.rotation.y = -a;
      group.add(rune);
    }

    const torso = new THREE.Mesh(LevelGenerator.geoSphere(0.44, 8, 6), stone);
    torso.position.set(0, 1.6, 0);
    torso.scale.set(1.0, 1.15, 0.85);
    group.add(torso);

    const head = new THREE.Mesh(LevelGenerator.geoSphere(0.3, 8, 6), stone);
    head.position.set(0, 2.2, 0.12);
    head.scale.set(1, 0.95, 1.1);
    group.add(head);

    const snout = new THREE.Mesh(LevelGenerator.geoCone(0.16, 0.36, 6), stone);
    snout.position.set(0, 2.14, 0.42);
    snout.rotation.x = Math.PI / 2;
    group.add(snout);

    [-1, 1].forEach((d) => {
      const horn = new THREE.Mesh(LevelGenerator.geoCone(0.08, 0.55, 5), LevelGenerator.hellBoneDark);
      horn.position.set(d * 0.18, 2.5, 0.0);
      horn.rotation.set(-0.45, 0, d * 0.5);
      group.add(horn);

      const eye = new THREE.Mesh(LevelGenerator.geoSphere(0.06, 6, 5), LevelGenerator.hellEyeGlow);
      eye.position.set(d * 0.13, 2.26, 0.33);
      group.add(eye);

      // Folded wing: two plates and a spar
      const wingInner = new THREE.Mesh(LevelGenerator.geoBox(0.1, 1.05, 0.55), stone);
      wingInner.position.set(d * 0.42, 1.85, -0.28);
      wingInner.rotation.set(0.2, d * 0.35, d * 0.18);
      group.add(wingInner);

      const wingOuter = new THREE.Mesh(LevelGenerator.geoBox(0.08, 0.85, 0.45), basalt);
      wingOuter.position.set(d * 0.62, 2.15, -0.5);
      wingOuter.rotation.set(0.35, d * 0.5, d * 0.3);
      group.add(wingOuter);

      const spar = new THREE.Mesh(LevelGenerator.geoCyl(0.05, 0.05, 1.3, 6), LevelGenerator.hellBoneDark);
      spar.position.set(d * 0.5, 2.0, -0.35);
      spar.rotation.set(0.25, 0, d * 0.25);
      group.add(spar);

      // Arm and claws planted on the plinth
      const arm = new THREE.Mesh(LevelGenerator.geoCyl(0.11, 0.09, 0.85, 6), stone);
      arm.position.set(d * 0.42, 1.45, 0.3);
      arm.rotation.set(0.35, 0, d * 0.18);
      group.add(arm);

      for (let c = -1; c <= 1; c++) {
        const claw = new THREE.Mesh(LevelGenerator.geoCone(0.045, 0.2, 4), LevelGenerator.hellBoneDark);
        claw.position.set(d * 0.46 + c * 0.08, 1.14, 0.46);
        claw.rotation.x = 1.3;
        group.add(claw);
      }

      const thigh = new THREE.Mesh(LevelGenerator.geoBox(0.24, 0.34, 0.5), stone);
      thigh.position.set(d * 0.3, 1.28, -0.05);
      group.add(thigh);
    });

    for (let t = 0; t < 3; t++) {
      const tail = new THREE.Mesh(LevelGenerator.geoSphere(0.13 - t * 0.03, 6, 5), stone);
      tail.position.set(0, 1.3 - t * 0.08, -0.55 - t * 0.28);
      group.add(tail);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Gibbet cage swinging from the ceiling with what is left of its occupant. */
  public static createHellHangingCage(): THREE.Group {
    const group = new THREE.Group();
    const iron = LevelGenerator.hellIron;

    for (let l = 0; l < 9; l++) {
      const link = new THREE.Mesh(LevelGenerator.geoTorus(0.07, 0.02, 5, 8), iron);
      link.position.y = -0.1 - l * 0.16;
      link.rotation.x = l % 2 === 0 ? Math.PI / 2 : 0;
      group.add(link);
    }

    const crown = new THREE.Mesh(LevelGenerator.geoCyl(0.16, 0.24, 0.16, 8), iron);
    crown.position.y = -1.6;
    group.add(crown);

    const topRing = new THREE.Mesh(LevelGenerator.geoTorus(0.58, 0.05, 6, 14), iron);
    topRing.rotation.x = Math.PI / 2;
    topRing.position.y = -1.85;
    group.add(topRing);

    const midRing = new THREE.Mesh(LevelGenerator.geoTorus(0.6, 0.045, 6, 14), iron);
    midRing.rotation.x = Math.PI / 2;
    midRing.position.y = -2.75;
    group.add(midRing);

    const botRing = new THREE.Mesh(LevelGenerator.geoTorus(0.55, 0.05, 6, 14), iron);
    botRing.rotation.x = Math.PI / 2;
    botRing.position.y = -3.6;
    group.add(botRing);

    for (let b = 0; b < 9; b++) {
      const a = (b * Math.PI * 2) / 9;
      const bar = new THREE.Mesh(LevelGenerator.geoCyl(0.035, 0.035, 1.8, 6), iron);
      bar.position.set(Math.cos(a) * 0.58, -2.72, Math.sin(a) * 0.58);
      group.add(bar);

      const hanger = new THREE.Mesh(LevelGenerator.geoCyl(0.03, 0.03, 0.6, 5), iron);
      hanger.position.set(Math.cos(a) * 0.35, -1.72, Math.sin(a) * 0.35);
      hanger.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
      group.add(hanger);
    }

    const floorPlate = new THREE.Mesh(LevelGenerator.geoCyl(0.55, 0.55, 0.07, 12), iron);
    floorPlate.position.y = -3.62;
    group.add(floorPlate);

    // Occupant
    const skull = LevelGenerator.buildSkull(1.1);
    skull.position.set(0.12, -2.05, 0.1);
    skull.rotation.set(0.8, 0.6, 0.3);
    group.add(skull);

    for (let b = 0; b < 5; b++) {
      const bone = LevelGenerator.buildBone(0.6);
      bone.position.set((LevelGenerator.hash01(b) - 0.5) * 0.7, -3.4 + LevelGenerator.hash01(b * 3.1) * 0.25, (LevelGenerator.hash01(b * 2.3) - 0.5) * 0.7);
      bone.rotation.set(Math.PI / 2, LevelGenerator.hash01(b * 5.7) * Math.PI, LevelGenerator.hash01(b * 7.3) * Math.PI);
      group.add(bone);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Sacrificial altar: obsidian slab, carved blood channel, corner skulls and manacles. */
  public static createHellAltar(): THREE.Group {
    const group = new THREE.Group();
    const obsidian = LevelGenerator.hellObsidian;
    const basalt = LevelGenerator.hellBasalt;
    const blood = LevelGenerator.hellBlood;

    const pedestal = new THREE.Mesh(LevelGenerator.geoBox(2.0, 0.95, 1.2), basalt);
    pedestal.position.y = 0.48;
    pedestal.name = 'wall';
    group.add(pedestal);

    const slab = new THREE.Mesh(LevelGenerator.geoBox(2.7, 0.34, 1.7), obsidian);
    slab.position.y = 1.12;
    slab.name = 'wall';
    group.add(slab);

    const step = new THREE.Mesh(LevelGenerator.geoBox(3.1, 0.22, 2.1), basalt);
    step.position.y = 0.11;
    group.add(step);

    // Blood channel cut into the slab, draining off one end
    const channel = new THREE.Mesh(LevelGenerator.geoBox(2.2, 0.05, 0.2), blood);
    channel.position.set(0, 1.3, 0);
    group.add(channel);

    [-1, 1].forEach((d) => {
      const cross = new THREE.Mesh(LevelGenerator.geoBox(0.18, 0.05, 1.2), blood);
      cross.position.set(d * 0.75, 1.3, 0);
      group.add(cross);
    });

    const spout = new THREE.Mesh(LevelGenerator.geoCyl(0.09, 0.06, 0.3, 8), blood);
    spout.position.set(1.4, 1.15, 0);
    spout.rotation.z = Math.PI / 2;
    group.add(spout);

    const pool = new THREE.Mesh(LevelGenerator.geoCyl(0.5, 0.5, 0.05, 12), blood);
    pool.position.set(1.75, 0.24, 0);
    pool.scale.set(1, 1, 0.8);
    group.add(pool);

    // Runes glowing along the pedestal
    for (let r = 0; r < 5; r++) {
      const rune = new THREE.Mesh(LevelGenerator.geoBox(0.16, 0.3, 0.04), LevelGenerator.hellEmber);
      rune.position.set(-0.8 + r * 0.4, 0.55, 0.62);
      group.add(rune);
    }

    // Corner skulls and manacles
    for (let c = 0; c < 4; c++) {
      const sx = c % 2 === 0 ? -1.15 : 1.15;
      const sz = c < 2 ? -0.68 : 0.68;

      const skull = LevelGenerator.buildSkull(1.0);
      skull.position.set(sx, 1.42, sz);
      skull.rotation.y = LevelGenerator.hash01(c * 3.7) * Math.PI * 2;
      group.add(skull);

      const manacle = new THREE.Mesh(LevelGenerator.geoTorus(0.12, 0.028, 5, 10), LevelGenerator.hellIron);
      manacle.position.set(sx * 1.05, 1.1, sz * 1.1);
      manacle.rotation.x = Math.PI / 2;
      group.add(manacle);

      for (let l = 0; l < 3; l++) {
        const link = new THREE.Mesh(LevelGenerator.geoTorus(0.06, 0.018, 5, 8), LevelGenerator.hellIron);
        link.position.set(sx * 1.08, 0.95 - l * 0.13, sz * 1.15);
        link.rotation.x = l % 2 === 0 ? Math.PI / 2 : 0;
        group.add(link);
      }
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Torn war banner on an iron standard. */
  public static createHellBanner(): THREE.Group {
    const group = new THREE.Group();
    const iron = LevelGenerator.hellIron;
    const cloth = LevelGenerator.hellCloth;

    const pole = new THREE.Mesh(LevelGenerator.geoCyl(0.09, 0.09, 6.2, 8), iron);
    pole.position.y = 3.1;
    group.add(pole);

    const foot = new THREE.Mesh(LevelGenerator.geoCyl(0.34, 0.44, 0.3, 8), LevelGenerator.hellBasalt);
    foot.position.y = 0.15;
    group.add(foot);

    const finial = new THREE.Mesh(LevelGenerator.geoCone(0.14, 0.5, 6), LevelGenerator.hellGold);
    finial.position.y = 6.4;
    group.add(finial);

    const crossbar = new THREE.Mesh(LevelGenerator.geoBox(1.9, 0.09, 0.09), iron);
    crossbar.position.y = 5.7;
    group.add(crossbar);

    // Cloth split into torn strips of differing length
    const stripLengths = [3.4, 3.9, 3.0, 3.6];
    for (let s = 0; s < 4; s++) {
      const len = stripLengths[s];
      const strip = new THREE.Mesh(LevelGenerator.geoBox(0.42, len, 0.04), cloth);
      strip.position.set(-0.68 + s * 0.45, 5.6 - len / 2, 0.06);
      strip.rotation.z = (LevelGenerator.hash01(s * 4.1) - 0.5) * 0.05;
      group.add(strip);

      const tip = new THREE.Mesh(LevelGenerator.geoCone(0.2, 0.4, 3), cloth);
      tip.position.set(-0.68 + s * 0.45, 5.6 - len - 0.18, 0.06);
      tip.rotation.set(Math.PI, 0, (LevelGenerator.hash01(s * 7.3) - 0.5) * 0.5);
      group.add(tip);
    }

    // Emblem: a gilded ring around an inverted spike
    const ring = new THREE.Mesh(LevelGenerator.geoTorus(0.36, 0.05, 6, 16), LevelGenerator.hellGold);
    ring.position.set(0.2, 4.5, 0.1);
    group.add(ring);

    const emblemSpike = new THREE.Mesh(LevelGenerator.geoCone(0.2, 0.62, 5), LevelGenerator.hellGold);
    emblemSpike.position.set(0.2, 4.5, 0.12);
    emblemSpike.rotation.x = Math.PI / 2;
    emblemSpike.rotation.z = Math.PI;
    group.add(emblemSpike);

    for (let t = 0; t < 2; t++) {
      const tassel = new THREE.Mesh(LevelGenerator.geoCyl(0.05, 0.02, 0.42, 6), LevelGenerator.hellGold);
      tassel.position.set(t === 0 ? -0.9 : 0.9, 5.45, 0);
      group.add(tassel);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Low spike barricade with impaled skulls - a waist-high blocker, not a wall. */
  public static createHellSpikeRow(): THREE.Group {
    const group = new THREE.Group();
    const iron = LevelGenerator.hellIron;

    const beam = new THREE.Mesh(LevelGenerator.geoBox(5.0, 0.9, 0.6), LevelGenerator.hellBasalt);
    beam.position.y = 0.45;
    beam.name = 'wall';
    group.add(beam);

    const trim = new THREE.Mesh(LevelGenerator.geoBox(5.2, 0.12, 0.72), LevelGenerator.hellObsidian);
    trim.position.y = 0.9;
    group.add(trim);

    for (let s = 0; s < 8; s++) {
      const sx = -2.45 + s * 0.7;
      const spike = new THREE.Mesh(LevelGenerator.geoCone(0.09, 1.5, 6), iron);
      spike.position.set(sx, 1.7, 0);
      spike.rotation.z = (LevelGenerator.hash01(s * 3.3) - 0.5) * 0.12;
      group.add(spike);

      const collar = new THREE.Mesh(LevelGenerator.geoTorus(0.1, 0.03, 5, 10), iron);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(sx, 1.0, 0);
      group.add(collar);

      if (s % 2 === 0) {
        const skull = LevelGenerator.buildSkull(1.2);
        skull.position.set(sx, 2.05, 0);
        skull.rotation.set(0.35, LevelGenerator.hash01(s * 5.9) * Math.PI * 2, (LevelGenerator.hash01(s * 2.7) - 0.5) * 0.5);
        group.add(skull);
      }
    }

    for (let d = 0; d < 5; d++) {
      const drip = new THREE.Mesh(LevelGenerator.geoBox(0.06, 0.5, 0.05), LevelGenerator.hellBlood);
      drip.position.set(-2.0 + d * 1.0, 0.65, 0.32);
      group.add(drip);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Obsidian shard cluster with molten heat still trapped at the roots. */
  public static createHellObsidianShards(): THREE.Group {
    const group = new THREE.Group();
    const obsidian = LevelGenerator.hellObsidian;

    const monolith = new THREE.Mesh(LevelGenerator.geoCone(0.45, 2.8, 4), obsidian);
    monolith.position.y = 1.4;
    monolith.rotation.y = 0.4;
    monolith.name = 'wall';
    group.add(monolith);

    for (let s = 0; s < 10; s++) {
      const a = s * 2.399 + 0.5;
      const radius = 0.6 + (s / 10) * 1.3;
      const len = 0.7 + LevelGenerator.hash01(s * 4.3) * 1.8;
      const shard = new THREE.Mesh(LevelGenerator.geoCone(0.26, 1.8, 4), obsidian);
      shard.position.set(Math.cos(a) * radius, len / 2, Math.sin(a) * radius);
      shard.scale.set(0.45 + LevelGenerator.hash01(s) * 0.6, len / 1.8, 0.45 + LevelGenerator.hash01(s * 2.9) * 0.6);
      shard.rotation.set(
        (LevelGenerator.hash01(s * 5.1) - 0.5) * 0.5,
        LevelGenerator.hash01(s * 7.7) * Math.PI,
        (LevelGenerator.hash01(s * 9.3) - 0.5) * 0.5
      );
      group.add(shard);
    }

    for (let e = 0; e < 4; e++) {
      const a = e * 1.7;
      const glow = new THREE.Mesh(LevelGenerator.geoTorus(0.34, 0.05, 5, 12), LevelGenerator.hellEmber);
      glow.rotation.x = Math.PI / 2;
      glow.position.set(Math.cos(a) * 0.9, 0.09, Math.sin(a) * 0.9);
      group.add(glow);
    }

    for (let r = 0; r < 9; r++) {
      const a = r * 2.399;
      const chip = new THREE.Mesh(LevelGenerator.geoSphere(0.17, 5, 4), LevelGenerator.hellBasalt);
      chip.position.set(Math.cos(a) * (1.6 + LevelGenerator.hash01(r) * 0.5), 0.08, Math.sin(a) * (1.6 + LevelGenerator.hash01(r * 3.3) * 0.5));
      chip.scale.set(1, 0.5, 1);
      group.add(chip);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Bone chandelier: skull ring, femur drops and guttering candles. Origin at the ceiling. */
  public static createHellBoneChandelier(): THREE.Group {
    const group = new THREE.Group();
    const iron = LevelGenerator.hellIron;

    for (let l = 0; l < 6; l++) {
      const link = new THREE.Mesh(LevelGenerator.geoTorus(0.07, 0.02, 5, 8), iron);
      link.position.y = -0.1 - l * 0.16;
      link.rotation.x = l % 2 === 0 ? Math.PI / 2 : 0;
      group.add(link);
    }

    const hub = new THREE.Mesh(LevelGenerator.geoSphere(0.24, 8, 6), LevelGenerator.hellBone);
    hub.position.y = -1.15;
    group.add(hub);

    const outerRing = new THREE.Mesh(LevelGenerator.geoTorus(1.0, 0.07, 6, 18), LevelGenerator.hellBoneDark);
    outerRing.rotation.x = Math.PI / 2;
    outerRing.position.y = -1.55;
    group.add(outerRing);

    const innerRing = new THREE.Mesh(LevelGenerator.geoTorus(0.6, 0.06, 6, 14), LevelGenerator.hellBoneDark);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = -1.3;
    group.add(innerRing);

    for (let s = 0; s < 6; s++) {
      const a = (s * Math.PI) / 3;

      const spoke = new THREE.Mesh(LevelGenerator.geoCyl(0.035, 0.035, 1.05, 6), iron);
      spoke.position.set(Math.cos(a) * 0.5, -1.35, Math.sin(a) * 0.5);
      spoke.rotation.set(Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3);
      group.add(spoke);

      const candle = new THREE.Mesh(LevelGenerator.geoCyl(0.07, 0.07, 0.4, 8), LevelGenerator.hellBone);
      candle.position.set(Math.cos(a) * 1.0, -1.35, Math.sin(a) * 1.0);
      group.add(candle);

      const wick = new THREE.Mesh(LevelGenerator.geoCone(0.06, 0.24, 5), LevelGenerator.hellFlame);
      wick.position.set(Math.cos(a) * 1.0, -1.05, Math.sin(a) * 1.0);
      group.add(wick);

      const skull = LevelGenerator.buildSkull(1.0);
      skull.position.set(Math.cos(a + 0.5) * 1.0, -1.85, Math.sin(a + 0.5) * 1.0);
      skull.rotation.set(0.3, -a, 0);
      group.add(skull);
    }

    for (let b = 0; b < 8; b++) {
      const a = b * 0.78;
      const bone = LevelGenerator.buildBone(0.8);
      bone.position.set(Math.cos(a) * 0.72, -2.15, Math.sin(a) * 0.72);
      bone.rotation.set((LevelGenerator.hash01(b) - 0.5) * 0.4, a, (LevelGenerator.hash01(b * 3.1) - 0.5) * 0.4);
      group.add(bone);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Throne of black glass on a dais, crowned with bone spikes. */
  public static createHellThrone(): THREE.Group {
    const group = new THREE.Group();
    const obsidian = LevelGenerator.hellObsidian;
    const basalt = LevelGenerator.hellBasalt;

    const dais = new THREE.Mesh(LevelGenerator.geoBox(3.0, 0.4, 2.6), basalt);
    dais.position.y = 0.2;
    dais.name = 'ground';
    group.add(dais);

    const daisTrim = new THREE.Mesh(LevelGenerator.geoBox(3.2, 0.1, 2.8), obsidian);
    daisTrim.position.y = 0.05;
    group.add(daisTrim);

    const seat = new THREE.Mesh(LevelGenerator.geoBox(1.7, 0.3, 1.5), obsidian);
    seat.position.y = 1.05;
    seat.name = 'wall';
    group.add(seat);

    const back = new THREE.Mesh(LevelGenerator.geoBox(1.7, 2.3, 0.28), obsidian);
    back.position.set(0, 2.2, -0.6);
    back.name = 'wall';
    group.add(back);

    for (let l = 0; l < 4; l++) {
      const lx = l % 2 === 0 ? -0.7 : 0.7;
      const lz = l < 2 ? -0.55 : 0.55;
      const leg = new THREE.Mesh(LevelGenerator.geoBox(0.22, 0.7, 0.22), basalt);
      leg.position.set(lx, 0.75, lz);
      group.add(leg);
    }

    [-1, 1].forEach((d) => {
      const arm = new THREE.Mesh(LevelGenerator.geoBox(0.24, 0.24, 1.5), obsidian);
      arm.position.set(d * 0.85, 1.5, -0.05);
      group.add(arm);

      const armPost = new THREE.Mesh(LevelGenerator.geoBox(0.2, 0.5, 0.2), basalt);
      armPost.position.set(d * 0.85, 1.28, 0.6);
      group.add(armPost);

      const skull = LevelGenerator.buildSkull(1.3);
      skull.position.set(d * 0.85, 1.75, 0.62);
      skull.rotation.y = d * 0.4;
      group.add(skull);
    });

    // Bone crown along the top of the backrest
    for (let s = 0; s < 5; s++) {
      const spike = new THREE.Mesh(LevelGenerator.geoCone(0.09, 0.75, 5), LevelGenerator.hellBoneDark);
      spike.position.set(-0.6 + s * 0.3, 3.6 + (s === 2 ? 0.28 : 0), -0.6);
      spike.rotation.z = (s - 2) * 0.09;
      group.add(spike);
    }

    // Gilded inlay on the backrest
    for (let r = 0; r < 3; r++) {
      const inlay = new THREE.Mesh(LevelGenerator.geoBox(1.1 - r * 0.28, 0.07, 0.05), LevelGenerator.hellGold);
      inlay.position.set(0, 1.7 + r * 0.55, -0.44);
      group.add(inlay);
    }

    const sigil = new THREE.Mesh(LevelGenerator.geoTorus(0.28, 0.05, 6, 14), LevelGenerator.hellEmber);
    sigil.position.set(0, 2.6, -0.42);
    group.add(sigil);

    return LevelGenerator.mergeStaticGroup(group);
  }

  /** Fire pit: stone ring, ash bed, charred logs and the remains of whoever fed it. */
  public static createHellFirePit(): THREE.Group {
    const group = new THREE.Group();
    const basalt = LevelGenerator.hellBasalt;
    const char = LevelGenerator.hellChar;

    const ash = new THREE.Mesh(LevelGenerator.geoCyl(1.15, 1.3, 0.12, 14), char);
    ash.position.y = 0.06;
    group.add(ash);

    for (let s = 0; s < 13; s++) {
      const a = (s * Math.PI * 2) / 13;
      const stone = new THREE.Mesh(LevelGenerator.geoSphere(0.28, 5, 4), basalt);
      stone.position.set(Math.cos(a) * 1.35, 0.14, Math.sin(a) * 1.35);
      stone.scale.set(0.8 + LevelGenerator.hash01(s) * 0.6, 0.7 + LevelGenerator.hash01(s * 2.3) * 0.6, 0.8 + LevelGenerator.hash01(s * 4.7) * 0.6);
      stone.rotation.set(LevelGenerator.hash01(s * 3.1) * 3.0, LevelGenerator.hash01(s * 5.9) * 3.0, 0);
      group.add(stone);
    }

    for (let l = 0; l < 5; l++) {
      const a = (l * Math.PI) / 5 + 0.3;
      const log = new THREE.Mesh(LevelGenerator.geoCyl(0.13, 0.11, 1.5, 7), char);
      log.position.set(Math.cos(a) * 0.2, 0.24 + l * 0.06, Math.sin(a) * 0.2);
      log.rotation.set(Math.PI / 2 - 0.15, a, 0.1);
      group.add(log);
    }

    for (let e = 0; e < 8; e++) {
      const a = e * 2.399;
      const ember = new THREE.Mesh(LevelGenerator.geoSphere(0.1, 5, 4), LevelGenerator.hellEmber);
      ember.position.set(Math.cos(a) * 0.6 * LevelGenerator.hash01(e), 0.16, Math.sin(a) * 0.6 * LevelGenerator.hash01(e + 2));
      ember.scale.setScalar(0.6 + LevelGenerator.hash01(e * 3.7) * 0.8);
      group.add(ember);
    }

    for (let f = 0; f < 3; f++) {
      const a = f * 2.1;
      const flame = new THREE.Mesh(LevelGenerator.geoCone(0.18, 0.7, 5), f === 1 ? LevelGenerator.hellFlame : LevelGenerator.hellLava);
      flame.position.set(Math.cos(a) * 0.25, 0.55 + LevelGenerator.hash01(f) * 0.2, Math.sin(a) * 0.25);
      flame.scale.setScalar(0.6 + LevelGenerator.hash01(f * 5.3) * 0.6);
      group.add(flame);
    }

    // Charred remains slumped over the rim
    const skull = LevelGenerator.buildSkull(1.15);
    skull.position.set(-1.1, 0.32, 0.55);
    skull.rotation.set(1.3, 0.7, 0.2);
    group.add(skull);

    for (let b = 0; b < 4; b++) {
      const bone = LevelGenerator.buildBone(1.0);
      bone.position.set(-0.9 + LevelGenerator.hash01(b) * 0.5, 0.2, 0.7 + LevelGenerator.hash01(b * 3.3) * 0.6);
      bone.rotation.set(Math.PI / 2, LevelGenerator.hash01(b * 6.1) * Math.PI, LevelGenerator.hash01(b * 8.9) * Math.PI);
      group.add(bone);
    }

    return LevelGenerator.mergeStaticGroup(group);
  }
}
