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
import { InventoryScreen } from './ui/InventoryScreen';
import { GameStateAPI } from './debug/GameStateAPI';
import { TerrainGenerator, SEA_LEVEL } from './terrain/TerrainGenerator';
import { Sky } from './renderer/Sky';
import { BlockId } from './engine/BlockRegistry';
import { MobManager } from './entities/MobManager';
import { Inventory } from './items/Inventory';
import { ItemId, blockItem, toolOf, itemName } from './items/items';
import { RECIPES } from './items/recipes';

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

// ----- Inventory + crafting (Sprint 13) -----
const inventory = new Inventory();
// Starter kit so the crafting tree (planks → table → tools → bed → armor) is
// immediately reachable; the rest is gathered by mining and hunting.
inventory.add(blockItem(BlockId.OakLog), 16);
inventory.add(blockItem(BlockId.Cobblestone), 16);
inventory.add(ItemId.Leather, 8);
inventory.add(blockItem(BlockId.Wool), 6);
inventory.add(ItemId.Coal, 4);

const hotbar = new Hotbar(inventory);
const inventoryScreen = new InventoryScreen(inventory);

const interaction = new Interaction(
  world,
  player,
  controls,
  (x, y, z, id) => chunkManager.editBlock(x, y, z, id),
  hud,
  scene,
  canvas,
  inventory,
  () => openScreen(true),
);

// Open/close the inventory or crafting-table screen; manage pointer lock + the
// interaction freeze together.
function openScreen(table: boolean): void {
  if (inventoryScreen.isOpen) return;
  if (table) inventoryScreen.open3x3();
  else inventoryScreen.open2x2();
  interaction.blocked = true;
  if (document.pointerLockElement) document.exitPointerLock();
}
inventoryScreen.setOnClose(() => {
  interaction.blocked = false;
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') {
    e.preventDefault();
    if (inventoryScreen.isOpen) inventoryScreen.close();
    else openScreen(false);
  } else if (e.code === 'Escape') {
    inventoryScreen.close();
  } else if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5));
    if (n >= 1 && n <= 9) hotbar.select(n - 1);
  }
});
window.addEventListener(
  'wheel',
  (e) => {
    if (inventoryScreen.isOpen) return;
    hotbar.scroll(e.deltaY);
  },
  { passive: true },
);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----- Mobs (Sprint 11/12): animals + monsters with AI and combat -----
const ATTACK_REACH = 5;
const mobManager = new MobManager(
  world,
  scene,
  (x, y, z, id) => chunkManager.editBlock(x, y, z, id),
  (item, count) => inventory.add(item, count), // mob drops → inventory
);
// Attack damage comes from the selected tool (sword > axe > hand).
interaction.setAttackMob((ox, oy, oz, dx, dy, dz) => {
  const dmg = toolOf(inventory.selectedStack()?.item ?? -1)?.attack ?? 1;
  return mobManager.attackAlongRay(ox, oy, oz, dx, dy, dz, ATTACK_REACH, dmg);
});

const clock = new THREE.Clock();
const eye = new THREE.Vector3();
let frames = 0;
let deathTimer = 0;

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
  mobManager.update(dt, player.position, sky.daylight, (amount) =>
    player.hurt(amount),
  );

  // Armor (from equipped gear) + health HUD + death/respawn.
  player.armorPoints = inventory.totalDefense();
  hud.setArmor(player.armorPoints);
  if (player.justHurt) {
    hud.flashDamage();
    player.justHurt = false;
  }
  hud.setHealth(player.health);
  if (player.dead) {
    hud.setDead(true);
    deathTimer += dt;
    if (deathTimer > 1.5) {
      player.respawn();
      hud.setDead(false);
      deathTimer = 0;
    }
  } else {
    deathTimer = 0;
  }

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
  inventoryScreen,
  mobManager,
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
    held: () => inventory.selectedStack(),
    hotbarSelected: () => inventory.selected,
    selectSlot: (i: number) => hotbar.select(i),
    scrollHotbar: (d: number) => hotbar.scroll(d),
    inventoryOpen: () => inventoryScreen.isOpen,
    openInventory: () => openScreen(false),
    openTable: () => openScreen(true),
    closeInventory: () => inventoryScreen.close(),
    invState: () => inventoryScreen.debugState(),
    give: (item: number, count: number) => inventory.add(item, count),
    count: (item: number) => inventory.countOf(item),
    craft: (recipeId: string) => {
      const r = RECIPES.find((x) => x.id === recipeId);
      return r ? inventoryScreen.craftFromInventory(r) : false;
    },
    slots: () => inventory.slots.map((s) => (s ? { item: s.item, count: s.count, name: itemName(s.item) } : null)),
    defense: () => inventory.totalDefense(),
    armorPoints: () => player.armorPoints,
    mobCount: () => mobManager.count,
    mobKinds: () => mobManager.countByKind(),
    mobs: () =>
      mobManager.mobs.map((m) => ({
        kind: m.kind,
        pos: m.position.toArray(),
        yaw: m.yaw,
        moving: m.moving,
        onGround: m.onGround,
        health: m.health,
        chasing: m.chasing,
      })),
    spawnMob: (kind: string, x: number, y: number, z: number) =>
      mobManager.spawnAt(x, y, z, kind as never),
    spawnKindNear: (kind: string) =>
      !!mobManager.spawnKindNear(kind as never, player.position.x, player.position.z),
    health: () => player.health,
    dead: () => player.dead,
    hurtPlayer: (n: number) => player.hurt(n),
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
  bootStatus.textContent = `Sprint 13 — crafting · gather + craft tools/weapons/bed/armor · [E] inventory (seed ${seed})`;
}
console.log(
  `[Minecraft Clone] Sprint 13 — crafting system (items, inventory, recipes, tools, armor) online (seed ${seed})`,
);
