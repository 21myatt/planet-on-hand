// Every tunable. World units: camera at z=5, 45° vertical FOV, so the z=0 stage
// is ~4.14 units tall.

export const PLACEMENT = {
  /** Planet radius as a fraction of palm size (wrist → middle knuckle). */
  radius: 0.62,
  /** Gap between the palm and the planet's surface, × palm size. */
  hover: 0.85,
  /** Gap above the furthest landmark (e.g. fingertips), × palm size. */
  gap: 0.25,
  /** Ringed planets' body scale, so the rings fit roughly where a plain planet would. */
  ringedScale: 0.62,
  /** 0 = pure palm normal, 1 = pure screen-up. */
  upBlend: 0.55,
  /** Flattens the toward-camera part of the offset, so perspective doesn't balloon it. */
  depthScale: 0.35,
  /** Radius never leaves this range (world units), whatever the palm does. */
  minRadius: 0.16,
  maxRadius: 0.42,
};

export const FOLLOW = {
  /** Position spring. Slightly under-damped: responsive, with a little float. */
  stiffness: 70,
  damping: 0.82,
  /** Scale follows palm size this fast (1/s). */
  scaleRate: 6,
  /** Idle bob amplitude, × radius. */
  bob: 0.05,
};

export const TILT = {
  /** How much of the palm's orientation reaches the planet's axis (0..1). */
  amount: 0.45,
  /** Hard clamp on axis tilt from vertical (radians). */
  maxAngle: 0.6,
  /** Slerp rate toward the target tilt (1/s). */
  rate: 5,
};

export const SPIN = {
  /** Base self-rotation (rad/s). */
  base: 0.35,
  /** Extra spin eased in while the hand is still (rad/s). */
  still: 0.25,
  /** Hand speed below this counts as still (units/s). */
  stillSpeed: 0.25,
  /** Seconds of stillness before the extra spin eases in. */
  stillAfter: 0.6,
  /** Sideways hand velocity → spin impulse. */
  fromMotion: 1.6,
  /** Impulse spin decay (1/s). */
  decay: 1.8,
  maxImpulse: 4,
};

export const TIMING = {
  appear: 0.9,
  vanish: 0.45,
  fade: 0.7,
  /** An open hand must hold this long before a planet appears (s). */
  openHold: 0.15,
};

export const GESTURE = {
  /** Openness = mean(wrist→fingertip) / mean(wrist→knuckle). ~2 open, ~1 fist. */
  fistOn: 1.18,
  fistOff: 1.32,
  fistHoldMs: 90,
  /** Landmarks missing longer than this = hand gone (ms). */
  lostMs: 250,
};

export const SMOOTHING = {
  minCutoff: 1.4,
  beta: 0.8,
  /** Palm-normal low-pass rate (1/s); z is the noisiest axis. */
  normalRate: 8,
};

export const PARTICLES = {
  count: 42,
  /** Orbit radius range, × planet radius. */
  inner: 1.35,
  outer: 1.8,
  /** rad/s */
  speed: 0.9,
};

export const STAGE = {
  /** Overall dim of the camera feed (0 = none). */
  dim: 0.12,
  /** Extra darkening at the edges. */
  vignette: 0.35,
};
