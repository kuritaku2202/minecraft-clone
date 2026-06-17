import * as THREE from 'three';
import { World } from './engine/World';
import { CHUNK_SIZE } from './engine/Chunk';
import { ChunkManager } from './engine/ChunkManager';
import { buildTileArrayTexture } from './engine/textures';
import { createChunkMaterial } from './renderer/ChunkRenderer';
import { ChunkMeshManager } from './renderer/ChunkMeshManager';
import { Player } from './player/Player';
import { Controls } from './player/Controls';
import { Interaction } from './player/Interaction';
import { HUD } from './ui/HUD';
import { GameStateAPI } from './debug/GameStateAPI';

/**
 * Sprint 5: an effectively infinite flat world that streams chunks in/out
 * around the player, plus a GameStateAPI monitoring surface.
 */

// Stylised colours: emit authored values directly, no sRGB/linear conversion.
THREE.ColorManagement.enabled = false;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const bootStatus = document.getElementById('boot-status');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.rotation.order = 'YXZ';

// ----- World + streaming -----
const world = new World();
const atlas = buildTileArrayTexture();
const chunkMaterial = createChunkMaterial(atlas);
const meshMgr = new ChunkMeshManager(chunkMaterial);
scene.add(meshMgr.group);
const chunkManager = new ChunkManager(world, meshMgr);

// ----- Player, controls, HUD, monitoring -----
const spawn = new THREE.Vector3(8, 80, 8);
const player = new Player(spawn);
const controls = new Controls(canvas);
const hud = new HUD();
const gameState = new GameStateAPI();

// Preload a small area so the player lands on ground immediately.
chunkManager.preload(spawn.x, spawn.z, 2);
chunkManager.onBlockEdit((x, y, z, id) => gameState.recordBlockEdit(x, y, z, id));

const interaction = new Interaction(
  world,
  player,
  controls,
  (x, y, z, id) => chunkManager.editBlock(x, y, z, id),
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

// Rolling FPS estimate over ~0.5s windows.
let fps = 0;
let fpsFrames = 0;
let fpsAccum = 0;

// Throttle state publishing to a few times per second.
let publishAccum = 0;

function animate() {
  requestAnimationFrame(animate);
  let dt = clock.getDelta();
  if (dt > 0.05) dt = 0.05;

  player.update(world, controls.getInput(), dt);
  chunkManager.update(player.position.x, player.position.z);

  player.eyePosition(eye);
  camera.position.copy(eye);
  camera.rotation.x = controls.pitch;
  camera.rotation.y = controls.yaw;

  interaction.update(dt);

  renderer.render(scene, camera);
  frames++;

  fpsFrames++;
  fpsAccum += dt;
  if (fpsAccum >= 0.5) {
    fps = fpsFrames / fpsAccum;
    fpsFrames = 0;
    fpsAccum = 0;
  }

  publishAccum += dt;
  if (publishAccum >= 0.2) {
    publishAccum = 0;
    gameState.publish({
      fps,
      position: [player.position.x, player.position.y, player.position.z],
      chunk: [
        Math.floor(player.position.x / CHUNK_SIZE),
        Math.floor(player.position.z / CHUNK_SIZE),
      ],
      chunksLoaded: world.chunks.size,
      chunksMeshed: meshMgr.meshCount,
      blockEdits: gameState.blockEdits,
    });
  }
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
  chunkManager,
  gameState,
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
    chunksLoaded: () => world.chunks.size,
    fps: () => fps,
    state: () => gameState.getState(),
    recentEdits: () => gameState.recentEdits(),
  },
};

if (bootStatus) {
  bootStatus.textContent =
    'Sprint 5 — streaming world · WASD move · L-break · R-place';
}
console.log('[Minecraft Clone] Sprint 5 — chunk streaming + GameStateAPI online');
