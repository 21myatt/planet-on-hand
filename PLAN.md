# Plan — Tiny Planet on Hand

What: `Brief.md`. This file is how.

## Decisions (confirmed 2026-10-10)

- **Placement:** the planet sits along the palm's facing direction, blended toward screen-up. Palm
  up → straight above it; palm to camera → above the palm/fingers, not covering them.
- **Planet choice:** a new random planet (of 10, never the same twice in a row) each time it
  materializes.
- **Fist:** the planet shrinks and vanishes. Opening the hand materializes a new one.

## Files

- `public/models/toy_cartoon_planets.glb` (+ credit): served locally, no external hosting.
  CC BY 4.0 credit is shown on screen. Not under `src/`: the zone manifest must classify every
  tracked `src/` file and accepts only code extensions, so binary assets can't live there.
- Preview clips and their dev-only loader were used to build and tune this, then removed for
  production (2026-10-10): **the input is the webcam only.**
- `src/planet/`:
  - `config.ts`: every tunable.
  - `oneEuro.ts`
  - `hand.ts`: landmarks → smoothed palm centre, palm normal (signed toward camera/up),
    palm "up", palm size, open/fist with hysteresis, presence with a grace period.
  - `Planet.tsx`: GLB extraction and normalisation, the state machine, follow spring, tilt,
    spin, atmosphere, orbit particles, palm shadow and light spill.
  - `Instructions.tsx`: "Hold out your open hand" while no hand is in view.
  - `Credit.tsx`: the CC BY line.
  - `HandDebug.tsx`: `?debug`, dev-only. Guarded by `process.env.NODE_ENV` written inside the
    ternary: hoisted into a `const`, esbuild keeps the dead branch and the chunk ships.
  - `ExperienceStatus.tsx`: `<html data-experience>`, an `experience:status` event, and a postMessage
    to the parent page when embedded (`loading` / `ready` / `error`).

## Planet state machine

`hidden → appearing → shown → (fist) vanishing → hidden`
`shown → (hand lost) fading → hidden`. If the hand returns mid-fade, the **same** planet fades back
in. Once fully hidden, the next appearance picks a new planet.

| State | Motion | Look |
|---|---|---|
| appearing (0.9 s) | scale 0 → 1 with overshoot | glow flash, particles burst out then settle into orbit |
| shown | damped spring to the palm anchor; tilt follows the palm (clamped); calm self-spin, a little more when the hand is still; hand motion adds spin that decays | atmosphere rim, orbiting particles, shadow and warm spill on the palm |
| vanishing (0.45 s) | ease-in shrink, spin-up | particles collapse inward |
| fading (0.7 s) | opacity → 0, slight drift up | everything fades together |

## Production

- Webcam-only. Title and share-preview metadata are in `index.html` (a platform file, so re-apply
  them after a template upgrade). Shaders are pre-warmed at load. Every new `src/` file is in the
  manifest's `creator` list.

## Checks

- Both clips: anchoring, tilt, fist vanish and new planet, hand enters/leaves (side clip starts empty).
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — with no clip or dev code in `dist/`.
- New `src/` files added to `.vincentt-template.json` → `creator` (smoke-build).
