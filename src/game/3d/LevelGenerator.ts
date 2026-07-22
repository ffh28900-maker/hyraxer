import * as THREE from 'three';
import { EnemyType } from '../../types';
import { TextureGenerator } from './TextureGenerator';

export interface LevelData {
  scene: THREE.Scene;
  playerSpawn: THREE.Vector3;
  enemySpawns: Array<{ position: THREE.Vector3; type: EnemyType }>;
  finishZone: { min: THREE.Vector3; max: THREE.Vector3 };
  biomeName: string;
  isBossLevel: boolean;
  isSecretLevel: boolean;
  hasFlashlight: boolean;
}

export class LevelGenerator {
  public static generateLevel(levelNumber: number): LevelData {
    const scene = new THREE.Scene();
    const enemySpawns: Array<{ position: THREE.Vector3; type: EnemyType }> = [];
    const playerSpawn = new THREE.Vector3(0, 1.8, 5);

    const isBossLevel = levelNumber === 4 || levelNumber === 8 || levelNumber === 12 || levelNumber === 16;
    const isSecretLevel = levelNumber === 17;
    const hasFlashlight = levelNumber >= 9 && levelNumber <= 12;

    let biomeName = 'Burning City';
    let fogColor = 0x1f0a02;
    let lightColor = 0xff6600;

    let floorTexture: THREE.CanvasTexture = TextureGenerator.getAsphaltLavaTexture();
    let wallTexture: THREE.CanvasTexture = TextureGenerator.getCityWallTexture();

    if (levelNumber >= 1 && levelNumber <= 4) {
      biomeName = 'Ruined Burning City';
      fogColor = 0x220c02;
      lightColor = 0xff5500;
      floorTexture = TextureGenerator.getAsphaltLavaTexture();
      wallTexture = TextureGenerator.getCityWallTexture();
    } else if (levelNumber >= 5 && levelNumber <= 8) {
      biomeName = 'Ruined Subway';
      fogColor = 0x030c14;
      lightColor = 0x00aaff;
      floorTexture = TextureGenerator.getSubwayFloorTexture();
      wallTexture = TextureGenerator.getSubwayTileTexture();
    } else if (levelNumber >= 9 && levelNumber <= 12) {
      biomeName = 'Dark Mine';
      fogColor = 0x020202;
      lightColor = 0xffaa00;
      floorTexture = TextureGenerator.getMineRockTexture();
      wallTexture = TextureGenerator.getMineRockTexture();
    } else if (levelNumber >= 13 && levelNumber <= 16) {
      biomeName = 'Hellish Domain';
      fogColor = 0x180202;
      lightColor = 0xff0022;
      floorTexture = TextureGenerator.getObsidianRuneTexture();
      wallTexture = TextureGenerator.getObsidianRuneTexture();
    } else if (levelNumber === 17) {
      biomeName = 'White Void (Mind Lab)';
      fogColor = 0xffffff;
      lightColor = 0x00ffff;
      floorTexture = TextureGenerator.getWhiteVoidTexture();
    }

    // Fog
    scene.fog = new THREE.FogExp2(fogColor, isSecretLevel ? 0.003 : isBossLevel ? 0.01 : 0.015);

    // Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(
      isSecretLevel ? 0xffffff : 0x333333,
      isSecretLevel ? 1.2 : isBossLevel ? 0.8 : 0.5
    );
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(lightColor, isSecretLevel ? 1.5 : 1.2);
    dirLight.position.set(15, 30, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Arena dimensions
    const arenaLength = isBossLevel || isSecretLevel ? 70 : 130;
    const arenaWidth = isBossLevel || isSecretLevel ? 50 : 22;

    // --- HIGH DETAIL FLOOR ---
    const floorGeo = new THREE.PlaneGeometry(arenaWidth, arenaLength);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.5,
      metalness: isSecretLevel ? 0.9 : 0.3,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -arenaLength / 2 + 10);
    floor.receiveShadow = true;
    floor.name = 'ground';
    scene.add(floor);

    // Grid helper for Secret 17
    if (isSecretLevel) {
      const gridHelper = new THREE.GridHelper(arenaWidth, 25, 0x00ffff, 0x00a8a8);
      gridHelper.position.set(0, 0.05, -arenaLength / 2 + 10);
      scene.add(gridHelper);
    }

    // --- HIGH DETAIL WALLS ---
    const wallHeight = 16;
    const wallGeoY = new THREE.BoxGeometry(1.5, wallHeight, arenaLength);
    const wallMat = new THREE.MeshStandardMaterial({
      map: isSecretLevel ? undefined : wallTexture,
      color: isSecretLevel ? 0xffffff : 0xffffff,
      roughness: 0.7,
      metalness: 0.2,
    });

    const leftWall = new THREE.Mesh(wallGeoY, wallMat);
    leftWall.position.set(-arenaWidth / 2, wallHeight / 2, -arenaLength / 2 + 10);
    leftWall.name = 'wall';
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeoY, wallMat);
    rightWall.position.set(arenaWidth / 2, wallHeight / 2, -arenaLength / 2 + 10);
    rightWall.name = 'wall';
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Back Wall
    const backWallGeo = new THREE.BoxGeometry(arenaWidth, wallHeight, 1.5);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, wallHeight / 2, -arenaLength + 10);
    backWall.name = 'wall';
    backWall.receiveShadow = true;
    scene.add(backWall);

    // --- CHAPTER SPECIFIC DECORATIONS ---
    if (levelNumber >= 1 && levelNumber <= 4) {
      // CHAPTER 1: RUINED BURNING CITY
      // Skyscraper Pillars
      for (let z = -10; z > -arenaLength + 20; z -= 25) {
        const pillarGeo = new THREE.BoxGeometry(2.5, 16, 2.5);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1f1917, roughness: 0.8 });
        
        const p1 = new THREE.Mesh(pillarGeo, pillarMat);
        p1.position.set(-arenaWidth / 2 + 3, 8, z);
        p1.name = 'wall';
        scene.add(p1);

        const p2 = new THREE.Mesh(pillarGeo, pillarMat);
        p2.position.set(arenaWidth / 2 - 3, 8, z - 10);
        p2.name = 'wall';
        scene.add(p2);

        // Burning Debris Piles
        const light = new THREE.PointLight(0xff5500, 2.5, 12);
        light.position.set((Math.random() - 0.5) * 8, 1, z);
        scene.add(light);

        // Debris box
        const deb = new THREE.Mesh(
          new THREE.BoxGeometry(2, 1.2, 2),
          new THREE.MeshStandardMaterial({ color: 0x110c0a, emissive: 0xff3300, emissiveIntensity: 0.3 })
        );
        deb.position.copy(light.position);
        deb.position.y = 0.6;
        scene.add(deb);
      }
    } else if (levelNumber >= 5 && levelNumber <= 8) {
      // CHAPTER 2: RUINED SUBWAY
      // Train Carriage Hulls & Blue Fluorescent Tubes
      for (let z = -15; z > -arenaLength + 20; z -= 30) {
        const trainGeo = new THREE.BoxGeometry(3.5, 3.2, 12);
        const trainMat = new THREE.MeshStandardMaterial({ color: 0x112233, metalness: 0.8, roughness: 0.3 });
        const train = new THREE.Mesh(trainGeo, trainMat);
        const side = (z / 30) % 2 === 0 ? -arenaWidth / 2 + 3 : arenaWidth / 2 - 3;
        train.position.set(side, 1.6, z);
        train.name = 'wall';
        scene.add(train);

        // Overhead Cyan Lights
        const cyanLight = new THREE.PointLight(0x00aaff, 2, 15);
        cyanLight.position.set(0, 8, z);
        scene.add(cyanLight);

        const tubeGeo = new THREE.CylinderGeometry(0.1, 0.1, 4);
        const tubeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        tube.rotation.z = Math.PI / 2;
        tube.position.copy(cyanLight.position);
        scene.add(tube);
      }
    } else if (levelNumber >= 9 && levelNumber <= 12) {
      // CHAPTER 3: DARK MINE
      // Heavy Timber Archways & Amber Mining Lanterns
      for (let z = -12; z > -arenaLength + 15; z -= 20) {
        const archMat = new THREE.MeshStandardMaterial({ color: 0x221812, roughness: 0.9 });
        
        // Left post
        const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), archMat);
        p1.position.set(-arenaWidth / 2 + 1.5, 4, z);
        scene.add(p1);

        // Right post
        const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), archMat);
        p2.position.set(arenaWidth / 2 - 1.5, 4, z);
        scene.add(p2);

        // Cross beam
        const beam = new THREE.Mesh(new THREE.BoxGeometry(arenaWidth - 2, 0.8, 0.8), archMat);
        beam.position.set(0, 7.6, z);
        scene.add(beam);

        // Amber Lantern
        const amberLight = new THREE.PointLight(0xffaa00, 3, 14);
        amberLight.position.set(0, 6.8, z);
        scene.add(amberLight);

        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
        lantern.position.copy(amberLight.position);
        scene.add(lantern);
      }
    } else if (levelNumber >= 13 && levelNumber <= 16) {
      // CHAPTER 4: HELLISH DOMAIN
      // Demonic Obsidian Spires & Magma Streams
      for (let z = -15; z > -arenaLength + 20; z -= 25) {
        const spireGeo = new THREE.ConeGeometry(1.8, 14, 6);
        const spireMat = new THREE.MeshStandardMaterial({
          color: 0x0d0202,
          emissive: 0xff0000,
          emissiveIntensity: 0.3,
          roughness: 0.2,
          metalness: 0.8,
        });

        const s1 = new THREE.Mesh(spireGeo, spireMat);
        s1.position.set(-arenaWidth / 2 + 2, 7, z);
        s1.name = 'wall';
        scene.add(s1);

        const s2 = new THREE.Mesh(spireGeo, spireMat);
        s2.position.set(arenaWidth / 2 - 2, 7, z - 8);
        s2.name = 'wall';
        scene.add(s2);

        // Red Magma Point Light
        const redLight = new THREE.PointLight(0xff0022, 3.5, 16);
        redLight.position.set(0, 1, z);
        scene.add(redLight);
      }
    } else if (levelNumber === 17) {
      // SECRET LEVEL 17: WHITE VOID MIND LAB
      for (let z = -15; z > -arenaLength + 15; z -= 20) {
        const pillarGeo = new THREE.CylinderGeometry(0.5, 0.5, 12, 16);
        const pillarMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0x00ffff,
          emissiveIntensity: 0.5,
          roughness: 0.1,
          metalness: 0.9,
        });

        const p1 = new THREE.Mesh(pillarGeo, pillarMat);
        p1.position.set(-arenaWidth / 2 + 3, 6, z);
        scene.add(p1);

        const p2 = new THREE.Mesh(pillarGeo, pillarMat);
        p2.position.set(arenaWidth / 2 - 3, 6, z);
        scene.add(p2);

        const cyanLight = new THREE.PointLight(0x00ffff, 2, 15);
        cyanLight.position.set(0, 6, z);
        scene.add(cyanLight);
      }
    }

    // Elevated Parkour Platforms
    if (!isBossLevel && !isSecretLevel) {
      for (let p = 0; p < 6; p++) {
        const platGeo = new THREE.BoxGeometry(6.5, 0.8, 6.5);
        const platMat = new THREE.MeshStandardMaterial({
          color: isSecretLevel ? 0xffffff : 0x222222,
          emissive: lightColor,
          emissiveIntensity: 0.2,
          metalness: 0.7,
        });
        const plat = new THREE.Mesh(platGeo, platMat);
        const side = p % 2 === 0 ? -6 : 6;
        plat.position.set(side, 3 + p * 1.5, -15 - p * 16);
        plat.name = 'ground';
        plat.castShadow = true;
        plat.receiveShadow = true;
        scene.add(plat);
      }
    }

    // Spawn Enemies or Bosses
    if (isBossLevel) {
      let bossType: EnemyType = 'boss_goliath';
      if (levelNumber === 4) bossType = 'boss_goliath';
      else if (levelNumber === 8) bossType = 'boss_worm';
      else if (levelNumber === 12) bossType = 'boss_miner';
      else if (levelNumber === 16) bossType = 'boss_overlord';

      enemySpawns.push({ position: new THREE.Vector3(0, 0, -28), type: bossType });
    } else if (isSecretLevel) {
      enemySpawns.push({ position: new THREE.Vector3(0, 0, -22), type: 'boss_ultradoman' });
    } else {
      const enemyPool: EnemyType[] = [];
      if (levelNumber <= 4) enemyPool.push('robo_doman', 'doman_sniper', 'drone');
      else if (levelNumber <= 8) enemyPool.push('centipede', 'worm', 'spider_spitter');
      else if (levelNumber <= 12) enemyPool.push('doman_dynamiter', 'doman_miner', 'doman_archer');
      else enemyPool.push('imp_doman', 'winged_doman', 'skeleton_doman');

      const enemyCount = 8 + levelNumber * 2;
      for (let e = 0; e < enemyCount; e++) {
        const type = enemyPool[e % enemyPool.length];
        const x = (Math.random() - 0.5) * (arenaWidth - 6);
        const z = -15 - Math.random() * (arenaLength - 30);
        enemySpawns.push({ position: new THREE.Vector3(x, 0, z), type });
      }
    }

    // Finish Portal Zone
    const finishPos = new THREE.Vector3(0, 1.5, -arenaLength + 15);
    const finishZone = {
      min: new THREE.Vector3(finishPos.x - 3.5, 0, finishPos.z - 3.5),
      max: new THREE.Vector3(finishPos.x + 3.5, 5, finishPos.z + 3.5),
    };

    // Portal mesh with particle ring
    const portalGeo = new THREE.CylinderGeometry(2.5, 2.5, 0.3, 24);
    const portalMat = new THREE.MeshBasicMaterial({ color: isSecretLevel ? 0x00ffff : 0xffaa00 });
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.position.copy(finishPos);
    portal.rotation.x = Math.PI / 2;
    scene.add(portal);

    const portalLight = new THREE.PointLight(isSecretLevel ? 0x00ffff : 0xffaa00, 3, 10);
    portalLight.position.copy(finishPos);
    scene.add(portalLight);

    return {
      scene,
      playerSpawn,
      enemySpawns,
      finishZone,
      biomeName,
      isBossLevel,
      isSecretLevel,
      hasFlashlight,
    };
  }
}

