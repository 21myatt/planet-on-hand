// Hand state: landmarks → smoothed palm centre, palm orientation, palm size and
// an open/fist reading. One mutable module-level object, written once per frame
// by <HandRig /> at useFrame priority -1 (before every reader).
import { Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { XRModel } from "@vincentt-xr/sdk";
import { useXRContext, type XRModelNodeHandTracking } from "@vincentt-xr/sdk/low-level";

import { GESTURE, SMOOTHING, SPIN } from "./config";
import { OneEuro } from "./oneEuro";

export type HandState = {
  /** Landmarks are arriving (with a short grace period on dropouts). */
  present: boolean;
  /** Smoothed palm centre on the stage (z ≈ 0). */
  palm: Vector3;
  /** Palm velocity (units/s). */
  velocity: Vector3;
  /** Unit palm normal, signed to point toward the camera / upward. */
  normal: Vector3;
  /** Unit wrist → middle-knuckle direction ("up" along the hand). */
  up: Vector3;
  /** Wrist → middle-knuckle length (world units), smoothed. */
  palmSize: number;
  openness: number;
  fist: boolean;
  /** Seconds the hand has been continuously open (0 while fist / absent). */
  openFor: number;
  /** Seconds the palm has been still. */
  stillFor: number;
  landmarks: Vector3[];
};

export const hand: HandState = {
  present: false,
  palm: new Vector3(),
  velocity: new Vector3(),
  normal: new Vector3(0, 0, 1),
  up: new Vector3(0, 1, 0),
  palmSize: 0.35,
  openness: 1.6,
  fist: false,
  openFor: 0,
  stillFor: 0,
  landmarks: Array.from({ length: 21 }, () => new Vector3()),
};

if (process.env.NODE_ENV !== "production") (window as unknown as { __hand: HandState }).__hand = hand;

const WRIST = 0;
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;
const FINGERS: [mcp: number, tip: number][] = [
  [5, 8],
  [9, 12],
  [13, 16],
  [17, 20],
];

const fx = new OneEuro(SMOOTHING.minCutoff, SMOOTHING.beta);
const fy = new OneEuro(SMOOTHING.minCutoff, SMOOTHING.beta);
const fOpen = new OneEuro(3, 0.2);
const raw = new Vector3();
const prev = new Vector3();
const inst = new Vector3();
const a = new Vector3();
const b = new Vector3();
const n = new Vector3();
const u = new Vector3();

let lastSeen = -Infinity;
let fistCandidateMs = 0;

const dist2 = (p: Vector3, q: Vector3) => Math.hypot(p.x - q.x, p.y - q.y);

/** Furthest any landmark reaches past the palm centre along `dir` (2D, world units). */
export const reachAlong = (dir: Vector3): number => {
  let best = 0;
  const len = Math.hypot(dir.x, dir.y) || 1;
  for (const p of hand.landmarks) {
    const d = ((p.x - hand.palm.x) * dir.x + (p.y - hand.palm.y) * dir.y) / len;
    if (d > best) best = d;
  }
  return best;
};

export const HandRig = () => {
  const { session } = useXRContext();
  const { viewport, camera } = useThree();

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const now = state.clock.elapsedTime * 1000;
    const { width, height } = viewport.getCurrentViewport(camera, [0, 0, 0]);
    const hw = width / 2;
    const hh = height / 2;

    const node = session.getModelNode<XRModelNodeHandTracking>(XRModel.HAND_TRACKER);
    const coords = node?.hands?.[0]?.coordinates ?? node?.coordinates;

    if (coords && coords.length >= 21) {
      const wasPresent = hand.present;
      lastSeen = now;
      // Tracker z shares x's scale (normalised image width), so it maps with hw.
      for (let i = 0; i < 21; i += 1) {
        hand.landmarks[i].set(coords[i].x * hw, coords[i].y * hh, coords[i].z * hw);
      }
      const L = hand.landmarks;

      raw.copy(L[WRIST]);
      for (const [mcp] of FINGERS) raw.add(L[mcp]);
      raw.multiplyScalar(1 / 5);

      if (!wasPresent) {
        fx.reset();
        fy.reset();
      }
      prev.copy(hand.palm);
      hand.palm.set(fx.filter(raw.x, dt), fy.filter(raw.y, dt), 0);
      if (wasPresent) {
        inst.subVectors(hand.palm, prev).multiplyScalar(1 / dt);
        hand.velocity.lerp(inst, 1 - Math.exp(-dt * 14));
      } else {
        hand.velocity.set(0, 0, 0);
      }

      // Palm orientation from the wrist–index–pinky triangle.
      a.subVectors(L[INDEX_MCP], L[WRIST]);
      b.subVectors(L[PINKY_MCP], L[WRIST]);
      n.crossVectors(a, b).normalize();
      // Front or back of the hand can't be told apart reliably, so always take
      // the side facing the camera / sky: that's where the planet floats.
      if (n.z * 0.6 + n.y < 0) n.negate();
      const k = wasPresent ? 1 - Math.exp(-dt * SMOOTHING.normalRate) : 1;
      hand.normal.lerp(n, k).normalize();
      u.subVectors(L[MIDDLE_MCP], L[WRIST]).normalize();
      hand.up.lerp(u, k).normalize();

      const size = Math.max(0.05, dist2(L[WRIST], L[MIDDLE_MCP]));
      hand.palmSize = wasPresent ? hand.palmSize + (size - hand.palmSize) * k : size;

      let tipSum = 0;
      let mcpSum = 0;
      for (const [mcp, tip] of FINGERS) {
        tipSum += dist2(L[WRIST], L[tip]);
        mcpSum += dist2(L[WRIST], L[mcp]);
      }
      hand.openness = fOpen.filter(tipSum / Math.max(mcpSum, 1e-4), dt);
      hand.present = true;
    } else if (now - lastSeen > GESTURE.lostMs) {
      hand.present = false;
      hand.velocity.multiplyScalar(0.8);
    }

    // Fist, with hysteresis and a short hold so one bad frame can't trigger it.
    const wantFist = hand.present && (hand.fist ? hand.openness < GESTURE.fistOff : hand.openness < GESTURE.fistOn);
    if (wantFist !== hand.fist) {
      fistCandidateMs += dt * 1000;
      if (fistCandidateMs >= GESTURE.fistHoldMs || !hand.present) {
        hand.fist = wantFist;
        fistCandidateMs = 0;
      }
    } else {
      fistCandidateMs = 0;
    }

    hand.openFor = hand.present && !hand.fist ? hand.openFor + dt : 0;
    hand.stillFor = hand.present && hand.velocity.length() < SPIN.stillSpeed ? hand.stillFor + dt : 0;
  }, -1);

  return null;
};
