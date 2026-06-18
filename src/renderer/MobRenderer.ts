import * as THREE from 'three';
import { Mob } from '../entities/Mob';

/**
 * Renders mobs as simple blocky models (a Minecraft-style pig: body, head,
 * snout, and four animated legs). Geometries and materials are shared across all
 * instances; per-mob we only create lightweight Object3D groups. Two lights are
 * added for the Lambert-shaded models — they don't affect the chunk shader
 * (which is self-lit) and their intensity tracks the day/night cycle.
 */

// Shared geometry (created once; never disposed for the app's lifetime).
const bodyGeo = new THREE.BoxGeometry(0.62, 0.6, 0.92);
const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const snoutGeo = new THREE.BoxGeometry(0.26, 0.2, 0.1);
const legGeo = new THREE.BoxGeometry(0.2, 0.36, 0.2);

const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe8a0a0 });
const snoutMat = new THREE.MeshLambertMaterial({ color: 0xc97c7c });
const legMat = new THREE.MeshLambertMaterial({ color: 0xd98c8c });

interface MobModel {
  root: THREE.Group;
  legs: THREE.Object3D[]; // [front-left, front-right, back-left, back-right]
}

function buildPig(): MobModel {
  const root = new THREE.Group();

  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0.65, 0);

  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, 0.72, -0.62); // front is -Z (forward)

  const snout = new THREE.Mesh(snoutGeo, snoutMat);
  snout.position.set(0, 0.64, -0.9);

  root.add(body, head, snout);

  // Legs hang from hip pivots so rotating about X swings the foot.
  const mkLeg = (x: number, z: number): THREE.Object3D => {
    const pivot = new THREE.Object3D();
    pivot.position.set(x, 0.36, z);
    const mesh = new THREE.Mesh(legGeo, legMat);
    mesh.position.set(0, -0.18, 0);
    pivot.add(mesh);
    root.add(pivot);
    return pivot;
  };
  const fl = mkLeg(-0.18, -0.3);
  const fr = mkLeg(0.18, -0.3);
  const bl = mkLeg(-0.18, 0.3);
  const br = mkLeg(0.18, 0.3);

  return { root, legs: [fl, fr, bl, br] };
}

export class MobRenderer {
  private readonly group = new THREE.Group();
  private readonly models = new Map<Mob, MobModel>();
  private readonly ambient: THREE.AmbientLight;
  private readonly sun: THREE.DirectionalLight;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.6);
    this.sun.position.set(0.5, 1, 0.3);
    scene.add(this.ambient, this.sun);
  }

  /** Scale light intensity with daylight so mobs darken at night. */
  setDaylight(d: number): void {
    this.ambient.intensity = 0.25 + 0.55 * d;
    this.sun.intensity = 0.15 + 0.6 * d;
  }

  add(mob: Mob): void {
    const model = buildPig();
    this.group.add(model.root);
    this.models.set(mob, model);
  }

  remove(mob: Mob): void {
    const model = this.models.get(mob);
    if (!model) return;
    this.group.remove(model.root);
    this.models.delete(mob);
  }

  /** Update every model's transform + leg swing from its mob's state. */
  sync(mobs: Mob[]): void {
    for (const mob of mobs) {
      const model = this.models.get(mob);
      if (!model) continue;
      model.root.position.set(mob.position.x, mob.position.y, mob.position.z);
      model.root.rotation.y = mob.yaw;

      const swing = mob.moving ? Math.sin(mob.walkPhase) * 0.6 : 0;
      model.legs[0].rotation.x = swing; // front-left  )
      model.legs[3].rotation.x = swing; // back-right   } diagonal gait
      model.legs[1].rotation.x = -swing; // front-right )
      model.legs[2].rotation.x = -swing; // back-left   } opposite phase
    }
  }
}
