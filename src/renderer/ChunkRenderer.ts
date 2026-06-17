import * as THREE from 'three';
import type { MeshData } from '../engine/ChunkMesher';

/**
 * Turns raw mesh buffers from the mesher into a Three.js Mesh. A single shared
 * material (texture atlas + baked vertex-colour shading) is used for all chunks
 * so they can later be frustum-culled and drawn cheaply.
 */
export function createChunkMaterial(atlas: THREE.Texture): THREE.Material {
  return new THREE.MeshBasicMaterial({
    map: atlas,
    vertexColors: true,
    side: THREE.FrontSide,
  });
}

export function createChunkMesh(
  data: MeshData,
  material: THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = true;
  return mesh;
}
