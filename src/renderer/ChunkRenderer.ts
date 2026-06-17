import * as THREE from 'three';
import type { MeshData } from '../engine/ChunkMesher';

/**
 * Custom voxel material: samples a DataArrayTexture by per-vertex layer index,
 * tiles it with REPEAT-wrapped UVs, and multiplies by a baked shade combining
 * per-face directional shading and 4-level ambient occlusion.
 *
 * Colour management is disabled globally (see main.ts), so the shader emits the
 * authored colours directly.
 */

const AO_LEVELS = '0.5, 0.7, 0.85, 1.0';

const vertexShader = /* glsl */ `
precision highp float;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
in vec3 position;
in vec2 uv;
in float aLayer;
in float aAO;
in float aShade;
out vec2 vUv;
out float vLayer;
out float vShade;
out float vViewDist;
const float aoLevels[4] = float[4](${AO_LEVELS});
void main() {
  vUv = uv;
  vLayer = aLayer;
  vShade = aShade * aoLevels[int(aAO + 0.5)];
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
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

export function createChunkMaterial(
  atlas: THREE.DataArrayTexture,
): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uAtlas: { value: atlas },
      uDayLight: { value: 1 },
      uFogColor: { value: new THREE.Color(0x9fc4ec) },
      uFogNear: { value: 70 },
      uFogFar: { value: 118 },
    },
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
  });
}

export function createChunkMesh(
  data: MeshData,
  material: THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geometry.setAttribute('aLayer', new THREE.BufferAttribute(data.layers, 1));
  geometry.setAttribute('aAO', new THREE.BufferAttribute(data.aos, 1));
  geometry.setAttribute('aShade', new THREE.BufferAttribute(data.shades, 1));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = true;
  return mesh;
}
