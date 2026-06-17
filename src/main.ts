import * as THREE from 'three';
import { World, generateFlatChunk } from './engine/World';
import { CHUNK_SIZE } from './engine/Chunk';
import { buildChunkMesh } from './engine/ChunkMesher';
import { createAtlasTexture } from './engine/textures';
import { createChunkMaterial, createChunkMesh } from './renderer/ChunkRenderer';
import { Player } from './player/Player';
import { Controls } from './player/Controls';

/**
 * Sprint 2: first-person player with AABB physics on the flat world. Click to
 * lock the pointer, WASD to move, Space to jump, Shift to sneak.
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
let totalQuads = 0;
for (const chunk of world.chunks.values()) {
  const data = buildChunkMesh(chunk, world);
  totalQuads += data.quadCount;
  scene.add(createChunkMesh(data, chunkMaterial));
}

// ----- Player + controls -----
// Spawn slightly above the grass (top at y=66) so the player falls and lands,
// demonstrating gravity + landing on the first frames.
const spawn = new THREE.Vector3((GRID * CHUNK_SIZE) / 2, 70, (GRID * CHUNK_SIZE) / 2);
const player = new Player(spawn);
const controls = new Controls(canvas);

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
  if (dt > 0.05) dt = 0.05; // clamp to avoid tunnelling after stalls

  player.update(world, controls.getInput(), dt);

  player.eyePosition(eye);
  camera.position.copy(eye);
  camera.rotation.x = controls.pitch;
  camera.rotation.y = controls.yaw;

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
  getFrames: () => frames,
  stats: { chunks: world.chunks.size, quads: totalQuads },
  debug: {
    pos: () => player.position.toArray(),
    vel: () => player.velocity.toArray(),
    onGround: () => player.onGround,
    yaw: () => controls.yaw,
    pitch: () => controls.pitch,
    locked: () => controls.locked,
  },
};

if (bootStatus) {
  bootStatus.textContent = 'Sprint 2 — click to play · WASD move · Space jump';
}
console.log('[Minecraft Clone] Sprint 2 — player physics online');
