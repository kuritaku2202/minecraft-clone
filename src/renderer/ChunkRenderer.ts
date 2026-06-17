import * as THREE from 'three';
import type { MeshData } from '../engine/ChunkMesher';
import { CHUNK_SIZE } from '../engine/Chunk';

/**
 * Custom voxel material: each vertex is a single packed uint32 (see
 * ChunkMesher). The vertex shader unpacks the chunk-local position, derives the
 * tiling UV and per-face shade from the face id, samples a DataArrayTexture by
 * the per-vertex layer index, and multiplies by a shade combining directional
 * shading and 4-level ambient occlusion.
 *
 * Colour management is disabled globally (see main.ts), so the shader emits the
 * authored colours directly.
 */

const AO_LEVELS = '0.5, 0.7, 0.85, 1.0';
// Per-face directional shade indexed by faceId = d*2 + (positive?0:1):
// X+ X- (east/west) Y+ Y- (top/bottom) Z+ Z- (north/south).
const FACE_SHADE = '0.6, 0.6, 1.0, 0.5, 0.8, 0.8';

// Shared vertex shader: unpacks the packed attribute and derives UV + shade.
const vertexShader = /* glsl */ `
precision highp float;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
in uint aData;
out vec2 vUv;
out float vLayer;
out float vShade;
out float vViewDist;
const float aoLevels[4] = float[4](${AO_LEVELS});
const float faceShade[6] = float[6](${FACE_SHADE});
void main() {
  float x = float(aData & 31u);
  float y = float((aData >> 5u) & 511u);
  float z = float((aData >> 14u) & 31u);
  uint faceId = (aData >> 19u) & 7u;
  uint ao = (aData >> 22u) & 3u;
  vLayer = float((aData >> 24u) & 255u);

  vec3 pos = vec3(x, y, z);

  // Derive the tiling UV from local position: with REPEAT wrapping the absolute
  // local coordinate tiles once per block, and keeping world-Y on the T axis
  // makes side tiles stay upright. Top/bottom use (x,z).
  uint axis = faceId >> 1u; // 0 = X faces, 1 = Y faces, 2 = Z faces
  if (axis == 1u) vUv = vec2(x, z);
  else if (axis == 0u) vUv = vec2(z, y);
  else vUv = vec2(x, y);

  vShade = faceShade[faceId] * aoLevels[ao];

  vec4 viewPos = modelViewMatrix * vec4(pos, 1.0);
  vViewDist = -viewPos.z; // positive distance from camera
  gl_Position = projectionMatrix * viewPos;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uAtlas;
uniform float uDayLight;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
in vec2 vUv;
in float vLayer;
in float vShade;
in float vViewDist;
out vec4 outColor;
void main() {
  vec4 texel = texture(uAtlas, vec3(vUv, vLayer));
  vec3 col = texel.rgb * vShade * uDayLight;
  float fog = clamp((vViewDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, fog);
  outColor = vec4(col, 1.0);
}
`;

// Water: a tinted, semi-transparent variant of the same shading. Depth writes
// are off so terrain behind the surface shows through; fog still applies.
const waterFragmentShader = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uAtlas;
uniform float uDayLight;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uWaterAlpha;
in vec2 vUv;
in float vLayer;
in float vShade;
in float vViewDist;
out vec4 outColor;
void main() {
  vec4 texel = texture(uAtlas, vec3(vUv, vLayer));
  vec3 col = texel.rgb * vShade * uDayLight;
  float fog = clamp((vViewDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, fog);
  outColor = vec4(col, uWaterAlpha);
}
`;

function sharedUniforms(atlas: THREE.DataArrayTexture): Record<string, THREE.IUniform> {
  return {
    uAtlas: { value: atlas },
    uDayLight: { value: 1 },
    uFogColor: { value: new THREE.Color(0x9fc4ec) },
    uFogNear: { value: 70 },
    uFogFar: { value: 118 },
  };
}

export function createChunkMaterial(
  atlas: THREE.DataArrayTexture,
): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: sharedUniforms(atlas),
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
  });
}

export function createWaterMaterial(
  atlas: THREE.DataArrayTexture,
): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...sharedUniforms(atlas), uWaterAlpha: { value: 0.72 } },
    vertexShader,
    fragmentShader: waterFragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
}

export function createChunkMesh(
  data: MeshData,
  material: THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  const attr = new THREE.Uint32BufferAttribute(data.data, 1);
  attr.gpuType = THREE.IntType;
  geometry.setAttribute('aData', attr);
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));

  // No position attribute, so set the bounding sphere manually (covers the
  // 16x16 footprint and the emitted Y span) for frustum culling.
  const midY = (data.yMin + data.yMax) / 2;
  const half = CHUNK_SIZE / 2;
  const radius = Math.hypot(half, (data.yMax - data.yMin) / 2, half);
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(half, midY, half),
    radius,
  );

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = true;
  return mesh;
}
