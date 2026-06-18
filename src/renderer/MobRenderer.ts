import * as THREE from 'three';
import { Mob } from '../entities/Mob';
import { MobKind } from '../entities/MobType';

/**
 * Renders mobs as blocky models — one builder per species. Geometries and the
 * opaque body materials are shared/cached across instances; per mob we only
 * create lightweight Object3D groups plus a translucent red "hurt" overlay
 * (toggled on damage) so flashing works without per-instance materials.
 *
 * Legs animate from the mob's walk phase (diagonal gait for quadrupeds,
 * alternating for bipeds/spiders); chickens flap wings, slimes squash, and the
 * creeper swells + flashes white as its fuse charges. Two lights drive the
 * Lambert shading and track the day/night cycle (the chunk shader is self-lit).
 */

const geoCache = new Map<string, THREE.BoxGeometry>();
function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const k = `${w},${h},${d}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(k, g);
  }
  return g;
}

const matCache = new Map<number, THREE.MeshLambertMaterial>();
function mat(hex: number): THREE.MeshLambertMaterial {
  let m = matCache.get(hex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex });
    matCache.set(hex, m);
  }
  return m;
}

function box(w: number, h: number, d: number, hex: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat(hex));
  m.position.set(x, y, z);
  return m;
}

/** A leg/arm that hangs from a pivot so rotating about X swings the foot/hand. */
function limb(x: number, z: number, w: number, h: number, d: number, hex: number, pivotY = h): THREE.Object3D {
  const p = new THREE.Object3D();
  p.position.set(x, pivotY, z);
  p.add(box(w, h, d, hex, 0, -h / 2, 0));
  return p;
}

interface MobModel {
  root: THREE.Group;
  legs: THREE.Object3D[];
  legSigns: number[];
  legAmp: number;
  wings: THREE.Object3D[];
  squash?: THREE.Object3D; // slime body
  hurtOverlay: THREE.Mesh;
  primeOverlay?: THREE.Mesh; // creeper white flash
  kind: MobKind;
}

function overlay(w: number, h: number, d: number, hex: number): THREE.Mesh {
  const m = new THREE.Mesh(
    boxGeo(w, h, d),
    new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  m.visible = false;
  return m;
}

// ---- Model builders (forward = -Z) ----

function quadruped(
  bodyW: number, bodyH: number, bodyL: number, bodyHex: number,
  legW: number, legH: number, legHex: number,
  headSize: number, headHex: number, headY: number,
): { root: THREE.Group; legs: THREE.Object3D[]; bodyY: number } {
  const root = new THREE.Group();
  const bodyY = legH + bodyH / 2;
  root.add(box(bodyW, bodyH, bodyL, bodyHex, 0, bodyY, 0));
  root.add(box(headSize, headSize, headSize, headHex, 0, headY, -bodyL / 2 - headSize / 4));
  const hx = bodyW / 2 - legW / 2;
  const hz = bodyL / 2 - legW / 2;
  const legs = [
    limb(-hx, -hz, legW, legH, legW, legHex), // FL
    limb(hx, -hz, legW, legH, legW, legHex), // FR
    limb(-hx, hz, legW, legH, legW, legHex), // BL
    limb(hx, hz, legW, legH, legW, legHex), // BR
  ];
  legs.forEach((l) => root.add(l));
  return { root, legs, bodyY };
}

function buildPig(): Partial<MobModel> {
  const q = quadruped(0.62, 0.55, 0.92, 0xe8a0a0, 0.2, 0.35, 0xd98c8c, 0.5, 0xe8a0a0, 0.72);
  q.root.add(box(0.26, 0.2, 0.1, 0xc97c7c, 0, 0.64, -0.92)); // snout
  return { root: q.root, legs: q.legs, legSigns: [1, -1, -1, 1], legAmp: 0.6 };
}

function buildCow(): Partial<MobModel> {
  const q = quadruped(0.72, 0.7, 1.1, 0x5a4632, 0.22, 0.55, 0x3f3024, 0.5, 0x4a3826, 1.05);
  q.root.add(box(0.42, 0.3, 0.12, 0xf0e6d6, 0, 0.95, -1.12)); // snout
  q.root.add(box(0.08, 0.16, 0.08, 0xe8e0d0, -0.16, 1.32, -0.95)); // horn L
  q.root.add(box(0.08, 0.16, 0.08, 0xe8e0d0, 0.16, 1.32, -0.95)); // horn R
  q.root.add(box(0.5, 0.4, 0.6, 0xf0ece2, 0.2, 0.85, 0.25)); // white patch
  return { root: q.root, legs: q.legs, legSigns: [1, -1, -1, 1], legAmp: 0.5 };
}

function buildSheep(): Partial<MobModel> {
  const root = new THREE.Group();
  const legH = 0.4;
  root.add(box(0.82, 0.78, 1.0, 0xf2efe6, 0, legH + 0.39, 0)); // woolly body
  root.add(box(0.42, 0.46, 0.42, 0xe6dccb, 0, legH + 0.6, -0.62)); // head
  root.add(box(0.34, 0.34, 0.12, 0x6b5d4d, 0, legH + 0.55, -0.84)); // face
  const legs = [
    limb(-0.26, -0.3, 0.18, legH, 0.18, 0x4a4036),
    limb(0.26, -0.3, 0.18, legH, 0.18, 0x4a4036),
    limb(-0.26, 0.3, 0.18, legH, 0.18, 0x4a4036),
    limb(0.26, 0.3, 0.18, legH, 0.18, 0x4a4036),
  ];
  legs.forEach((l) => root.add(l));
  return { root, legs, legSigns: [1, -1, -1, 1], legAmp: 0.45 };
}

function buildChicken(): Partial<MobModel> {
  const root = new THREE.Group();
  const legH = 0.24;
  root.add(box(0.3, 0.36, 0.42, 0xf2f2f2, 0, legH + 0.18, 0)); // body
  root.add(box(0.24, 0.24, 0.24, 0xf2f2f2, 0, legH + 0.46, -0.2)); // head
  root.add(box(0.1, 0.08, 0.12, 0xe0992a, 0, legH + 0.44, -0.36)); // beak
  root.add(box(0.08, 0.12, 0.04, 0xd23030, 0, legH + 0.34, -0.3)); // wattle
  const wings = [
    limb(-0.17, 0, 0.06, 0.3, 0.34, 0xe6e6e6, legH + 0.34),
    limb(0.17, 0, 0.06, 0.3, 0.34, 0xe6e6e6, legH + 0.34),
  ];
  wings.forEach((w) => root.add(w));
  const legs = [
    limb(-0.09, 0, 0.07, legH, 0.07, 0xe0992a),
    limb(0.09, 0, 0.07, legH, 0.07, 0xe0992a),
  ];
  legs.forEach((l) => root.add(l));
  return { root, legs, legSigns: [1, -1], legAmp: 0.7, wings };
}

/** Humanoid biped: torso, head, two arms (optionally posed), two legs. */
function biped(
  height: number,
  torsoHex: number, headHex: number, limbHex: number,
  torsoW: number, torsoH: number, torsoD: number,
  armRotX: number,
): { root: THREE.Group; legs: THREE.Object3D[] } {
  const root = new THREE.Group();
  const legH = (height - torsoH - 0.45) ;
  const legHh = Math.max(0.5, legH);
  const torsoY = legHh + torsoH / 2;
  root.add(box(torsoW, torsoH, torsoD, torsoHex, 0, torsoY, 0));
  root.add(box(0.45, 0.45, 0.45, headHex, 0, torsoY + torsoH / 2 + 0.23, 0)); // head
  // Arms hang from the shoulders, optionally rotated forward.
  const armL = limb(-(torsoW / 2 + 0.09), 0, 0.18, torsoH, 0.18, limbHex, torsoY + torsoH / 2);
  const armR = limb(torsoW / 2 + 0.09, 0, 0.18, torsoH, 0.18, limbHex, torsoY + torsoH / 2);
  armL.rotation.x = armRotX;
  armR.rotation.x = armRotX;
  root.add(armL, armR);
  const legs = [
    limb(-0.12, 0, 0.2, legHh, 0.2, limbHex),
    limb(0.12, 0, 0.2, legHh, 0.2, limbHex),
  ];
  legs.forEach((l) => root.add(l));
  return { root, legs };
}

function buildZombie(): Partial<MobModel> {
  const b = biped(1.9, 0x3a6b4a, 0x5a8a4a, 0x35506a, 0.5, 0.6, 0.26, -1.4);
  return { root: b.root, legs: b.legs, legSigns: [1, -1], legAmp: 0.5 };
}

function buildSkeleton(): Partial<MobModel> {
  const b = biped(1.95, 0xc9c9c0, 0xd8d8cf, 0xb8b8af, 0.34, 0.6, 0.2, -1.1);
  return { root: b.root, legs: b.legs, legSigns: [1, -1], legAmp: 0.5 };
}

function buildEnderman(): Partial<MobModel> {
  const root = new THREE.Group();
  const legH = 1.6;
  const torsoY = legH + 0.45;
  root.add(box(0.4, 0.9, 0.3, 0x14141c, 0, torsoY, 0)); // torso
  root.add(box(0.4, 0.45, 0.4, 0x14141c, 0, torsoY + 0.66, 0)); // head
  root.add(box(0.3, 0.07, 0.02, 0xc59cff, 0, torsoY + 0.7, -0.205)); // purple eyes
  const armL = limb(-0.28, 0, 0.12, 1.2, 0.12, 0x14141c, torsoY + 0.3);
  const armR = limb(0.28, 0, 0.12, 1.2, 0.12, 0x14141c, torsoY + 0.3);
  root.add(armL, armR);
  const legs = [
    limb(-0.1, 0, 0.14, legH, 0.14, 0x14141c),
    limb(0.1, 0, 0.14, legH, 0.14, 0x14141c),
  ];
  legs.forEach((l) => root.add(l));
  return { root, legs, legSigns: [1, -1], legAmp: 0.45 };
}

function buildCreeper(): Partial<MobModel> {
  const root = new THREE.Group();
  const legH = 0.34;
  const bodyY = legH + 0.55;
  root.add(box(0.5, 1.1, 0.5, 0x4fa84f, 0, bodyY, 0)); // tall body
  root.add(box(0.52, 0.52, 0.52, 0x57b057, 0, bodyY + 0.8, 0)); // head
  root.add(box(0.4, 0.28, 0.02, 0x123012, 0, bodyY + 0.82, -0.26)); // face
  const legs = [
    limb(-0.13, -0.16, 0.2, legH, 0.22, 0x4a9a4a),
    limb(0.13, -0.16, 0.2, legH, 0.22, 0x4a9a4a),
    limb(-0.13, 0.16, 0.2, legH, 0.22, 0x4a9a4a),
    limb(0.13, 0.16, 0.2, legH, 0.22, 0x4a9a4a),
  ];
  legs.forEach((l) => root.add(l));
  const primeOverlay = overlay(0.6, 1.75, 0.6, 0xffffff);
  primeOverlay.position.y = bodyY + 0.2;
  root.add(primeOverlay);
  return { root, legs, legSigns: [1, -1, -1, 1], legAmp: 0.5, primeOverlay };
}

function buildSpider(): Partial<MobModel> {
  const root = new THREE.Group();
  const bodyY = 0.5;
  root.add(box(0.6, 0.45, 0.5, 0x2b2b30, 0, bodyY, -0.3)); // cephalothorax
  root.add(box(0.8, 0.6, 0.8, 0x35353b, 0, bodyY, 0.4)); // abdomen
  root.add(box(0.1, 0.08, 0.02, 0xcc2020, -0.13, bodyY + 0.12, -0.55)); // eye L
  root.add(box(0.1, 0.08, 0.02, 0xcc2020, 0.13, bodyY + 0.12, -0.55)); // eye R
  const legs: THREE.Object3D[] = [];
  const signs: number[] = [];
  const zs = [-0.25, -0.05, 0.15, 0.35];
  for (let side = 0; side < 2; side++) {
    const sx = side === 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) {
      const leg = limb(sx * 0.32, zs[i], 0.09, 0.55, 0.09, 0x202024, bodyY + 0.05);
      leg.rotation.z = sx * 0.7; // splay outward to the ground
      root.add(leg);
      legs.push(leg);
      signs.push((i + side) % 2 === 0 ? 1 : -1);
    }
  }
  return { root, legs, legSigns: signs, legAmp: 0.18 };
}

function buildSlime(): Partial<MobModel> {
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({
    color: 0x6ac46a,
    transparent: true,
    opacity: 0.78,
  });
  const body = new THREE.Mesh(boxGeo(0.8, 0.8, 0.8), bodyMat);
  body.position.y = 0.4;
  root.add(body);
  root.add(box(0.42, 0.42, 0.42, 0x4a9a4a, 0, 0.4, 0)); // inner core
  root.add(box(0.1, 0.1, 0.02, 0x153015, -0.14, 0.45, -0.41)); // eye L
  root.add(box(0.1, 0.1, 0.02, 0x153015, 0.14, 0.45, -0.41)); // eye R
  return { root, legs: [], legSigns: [], legAmp: 0, squash: body };
}

const BUILDERS: Record<MobKind, () => Partial<MobModel>> = {
  pig: buildPig,
  cow: buildCow,
  sheep: buildSheep,
  chicken: buildChicken,
  zombie: buildZombie,
  skeleton: buildSkeleton,
  creeper: buildCreeper,
  spider: buildSpider,
  slime: buildSlime,
  enderman: buildEnderman,
};

export class MobRenderer {
  private readonly group = new THREE.Group();
  private readonly models = new Map<Mob, MobModel>();
  private readonly ambient: THREE.AmbientLight;
  private readonly sun: THREE.DirectionalLight;
  private time = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.6);
    this.sun.position.set(0.5, 1, 0.3);
    scene.add(this.ambient, this.sun);
  }

  setDaylight(d: number): void {
    this.ambient.intensity = 0.3 + 0.5 * d;
    this.sun.intensity = 0.15 + 0.6 * d;
  }

  add(mob: Mob): void {
    const partial = BUILDERS[mob.kind]();
    const hurtOverlay = overlay(mob.width * 1.15, mob.height * 1.05, mob.width * 1.15, 0xff3030);
    hurtOverlay.position.y = mob.height / 2;
    partial.root!.add(hurtOverlay);
    const model: MobModel = {
      root: partial.root!,
      legs: partial.legs ?? [],
      legSigns: partial.legSigns ?? [],
      legAmp: partial.legAmp ?? 0.5,
      wings: partial.wings ?? [],
      squash: partial.squash,
      hurtOverlay,
      primeOverlay: partial.primeOverlay,
      kind: mob.kind,
    };
    this.group.add(model.root);
    this.models.set(mob, model);
  }

  remove(mob: Mob): void {
    const model = this.models.get(mob);
    if (!model) return;
    this.group.remove(model.root);
    this.models.delete(mob);
  }

  sync(mobs: Mob[], dt: number): void {
    this.time += dt;
    for (const mob of mobs) {
      const model = this.models.get(mob);
      if (!model) continue;
      model.root.position.set(mob.position.x, mob.position.y, mob.position.z);
      model.root.rotation.y = mob.yaw;

      const swing = mob.moving ? Math.sin(mob.walkPhase) * model.legAmp : 0;
      for (let i = 0; i < model.legs.length; i++) {
        model.legs[i].rotation.x = swing * model.legSigns[i];
      }

      // Chicken wings flap while moving.
      if (model.wings.length) {
        const flap = mob.moving ? Math.abs(Math.sin(this.time * 14)) * 0.9 : 0.1;
        model.wings[0].rotation.z = flap;
        model.wings[1].rotation.z = -flap;
      }

      // Slime squashes as it bobs.
      if (model.squash) {
        const s = 1 + 0.16 * Math.sin(this.time * 7 + mob.position.x);
        model.squash.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
      }

      model.hurtOverlay.visible = mob.hurtFlash > 0;

      // Creeper swells + flashes white as the fuse charges.
      if (model.primeOverlay) {
        const p = mob.primeLevel;
        model.primeOverlay.visible = p > 0;
        if (p > 0) {
          (model.primeOverlay.material as THREE.MeshBasicMaterial).opacity =
            0.2 + 0.6 * Math.abs(Math.sin(this.time * 18));
          const s = 1 + 0.3 * p;
          model.root.scale.set(s, s, s);
        } else {
          model.root.scale.set(1, 1, 1);
        }
      }
    }
  }
}
