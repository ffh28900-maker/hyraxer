import * as THREE from 'three';
import { RoomInfo } from './LevelGenerator';

/**
 * SceneCuller - visibility & light budgeting for the streamed room/corridor levels.
 *
 * WHY THIS EXISTS
 * ---------------
 * The level generator already recorded which objects belong to which room
 * (RoomInfo.objects), but nothing ever consumed that data: every room of every level
 * stayed in the scene graph, fully visible, for the entire run. On a 14-room level that
 * meant the renderer walked thousands of Meshes and evaluated every PointLight in the map
 * on every frame, even though the player can only ever see one room and its corridor.
 *
 * Two budgets are enforced here:
 *
 * 1. ROOM VISIBILITY - only the player's room plus its immediate neighbours are drawn.
 *    Rooms are sealed boxes joined by corridors, so distant rooms were never visible
 *    anyway; hiding them is pixel-for-pixel identical output at a fraction of the cost.
 *
 * 2. POINT LIGHT BUDGET - Three.js forward rendering evaluates *every* visible light in
 *    *every* lit fragment. 22+ PointLights across ~190 MeshStandardMaterials was the single
 *    most expensive thing in the frame. Only lights that can actually reach the camera stay
 *    on, and the active count is pinned to a constant so the renderer compiles one program
 *    variant per material instead of recompiling (and hitching) whenever the count shifts.
 *
 * IMPORTANT INVARIANT: collision must NOT depend on Object3D.visible.
 *
 * THREE's Raycaster stopped testing `object.visible` in r114 (this project is on r185), so
 * hidden geometry still produces hits - culling here does not silently disable collision.
 * What *would* break it is the application-level filtering: the collision code used to build
 * its candidate list with `o.visible && o.name === 'wall'`. That was a harmless no-op while
 * nothing was ever hidden, but combined with culling it would drop culled floors/walls from
 * the candidate list and let the player fall through the world. Those filters are now
 * name-only - see PlayerEngine.getWalls, EnemyEngine.getObstacles and
 * GameEngine.getStaticLevelMeshes. Do not re-add a `.visible` check to any of them.
 */
export class SceneCuller {
  /** Rooms kept visible on each side of the player's current room. */
  private static readonly ROOM_WINDOW = 1;

  /**
   * Number of PointLights kept live. Held constant so THREE's program cache (keyed partly on
   * light count) stays warm - a fluctuating count causes shader recompile stalls, which is
   * exactly the "random freeze" symptom.
   */
  private static readonly POINT_LIGHT_BUDGET = 8;

  /** Light re-selection cadence. Lights only matter as the player moves, so ~12Hz is plenty. */
  private static readonly LIGHT_UPDATE_INTERVAL = 0.08;

  private rooms: RoomInfo[];

  /**
   * Every level PointLight paired with the room that owns it (undefined = not owned by any
   * room, e.g. global lights, so it is never room-culled).
   *
   * Lights are found by traversing each room's recorded objects rather than just the scene's
   * direct children: several are nested inside groups (barrier lock assemblies, holo props),
   * and those nested ones are numerous enough to matter.
   */
  private lights: Array<{ light: THREE.PointLight; roomId: number | undefined }> = [];

  /** Room ids whose geometry is currently shown. */
  private activeRoomIds: Set<number> = new Set();
  private lastAppliedRoomId: number | null = null;

  private lightTimer: number = 0;

  /** Scratch scoring buffer, reused to keep the frame allocation-free. */
  private lightScores: Array<{ light: THREE.PointLight; score: number }> = [];

  constructor(scene: THREE.Scene, rooms: RoomInfo[] | undefined, excludeRoot?: THREE.Object3D) {
    this.rooms = rooms ?? [];

    // Map light -> owning room by walking each room's recorded object subtrees.
    const seen = new Set<THREE.PointLight>();
    for (const room of this.rooms) {
      for (const obj of room.objects) {
        obj.traverse((child) => {
          if ((child as THREE.PointLight).isPointLight) {
            const light = child as THREE.PointLight;
            if (!seen.has(light)) {
              seen.add(light);
              this.lights.push({ light, roomId: room.id });
            }
          }
        });
      }
    }

    // Catch any remaining lights that no room claims (global/ambient-style point lights),
    // while never touching viewmodel FX lights parented under the camera.
    scene.traverse((child) => {
      if (!(child as THREE.PointLight).isPointLight) return;
      const light = child as THREE.PointLight;
      if (seen.has(light)) return;
      if (excludeRoot && SceneCuller.isDescendantOf(light, excludeRoot)) return;
      seen.add(light);
      this.lights.push({ light, roomId: undefined });
    });

    for (const entry of this.lights) {
      this.lightScores.push({ light: entry.light, score: 0 });
    }
  }

  private static isDescendantOf(obj: THREE.Object3D, root: THREE.Object3D): boolean {
    let cursor: THREE.Object3D | null = obj;
    while (cursor) {
      if (cursor === root) return true;
      cursor = cursor.parent;
    }
    return false;
  }

  /**
   * Show the player's room plus ROOM_WINDOW neighbours; hide everything else.
   * Only touches the scene graph when the player actually changes room.
   *
   * @returns true when the active-room set changed (callers use this to run
   *          room-change-only work, e.g. enemy visibility, instead of doing it per frame).
   */
  public updateRoomVisibility(currentRoomId: number): boolean {
    if (this.rooms.length === 0) return false;
    if (this.lastAppliedRoomId === currentRoomId) return false;
    this.lastAppliedRoomId = currentRoomId;

    this.activeRoomIds.clear();
    for (let d = -SceneCuller.ROOM_WINDOW; d <= SceneCuller.ROOM_WINDOW; d++) {
      this.activeRoomIds.add(currentRoomId + d);
    }

    for (let i = 0; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      const shouldBeVisible = this.activeRoomIds.has(room.id);
      const objects = room.objects;
      if (!objects || objects.length === 0) continue;

      for (let j = 0; j < objects.length; j++) {
        const obj = objects[j];
        if (obj.visible !== shouldBeVisible) {
          obj.visible = shouldBeVisible;
        }
      }
    }

    // Room visibility just rewrote some light .visible flags wholesale; re-apply the budget
    // immediately so the two systems can't disagree for a frame.
    this.lightTimer = 0;

    return true;
  }

  /**
   * Keep at most POINT_LIGHT_BUDGET lights enabled, chosen from the rooms that are currently
   * drawn.
   *
   * Relevance = how far the camera sits *outside* a light's falloff radius. A light whose
   * sphere of influence contains the camera scores negative (highest priority); one the
   * camera is well outside scores high and is dropped. This preserves the lighting the
   * player can actually perceive and discards lights contributing nothing.
   */
  public updateLightBudget(cameraPos: THREE.Vector3, delta: number, force: boolean = false) {
    if (this.lights.length === 0) return;

    this.lightTimer -= delta;
    if (!force && this.lightTimer > 0) return;
    this.lightTimer = SceneCuller.LIGHT_UPDATE_INTERVAL;

    // Candidates = lights in active rooms (or unowned). Lights in culled rooms stay off:
    // their room's geometry isn't drawn, so re-enabling them would only cost fill rate.
    let candidateCount = 0;
    for (let i = 0; i < this.lights.length; i++) {
      const entry = this.lights[i];
      const roomAllowed = entry.roomId === undefined || this.activeRoomIds.size === 0
        ? true
        : this.activeRoomIds.has(entry.roomId);

      if (!roomAllowed) {
        if (entry.light.visible) entry.light.visible = false;
        continue;
      }

      const dist = entry.light.position.distanceTo(cameraPos);
      // distance === 0 means infinite range in THREE, so treat it as always relevant.
      const range = entry.light.distance > 0 ? entry.light.distance : Number.MAX_SAFE_INTEGER / 2;
      this.lightScores[candidateCount].light = entry.light;
      this.lightScores[candidateCount].score = dist - range;
      candidateCount++;
    }

    if (candidateCount === 0) return;

    // Selection sort over just the first POINT_LIGHT_BUDGET slots. candidateCount is small
    // (tens), the budget is 8, so this is ~8*N comparisons with zero allocation - cheaper
    // than Array.sort and, unlike slice(), it produces no garbage on a path that runs
    // several times per second.
    const keep = Math.min(SceneCuller.POINT_LIGHT_BUDGET, candidateCount);
    for (let i = 0; i < keep; i++) {
      let minIdx = i;
      for (let j = i + 1; j < candidateCount; j++) {
        if (this.lightScores[j].score < this.lightScores[minIdx].score) {
          minIdx = j;
        }
      }
      if (minIdx !== i) {
        const tmp = this.lightScores[i];
        this.lightScores[i] = this.lightScores[minIdx];
        this.lightScores[minIdx] = tmp;
      }
    }

    for (let i = 0; i < candidateCount; i++) {
      const shouldBeVisible = i < keep;
      const light = this.lightScores[i].light;
      if (light.visible !== shouldBeVisible) {
        light.visible = shouldBeVisible;
      }
    }
  }

  /** True when the room is currently drawn - used to skip offscreen work elsewhere. */
  public isRoomActive(roomId: number): boolean {
    if (this.rooms.length === 0) return true;
    if (this.activeRoomIds.size === 0) return true;
    return this.activeRoomIds.has(roomId);
  }
}
