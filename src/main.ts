import * as THREE from 'three';
import { World } from './engine/World';
import { CHUNK_SIZE } from './engine/Chunk';
import { ChunkManager } from './engine/ChunkManager';
import { buildTileArrayTexture } from './engine/textures';
import { createChunkMaterial, createWaterMaterial } from './renderer/ChunkRenderer';
import { ChunkMeshManager } from './renderer/ChunkMeshManager';
import { Player } from './player/Player';
import { Controls } from './player/Controls';
import { Interaction } from './player/Interaction';
import { HUD } from './ui/HUD';
import { Hotbar } from './ui/Hotbar';
import { Inventory } from './ui/Inventory';
import { GameStateAPI } from './debug/GameStateAPI';
import { TerrainGenerator, SEA_LEVEL } from './terrain/TerrainGenerator';
import { Sky } from './renderer/Sky';
import { BlockId } from './engine/BlockRegistry';

/**
 * Sprint 6: seeded multi-noise terrain (hills, plains, oceans, caves) streamed
 * around the player, with the GameStateAPI monitoring surface.
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

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.rotation.order = 'YXZ';

// ----- World + terrain + streaming -----
const params = new URLSearchParams(location.search);
const seed = params.has('seed')
  ? Number(params.get('seed'))
  : (Math.random() * 0xffffffff) >>> 0;
const terrain = new TerrainGenerator(seed);

const world = new World();
const atlas = buildTileArrayTexture();
const chunkMaterial = createChunkMaterial(atlas);
const waterMaterial = createWaterMaterial(atlas);
const meshMgr = new ChunkMeshManager(chunkMaterial, waterMaterial);
scene.add(meshMgr.group);
const chunkManager = new ChunkManager(world, meshMgr, (chunk) =>
  terrain.generate(chunk),
);

// Sky dome + day/night cycle. Matches fog distance to the render radius so the
// streaming boundary fades into the horizon instead of popping in.
const sky = new Sky(scene);
const terrainMaterials = [chunkMaterial, waterMaterial];
for (const m of terrainMaterials) {
  m.uniforms.uFogFar.value = 118;
  m.uniforms.uFogNear.value = 72;
}

// Find a dry-land spawn near the origin (spiral out until above sea level).
function findSpawn(): THREE.Vector3 {
  for (let r = 0; r < 64; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = dx * 8;
        const z = dz * 8;
        const h = terrain.heightAt(x, z);
        if (h >= SEA_LEVEL + 1) {
          return new THREE.Vector3(x + 0.5, h + 2, z + 0.5);
        }
      }
    }
  }
  return new THREE.Vector3(0.5, SEA_LEVEL + 4, 0.5);
}

// ----- Player, controls, HUD, monitoring -----
const spawn = findSpawn();
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

// ----- Hotbar + creative inventory (Sprint 9) -----
// Every placeable/known block; the inventory lists them, the hotbar holds 9.
const AVAILABLE_BLOCKS = [
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Stone,
  BlockId.Sand,
  BlockId.Water,
];
const hotbar = new Hotbar([
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Stone,
  BlockId.Sand,
  BlockId.Water,
]);
const inventory = new Inventory(AVAILABLE_BLOCKS);

// The hotbar's selected slot is the single source of truth for the held block.
hotbar.setOnChange((block) => interaction.setHeld(block));
interaction.setHeld(hotbar.selectedBlock());

// Picking a block in the inventory drops it into the selected hotbar slot.
inventory.setOnPick((block) => hotbar.setSlot(hotbar.selected, block));

function openInventory(): void {
  if (inventory.isOpen) return;
  inventory.open();
  interaction.blocked = true;
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeInventory(): void {
  if (!inventory.isOpen) return;
  inventory.close();
}
// Re-enable interaction whenever the inventory closes (button, backdrop, or E).
inventory.setOnClose(() => {
  interaction.blocked = false;
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') {
    e.preventDefault();
    inventory.isOpen ? closeInventory() : openInventory();
  } else if (e.code === 'Escape') {
    closeInventory();
  } else if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5));
    if (n >= 1 && n <= 9) hotbar.select(n - 1);
  }
});
window.addEventListener(
  'wheel',
  (e) => {
    if (inventory.isOpen) return;
    hotbar.scroll(e.deltaY);
  },
  { passive: true },
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

  // Day/night cycle drives terrain brightness + fog colour (opaque + water).
  sky.update(dt, camera.position);
  for (const m of terrainMaterials) {
    m.uniforms.uDayLight.value = sky.daylight;
    m.uniforms.uFogColor.value.copy(sky.fogColor);
  }

  interaction.update(dt);
  hotbar.update(dt);

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
  terrain,
  seed,
  sky,
  hotbar,
  inventory,
  getFrames: () => frames,
  debug: {
    pos: () => player.position.toArray(),
    seed: () => seed,
    heightAt: (x: number, z: number) => terrain.heightAt(x, z),
    setTime: (t: number) => sky.setTime(t),
    time: () => sky.time,
    daylight: () => sky.daylight,
    fogColor: () => `#${sky.fogColor.getHexString()}`,
    fogFar: () => chunkMaterial.uniforms.uFogFar.value,
    vel: () => player.velocity.toArray(),
    onGround: () => player.onGround,
    yaw: () => controls.yaw,
    pitch: () => controls.pitch,
    locked: () => controls.locked,
    target: () => interaction.target,
    held: () => interaction.heldBlock,
    hotbarSelected: () => hotbar.selected,
    hotbarSlots: () => hotbar.slots.slice(),
    selectSlot: (i: number) => hotbar.select(i),
    scrollHotbar: (d: number) => hotbar.scroll(d),
    inventoryOpen: () => inventory.isOpen,
    openInventory: () => openInventory(),
    closeInventory: () => closeInventory(),
    pickBlock: (b: number) => hotbar.setSlot(hotbar.selected, b as BlockId),
    block: (x: number, y: number, z: number) => world.getBlock(x, y, z),
    meshCount: () => meshMgr.meshCount,
    totalQuads: () => meshMgr.totalQuads,
    waterQuads: () => meshMgr.waterQuads,
    chunksLoaded: () => world.chunks.size,
    fps: () => fps,
    state: () => gameState.getState(),
    recentEdits: () => gameState.recentEdits(),
  },
};

if (bootStatus) {
  bootStatus.textContent = `Sprint 9 — hotbar + inventory  ·  [1–9]/wheel select  ·  [E] inventory (seed ${seed})`;
}
console.log(
  `[Minecraft Clone] Sprint 9 — hotbar + creative inventory online (seed ${seed})`,
);
