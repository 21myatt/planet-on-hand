// A light dim + vignette over the camera feed: the hand stays the anchor, the
// planet's glow reads, and edges fall away.
import { useMemo } from "react";
import { ShaderMaterial } from "three";

import { STAGE } from "./config";

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const frag = /* glsl */ `
uniform float uDim;
uniform float uVignette;
varying vec2 vUv;
void main() {
  vec2 c = (vUv - 0.5) * vec2(0.8, 1.0);
  float v = smoothstep(0.22, 0.62, length(c));
  gl_FragColor = vec4(0.02, 0.03, 0.06, clamp(uDim + v * uVignette, 0.0, 0.9));
}
`;

export const Stage = () => {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uDim: { value: STAGE.dim }, uVignette: { value: STAGE.vignette } },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  return (
    <mesh position={[0, 0, -1.5]} material={material} renderOrder={-500}>
      <planeGeometry args={[3.4, 5.6]} />
    </mesh>
  );
};
