import * as THREE from 'three';
import { World, generateFlatChunk } from './engine/World';
import { CHUNK_SIZE } from './engine/Chunk';
import { buildChunkMesh } from './engine/ChunkMesher';
import { createAtlasTexture } from './engine/textures';
import { createChunkMaterial, createChunkMesh } from './renderer/ChunkRenderer';

/**
 * Sprint 1: render a flat 3x3-chunk world with hidden-face-culled meshing and
 * a procedural texture atlas. The camera is a static angled view above the
 * ground; real player controls arrive in Sprint 2.
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
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

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

// ----- Camera: angled view above the terrain centre -----
const center = new THREE.Vector3(
  (GRID * CHUNK_SIZE) / 2,
  66, // grass top sits at y=66
  (GRID * CHUNK_SIZE) / 2,
);
const GROUND_TOP_Y = 66;
camera.position.set(center.x + 30, 92, center.z + 52);
camera.lookAt(center);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let frames = 0;
function animate() {
  requestAnimationFrame(animate);
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
  getFrames: () => frames,
  stats: {
    chunks: world.chunks.size,
    quads: totalQuads,
    cameraAboveGround: camera.position.y > GROUND_TOP_Y,
    cameraY: camera.position.y,
    groundTopY: GROUND_TOP_Y,
  },
};

if (bootStatus) {
  bootStatus.textContent = `Sprint 1: ${world.chunks.size} chunks, ${totalQuads} quads`;
}
console.log(
  `[Minecraft Clone] Sprint 1 — ${world.chunks.size} chunks meshed, ${totalQuads} quads`,
);
