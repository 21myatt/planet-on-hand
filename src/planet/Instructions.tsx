// Shown whenever no hand is in view; gone the moment one appears. Hidden until
// the camera runs, so it never covers the shell's loading / camera-error screens.
import { useRef } from "react";
import type { CSSProperties } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { XRModel } from "@vincentt-xr/sdk";
import {
  useXRError,
  useXRModel,
  useXRReady,
  type XRModelNodeHandTracking,
} from "@vincentt-xr/sdk/low-level";

import { hand } from "./hand";
import { planetState } from "./Planet";

/** No hand for this long brings the screen back (s). */
const RETURN_AFTER = 1.2;

const font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const screen: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 8,
  padding: "0 28px max(88px, calc(env(safe-area-inset-bottom) + 72px))",
  background: "linear-gradient(to top, rgba(6,8,16,.55), rgba(6,8,16,0) 45%)",
  color: "#f4f7ff",
  fontFamily: font,
  textAlign: "center",
  opacity: 0,
  transition: "opacity 450ms ease",
  pointerEvents: "none",
  userSelect: "none",
};

const hint: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: "max(40px, calc(env(safe-area-inset-bottom) + 24px))",
  textAlign: "center",
  color: "rgba(244,247,255,.75)",
  font: `500 13px/1.3 ${font}`,
  letterSpacing: "0.04em",
  textShadow: "0 1px 6px rgba(0,0,0,.45)",
  opacity: 0,
  transition: "opacity 450ms ease",
  pointerEvents: "none",
  userSelect: "none",
};

export const Instructions = () => {
  const { ready } = useXRModel<XRModelNodeHandTracking>(XRModel.HAND_TRACKER);
  const cameraReady = useXRReady();
  const cameraError = useXRError();
  const root = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const missing = useRef(RETURN_AFTER);
  const shownAt = useRef<number | null>(null);

  useFrame((state, dt) => {
    missing.current = hand.present ? 0 : missing.current + dt;
    const show = cameraReady && !cameraError && (!ready || missing.current >= RETURN_AFTER);
    if (root.current) root.current.style.opacity = show ? "1" : "0";
    if (titleRef.current) {
      const text = ready ? "Hold out your open hand" : "Loading hand tracking…";
      if (titleRef.current.textContent !== text) titleRef.current.textContent = text;
    }
    // After the first planet, a one-time hint that a fist puts it away.
    if (hintRef.current) {
      if (planetState.appearances === 1 && planetState.phase === "shown" && shownAt.current === null) {
        shownAt.current = state.clock.elapsedTime;
      }
      const age = shownAt.current === null ? -1 : state.clock.elapsedTime - shownAt.current;
      const on = age >= 1.5 && age < 6 && planetState.appearances === 1;
      hintRef.current.style.opacity = on ? "1" : "0";
    }
  });

  return (
    <Html fullscreen zIndexRange={[22, 0]} pointerEvents="none">
      <div ref={root} style={screen}>
        <div style={{ fontSize: 30 }} aria-hidden="true">
          🖐️
        </div>
        <div ref={titleRef} style={{ fontSize: 22, fontWeight: 650, letterSpacing: "0.01em" }}>
          Hold out your open hand
        </div>
        <div style={{ fontSize: 14, color: "rgba(244,247,255,.72)" }}>A tiny world will appear in your palm</div>
      </div>
      <div ref={hintRef} style={hint}>
        Close your hand to put it away · open it for a new world
      </div>
    </Html>
  );
};
