// The planet: one of ten GLB worlds, floating above the palm.
//
// Hierarchy:  anchor (springs to the palm)
//               └ scaler (radius × appear/vanish scale)
//                   └ tilt (palm-driven axis tilt)
//                       ├ spin → the planet model
//                       ├ atmosphere rim
//                       └ orbit particles
//             + shadow & light spill on the palm (world space)
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";

import { FOLLOW, PARTICLES, PLACEMENT, SPIN, TILT, TIMING } from "./config";
import { hand, reachAlong } from "./hand";

// Served from public/models/ (CC BY 4.0, credit alongside). Not under src/: the
// zone manifest must classify every tracked src/ file and only accepts code
// extensions. Preloaded at import time, before the scene mounts.
const planetsUrl = "/models/toy_cartoon_planets.glb";
useGLTF.preload(planetsUrl);

const PLANET_COUNT = 10;

type PlanetModel = {
  root: Object3D;
  materials: (Material & { opacity: number })[];
  /** Body radius in planet units (ringed planets are shrunk to fit their rings). */
  fit: number;
  tint: Color;
};

export type Phase = "hidden" | "appearing" | "shown" | "vanishing" | "fading";

export const planetState = {
  phase: "hidden" as Phase,
  index: -1,
  /** Planets shown so far (for hints). */
  appearances: 0,
};

if (process.env.NODE_ENV !== "production") {
  (window as unknown as { __planet: typeof planetState }).__planet = planetState;
}

// ─── Model extraction ────────────────────────────────────────────────────────

/** Average base-colour of a mesh, sampled from its texture at its own UVs. */
const sampleTint = (mesh: Mesh): Color => {
  const tint = new Color(0.6, 0.8, 1);
  const { map } = mesh.material as MeshStandardMaterial;
  const uv = mesh.geometry.getAttribute("uv");
  const image = map?.image as CanvasImageSource & { width: number; height: number };
  if (!image || !uv) return tint;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return tint;
    ctx.drawImage(image, 0, 0, 64, 64);
    const { data } = ctx.getImageData(0, 0, 64, 64);
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    const step = Math.max(1, Math.floor(uv.count / 300));
    for (let i = 0; i < uv.count; i += step) {
      const x = Math.min(63, Math.max(0, Math.floor(uv.getX(i) * 64)));
      const y = Math.min(63, Math.max(0, Math.floor(uv.getY(i) * 64)));
      const o = (y * 64 + x) * 4;
      r += data[o];
      g += data[o + 1];
      b += data[o + 2];
      count += 1;
    }
    tint.setRGB(r / count / 255, g / count / 255, b / count / 255);
    // Atmospheres read as light: keep the hue, lift saturation and value.
    const hsl = { h: 0, s: 0, l: 0 };
    tint.getHSL(hsl);
    tint.setHSL(hsl.h, Math.min(1, hsl.s * 1.3 + 0.15), Math.max(0.62, hsl.l));
  } catch {
    // Tainted canvas or decode issue: keep the default tint.
  }
  return tint;
};

const usePlanets = (): PlanetModel[] => {
  const gltf = useGLTF(planetsUrl);
  return useMemo(() => {
    const models: PlanetModel[] = [];
    for (let i = 1; i <= PLANET_COUNT; i += 1) {
      const source = gltf.scene.getObjectByName(`Toy_Planet_${i}`);
      if (source) {
        const clone = source.clone(true);
        // Each planet sits at a grid offset in the file; bring it to the origin.
        clone.position.set(0, 0, 0);
        clone.updateMatrixWorld(true);

        // Size by the planet body (not its rings), so ringed planets aren't tiny.
        const body = clone.children.find((c) => (c as Mesh).isMesh) as Mesh | undefined;
        const geometry = body?.geometry;
        geometry?.computeBoundingSphere();
        const sphere = geometry?.boundingSphere;
        const radius = sphere?.radius ?? 100;
        const center = sphere?.center ?? new Vector3();
        // Ringed planets are ~1.9× wider than their body: shrink them to fit.
        const ringed = clone.getObjectByName(`Toy_Planet_${i}_Rings`) !== undefined;
        const fit = ringed ? PLACEMENT.ringedScale : 1;
        clone.position.copy(center).multiplyScalar(-fit / radius);
        clone.scale.setScalar(fit / radius);

        const materials: PlanetModel["materials"] = [];
        clone.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          const mat = (m.material as MeshStandardMaterial).clone();
          mat.transparent = true;
          // The texture's emissive mask is meant as an accent, not flat lighting.
          if ("emissiveIntensity" in mat) mat.emissiveIntensity = 0.35;
          m.material = mat;
          materials.push(mat);
        });

        const root = new Group();
        root.add(clone);
        models.push({ root, materials, fit, tint: body ? sampleTint(body) : new Color(0.6, 0.8, 1) });
      }
    }
    return models;
  }, [gltf]);
};

// ─── Shaders ─────────────────────────────────────────────────────────────────

const atmosphereVert = /* glsl */ `
varying vec3 vN;
varying vec3 vView;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const atmosphereFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uGlow;
varying vec3 vN;
varying vec3 vView;
void main() {
  float f = 1.0 - max(dot(normalize(vN), normalize(vView)), 0.0);
  // Thin rim: almost nothing face-on, a soft band right at the limb.
  float rim = pow(f, 5.0);
  float a = (rim * 0.55 + pow(f, 12.0) * 0.35) * uGlow * uOpacity;
  gl_FragColor = vec4(uColor * (1.0 + rim), a);
}
`;

const particleVert = /* glsl */ `
attribute float aAngle;
attribute float aRadius;
attribute float aHeight;
attribute float aSpeed;
attribute float aSize;
uniform float uTime;
uniform float uSpread;
uniform float uPointScale;
varying float vTwinkle;
void main() {
  float a = aAngle + uTime * aSpeed;
  float r = aRadius * uSpread;
  vec3 p = vec3(cos(a) * r, aHeight * uSpread, sin(a) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vTwinkle = 0.65 + 0.35 * sin(uTime * 3.0 + aAngle * 7.0);
  gl_PointSize = aSize * uPointScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const particleFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vTwinkle;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.5) * (0.8 + a), a * a * vTwinkle * uOpacity);
}
`;

const palmVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const shadowFrag = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, r);
  gl_FragColor = vec4(0.08, 0.05, 0.04, a * a * 0.18 * uOpacity);
}
`;

const spillFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.15, r);
  gl_FragColor = vec4(uColor, a * a * 0.22 * uOpacity);
}
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};
const easeInBack = (x: number) => {
  const c1 = 1.70158;
  return (c1 + 1) * x ** 3 - c1 * x ** 2;
};
const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const target = new Vector3();
const dir = new Vector3();
const axis = new Vector3();
const acc = new Vector3();
const qTarget = new Quaternion();

const pickPlanet = (previous: number) => {
  let next = Math.floor(Math.random() * PLANET_COUNT);
  if (next === previous) next = (next + 1 + Math.floor(Math.random() * (PLANET_COUNT - 1))) % PLANET_COUNT;
  return next;
};

/** Soft key from the upper left, warm bounce from the palm, cool rim from behind. */
const PlanetLights = () => (
  <>
    <directionalLight position={[-3, 4, 4]} intensity={1.4} color="#fff4e6" />
    <directionalLight position={[0, -3, 2]} intensity={0.35} color="#ffc9a3" />
    <directionalLight position={[2, 1, -4]} intensity={0.9} color="#9fd4ff" />
  </>
);

// ─── Component ───────────────────────────────────────────────────────────────

export const Planet = () => {
  const planets = usePlanets();
  const { size } = useThree();

  const anchor = useRef<Group>(null);
  const scaler = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const spill = useRef<Mesh>(null);
  const atmosphereMesh = useRef<Mesh>(null);

  const sim = useRef({
    t: 0,
    pos: new Vector3(),
    vel: new Vector3(),
    radius: 0.3,
    clearance: 0.3,
    opacity: 0,
    spin: 0,
    impulse: 0,
    tiltQ: new Quaternion(),
    shown: null as PlanetModel | null,
    /** Frames left to draw the hidden rig so shaders compile at load. */
    warm: 3,
  });

  const atmosphere = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uOpacity: { value: 0 }, uGlow: { value: 1 } },
        vertexShader: atmosphereVert,
        fragmentShader: atmosphereFrag,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );

  const particles = useMemo(() => {
    const g = new BufferGeometry();
    const n = PARTICLES.count;
    const angle = new Float32Array(n);
    const radius = new Float32Array(n);
    const height = new Float32Array(n);
    const speed = new Float32Array(n);
    const sz = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      angle[i] = Math.random() * Math.PI * 2;
      radius[i] = PARTICLES.inner + Math.random() * (PARTICLES.outer - PARTICLES.inner);
      height[i] = (Math.random() - 0.5) * 0.18;
      // Outer particles orbit slower, like a little system.
      speed[i] = PARTICLES.speed * (0.6 + Math.random() * 0.5) * (PARTICLES.inner / radius[i]) ** 1.5;
      sz[i] = 0.012 + Math.random() * 0.03;
    }
    g.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aAngle", new BufferAttribute(angle, 1));
    g.setAttribute("aRadius", new BufferAttribute(radius, 1));
    g.setAttribute("aHeight", new BufferAttribute(height, 1));
    g.setAttribute("aSpeed", new BufferAttribute(speed, 1));
    g.setAttribute("aSize", new BufferAttribute(sz, 1));
    const m = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpread: { value: 1 },
        uPointScale: { value: 1 },
        uColor: { value: new Color() },
        uOpacity: { value: 0 },
      },
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return { geometry: g, material: m };
  }, []);

  const palmMaterials = useMemo(
    () => ({
      shadow: new ShaderMaterial({
        uniforms: { uOpacity: { value: 0 } },
        vertexShader: palmVert,
        fragmentShader: shadowFrag,
        transparent: true,
        depthWrite: false,
      }),
      spill: new ShaderMaterial({
        uniforms: { uOpacity: { value: 0 }, uColor: { value: new Color() } },
        vertexShader: palmVert,
        fragmentShader: spillFrag,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    }),
    [],
  );

  if (process.env.NODE_ENV !== "production") {
    (window as unknown as { __planetDebug: unknown }).__planetDebug = { anchor, scaler, spin, sim, planets };
  }

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const time = state.clock.elapsedTime;
    const s = sim.current;
    s.t += dt;

    // Where the planet wants to be, and how big.
    const { present } = hand;
    const r = Math.min(PLACEMENT.maxRadius, Math.max(PLACEMENT.minRadius, hand.palmSize * PLACEMENT.radius));
    dir.copy(hand.normal).lerp(Y, PLACEMENT.upBlend).normalize();
    dir.z *= PLACEMENT.depthScale;
    // Clear the whole hand, not just the palm: with fingers pointing up, the
    // fingertips are what the planet must float above.
    const reach = reachAlong(dir);
    const clearance = Math.max(hand.palmSize * PLACEMENT.hover, reach + hand.palmSize * PLACEMENT.gap);
    s.clearance += (clearance - s.clearance) * (1 - Math.exp(-dt * 6));
    target.copy(hand.palm).addScaledVector(dir, s.clearance + r);

    // ── State machine ──
    const go = (phase: Phase) => {
      planetState.phase = phase;
      s.t = 0;
    };
    switch (planetState.phase) {
      case "hidden":
        if (present && !hand.fist && hand.openFor >= TIMING.openHold) {
          planetState.index = pickPlanet(planetState.index);
          planetState.appearances += 1;
          s.shown = planets[planetState.index] ?? null;
          spin.current?.clear();
          if (s.shown) spin.current?.add(s.shown.root);
          if (s.shown) {
            atmosphere.uniforms.uColor.value.copy(s.shown.tint);
            particles.material.uniforms.uColor.value.copy(s.shown.tint);
            palmMaterials.spill.uniforms.uColor.value.copy(s.shown.tint);
          }
          s.clearance = clearance;
          target.copy(hand.palm).addScaledVector(dir, clearance + r);
          s.pos.copy(target);
          s.vel.set(0, 0, 0);
          s.radius = r;
          s.opacity = 1;
          s.impulse = 0;
          go("appearing");
        }
        break;
      case "appearing":
      case "shown":
        if (!present) go("fading");
        else if (hand.fist) go("vanishing");
        else if (planetState.phase === "appearing" && s.t >= TIMING.appear) go("shown");
        break;
      case "vanishing":
        if (s.t >= TIMING.vanish) go("hidden");
        break;
      case "fading":
        if (present && !hand.fist) {
          // Came back mid-fade: same planet, no fanfare.
          planetState.phase = "shown";
        } else if (s.t >= TIMING.fade) {
          go("hidden");
        }
        break;
      default:
        break;
    }
    const { phase } = planetState;
    const p = s.t;

    // ── Scale / opacity envelope ──
    let appear = 1;
    let spread = 1;
    let glow = 1;
    if (phase === "appearing") {
      const x = clamp01(p / TIMING.appear);
      appear = Math.max(0, easeOutBack(x));
      // Particles burst out past their orbit, then settle in.
      spread = x < 0.45 ? 0.2 + (x / 0.45) * 1.5 : 1.7 - smooth((x - 0.45) / 0.55) * 0.7;
      glow = 1 + 2.2 * (1 - x);
    } else if (phase === "vanishing") {
      const x = clamp01(p / TIMING.vanish);
      appear = Math.max(0, 1 - easeInBack(x));
      spread = 1 - x;
      glow = 1 + x;
    } else if (phase === "fading") {
      const x = clamp01(p / TIMING.fade);
      s.opacity = 1 - smooth(x);
      appear = 1 - 0.12 * x;
    } else if (phase === "hidden") {
      appear = 0;
    }
    if (phase === "shown" || phase === "appearing") s.opacity = Math.min(1, s.opacity + dt / 0.3);
    const visible = phase !== "hidden" && s.shown !== null;

    // ── Follow: damped spring, a little lag, never rigid ──
    if (present && phase !== "fading") {
      const k = FOLLOW.stiffness;
      acc.copy(target).sub(s.pos).multiplyScalar(k);
      acc.addScaledVector(s.vel, -2 * Math.sqrt(k) * FOLLOW.damping);
      s.vel.addScaledVector(acc, dt);
      s.radius += (r - s.radius) * (1 - Math.exp(-dt * FOLLOW.scaleRate));
    } else {
      s.vel.multiplyScalar(Math.exp(-dt * 4));
      s.vel.y += 0.15 * dt;
    }
    s.pos.addScaledVector(s.vel, dt);

    // ── Tilt: the palm's facing direction nudges the axis, clamped. (Not the
    // fingers' direction: a sideways-held hand shouldn't roll the world.) ──
    axis.copy(Y).lerp(hand.normal, TILT.amount).normalize();
    const angle = axis.angleTo(Y);
    if (angle > TILT.maxAngle) axis.lerp(Y, 1 - TILT.maxAngle / angle).normalize();
    qTarget.setFromUnitVectors(Y, axis);
    if (present) s.tiltQ.slerp(qTarget, 1 - Math.exp(-dt * TILT.rate));

    // ── Spin: calm base, more when still, hand motion adds momentum ──
    const stillness = smooth(clamp01((hand.stillFor - SPIN.stillAfter) / 1.2));
    const motion = Math.max(-SPIN.maxImpulse, Math.min(SPIN.maxImpulse, hand.velocity.x * SPIN.fromMotion));
    s.impulse += (motion - s.impulse) * (1 - Math.exp(-dt * (Math.abs(motion) > Math.abs(s.impulse) ? 6 : SPIN.decay)));
    let spinRate = SPIN.base + SPIN.still * stillness + s.impulse;
    if (phase === "vanishing") spinRate += 10 * clamp01(p / TIMING.vanish);
    s.spin += spinRate * dt;

    // ── Apply ──
    // Warm-up: for the first frames, draw the whole rig at near-zero scale with
    // a planet attached, so its programs compile now rather than on first
    // appearance.
    const warming = s.warm > 0 && phase === "hidden";
    if (warming) {
      s.warm -= 1;
      if (spin.current && spin.current.children.length === 0 && planets[0]) spin.current.add(planets[0].root);
    } else if (s.warm > 0) {
      s.warm = 0;
    }
    const a = anchor.current;
    if (a) {
      a.visible = visible || warming;
      a.position.copy(s.pos);
      a.position.y += Math.sin(time * 1.6) * FOLLOW.bob * s.radius;
    }
    scaler.current?.scale.setScalar(Math.max(1e-4, s.radius * appear));
    tilt.current?.quaternion.copy(s.tiltQ);
    atmosphereMesh.current?.scale.setScalar(s.shown?.fit ?? 1);
    if (spin.current) spin.current.rotation.y = s.spin;

    const o = visible ? s.opacity : 0;
    s.shown?.materials.forEach((m) => {
      m.opacity = o;
      m.depthWrite = o > 0.98;
    });
    atmosphere.uniforms.uOpacity.value = o * Math.min(1, appear * 1.5);
    atmosphere.uniforms.uGlow.value = glow;
    particles.material.uniforms.uTime.value = time;
    particles.material.uniforms.uSpread.value = spread;
    particles.material.uniforms.uOpacity.value = o * (phase === "appearing" ? 1.4 : 1);
    particles.material.uniforms.uPointScale.value = s.radius * appear * size.height * 2.2;

    // Shadow & light spill lie on the palm plane, under the planet.
    const palmVis = visible && present ? o * Math.min(1, appear) : 0;
    [shadow.current, spill.current].forEach((m, i) => {
      if (!m) return;
      m.visible = palmVis > 0.01 || warming;
      m.position.copy(hand.palm);
      m.position.z += 0.01 + i * 0.005;
      m.quaternion.setFromUnitVectors(Z, hand.normal);
      m.scale.setScalar(s.radius * (i === 0 ? 2 : 2.6) * (0.6 + 0.4 * appear));
    });
    palmMaterials.shadow.uniforms.uOpacity.value = palmVis;
    palmMaterials.spill.uniforms.uOpacity.value = palmVis * (0.8 + 0.4 * (glow - 1));
  });

  return (
    <>
      <mesh ref={shadow} material={palmMaterials.shadow} renderOrder={2} visible={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={spill} material={palmMaterials.spill} renderOrder={3} visible={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <group ref={anchor} visible={false}>
        <group ref={scaler}>
          <group ref={tilt}>
            <group ref={spin} />
            <mesh ref={atmosphereMesh} material={atmosphere} renderOrder={6}>
              <sphereGeometry args={[1.03, 48, 32]} />
            </mesh>
            <points geometry={particles.geometry} material={particles.material} renderOrder={7} frustumCulled={false} />
          </group>
        </group>
      </group>
      <PlanetLights />
    </>
  );
};
