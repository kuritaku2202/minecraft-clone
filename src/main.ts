import * as THREE from 'three';
import { World, generateFlatChunk } from './engine/World';
import { CHUNK_SIZE } from './engine/Chunk';
import { createAtlasTexture } from './engine/textures';
import { createChunkMaterial } from './renderer/ChunkRenderer';
import { ChunkMeshManager } from './renderer/ChunkMeshManager';
import { Player } from './player/Player';
import { Controls } from './player/Controls';
import { Interaction } from './player/Interaction';
import { HUD } from './ui/HUD';

/**
 * Sprint 3: block breaking/placing with voxel raycasting, a crosshair + target
 * highlight, and per-chunk mesh rebuilds on edit.
 */

const canvas = document.getElementById('game') as HTMLCanvasElement;
const bootStatus = document.getElementById('boot-status');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.rotation.order = 'YXZ';

// ----- World generation (3x3 chunks of flat terrain) -----
const GRID = 3;
const world = new World();
for (let cx = 0; cx < GRID; cx++) {
  for (let cz = 0; cz < GRID; cz++) {
    generateFlatChunk(world.getOrCreateChunk(cx, cz));
  }
}

// ----- Meshing -----
const atlas = createAtlasTexture();
const chunkMaterial = createChunkMaterial(atlas);
const meshMgr = new ChunkMeshManager(chunkMaterial);
scene.add(meshMgr.group);
meshMgr.rebuildAll(world);

// ----- Player, controls, HUD, interaction -----
const spawn = new THREE.Vector3((GRID * CHUNK_SIZE) / 2, 70, (GRID * CHUNK_SIZE) / 2);
const player = new Player(spawn);
const controls = new Controls(canvas);
const hud = new HUD();
const interaction = new Interaction(
  world,
  player,
  controls,
  meshMgr,
  hud,
  scene,
  canvas,
);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
const eye = new THREE.Vector3();
let frames = 0;

function animate() {
  requestAnimationFrame(animate);
  let dt = clock.getDelta();
  if (dt > 0.05) dt = 0.05;

  player.update(world, controls.getInput(), dt);

  player.eyePosition(eye);
  camera.position.copy(eye);
  camera.rotation.x = controls.pitch;
  camera.rotation.y = controls.yaw;

  interaction.update(dt);

  renderer.render(scene, camera);
  frames++;
}
animate();

// Debug handle for Playwright / console inspection.
(window as Window & { __GAME__?: unknown }).__GAME__ = {
  scene,
  camera,
  renderer,
  world,
  player,
  controls,
  interaction,
  meshMgr,
  getFrames: () => frames,
  debug: {
    pos: () => player.position.toArray(),
    vel: () => player.velocity.toArray(),
    onGround: () => player.onGround,
    yaw: () => controls.yaw,
    pitch: () => controls.pitch,
    locked: () => controls.locked,
    target: () => interaction.target,
    held: () => interaction.heldBlock,
    block: (x: number, y: number, z: number) => world.getBlock(x, y, z),
    meshCount: () => meshMgr.meshCount,
  },
};

if (bootStatus) {
  bootStatus.textContent =
    'Sprint 3 — L-click break · R-click place · 1/2/3 select block';
}
console.log('[Minecraft Clone] Sprint 3 — block interaction online');
