// CC BY 4.0 attribution for the planet models: title, author, source and
// license (each linked), plus a note that the work was modified. Full text in
// CREDITS.md and public/models/credit-toy-cartoon.md.
import type { CSSProperties } from "react";
import { Html } from "@react-three/drei";

const SOURCE_URL = "https://skfb.ly/pCuq7";
const AUTHOR_URL = "https://sketchfab.com/Gerhald";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

const box: CSSProperties = {
  position: "absolute",
  right: 10,
  bottom: "max(8px, env(safe-area-inset-bottom))",
  maxWidth: "calc(100% - 20px)",
  font: '400 9px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  color: "rgba(255,255,255,.6)",
  textShadow: "0 1px 3px rgba(0,0,0,.55)",
  letterSpacing: "0.02em",
  textAlign: "right",
  pointerEvents: "none",
  userSelect: "none",
};

// Only the links take pointer events; the rest of the overlay stays click-through.
const link: CSSProperties = { color: "inherit", textDecoration: "underline", pointerEvents: "auto" };

export const Credit = () => (
  <Html fullscreen zIndexRange={[21, 0]} pointerEvents="none">
    <div style={box}>
      3D models:{" "}
      <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" style={link}>
        “Toy Cartoon Planets”
      </a>{" "}
      by{" "}
      <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" style={link}>
        Gerhald
      </a>
      ,{" "}
      <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" style={link}>
        CC BY 4.0
      </a>{" "}
      · modified
    </div>
  </Html>
);
