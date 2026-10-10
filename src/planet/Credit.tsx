// CC BY 4.0 attribution for the planet models (public/models/credit-toy-cartoon.md).
import { Html } from "@react-three/drei";

export const Credit = () => (
  <Html fullscreen zIndexRange={[21, 0]} pointerEvents="none">
    <div
      style={{
        position: "absolute",
        right: 10,
        bottom: "max(8px, env(safe-area-inset-bottom))",
        font: '400 9px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        color: "rgba(255,255,255,.55)",
        textShadow: "0 1px 3px rgba(0,0,0,.5)",
        letterSpacing: "0.02em",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      “Toy Cartoon Planets” by Gerhald · CC BY 4.0
    </div>
  </Html>
);
