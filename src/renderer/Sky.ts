import * as THREE from 'three';

/**
 * Sky dome (vertical gradient), sun/moon, and a day/night cycle. Exposes a
 * daylight factor (terrain brightness) and a fog/horizon colour so the chunk
 * material can darken at night and fade distant terrain into the sky.
 */

const DAY_SECONDS = 1200; // 20 minutes per full day

// Palette (linear, authored values — colour management is off).
const DAY_ZENITH = new THREE.Color(0x4a8fe6);
const DAY_HORIZON = new THREE.Color(0x9fc4ec);
const NIGHT_ZENITH = new THREE.Color(0x05060f);
const NIGHT_HORIZON = new THREE.Color(0x0b1024);
const SUNSET_HORIZON = new THREE.Color(0xe27a32);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class Sky {
  /** Normalised time of day in [0,1): 0=midnight, 0.25=sunrise, 0.5=noon. */
  time = 0.32;
  daylight = 1;
  readonly fogColor = new THREE.Color();
  readonly horizonColor = new THREE.Color();

  private readonly dome: THREE.Mesh;
  private readonly sun: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly sunDir = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uHorizon: { value: new THREE.Color() },
        uZenith: { value: new THREE.Color() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        varying vec3 vDir;
        void main() {
          float t = clamp(normalize(vDir).y, 0.0, 1.0);
          gl_FragColor = vec4(mix(uHorizon, uZenith, pow(t, 0.5)), 1.0);
        }
      `,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), this.material);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1;
    scene.add(this.dome);

    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(16, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false }),
    );
    this.sun.frustumCulled = false;
    scene.add(this.sun);

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(11, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xdfe6f2, fog: false }),
    );
    this.moon.frustumCulled = false;
    scene.add(this.moon);

    this.recompute();
  }

  setTime(t: number): void {
    this.time = ((t % 1) + 1) % 1;
    this.recompute();
  }

  update(dt: number, cameraPos: THREE.Vector3): void {
    this.time = (this.time + dt / DAY_SECONDS) % 1;
    this.recompute();

    this.dome.position.copy(cameraPos);
    this.sun.position.copy(cameraPos).addScaledVector(this.sunDir, 400);
    this.moon.position.copy(cameraPos).addScaledVector(this.sunDir, -400);
    this.sun.visible = this.sunDir.y > -0.15;
    this.moon.visible = this.sunDir.y < 0.15;
  }

  private recompute(): void {
    const ang = (this.time - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(ang), Math.sin(ang), 0.2).normalize();
    const sunY = this.sunDir.y;

    const day = smoothstep(-0.12, 0.25, sunY);
    const sunset = Math.max(0, 1 - Math.abs(sunY) * 3.5); // peaks at the horizon

    const horizon = NIGHT_HORIZON.clone().lerp(DAY_HORIZON, day);
    horizon.lerp(SUNSET_HORIZON, sunset * 0.6);
    const zenith = NIGHT_ZENITH.clone().lerp(DAY_ZENITH, day);

    this.material.uniforms.uHorizon.value.copy(horizon);
    this.material.uniforms.uZenith.value.copy(zenith);
    this.horizonColor.copy(horizon);
    this.fogColor.copy(horizon);
    this.daylight = 0.18 + 0.82 * day; // night floor so it is dark, not black
  }
}
