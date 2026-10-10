// Scene.tsx — Tiny Planet on Hand. One hand, one planet. See Brief.md (what)
// and PLAN.md (how).
import { lazy, Suspense } from "react";
import { HandTracker } from "@vincentt-xr/sdk/tracking";

import { Credit } from "./planet/Credit";
import { ExperienceStatus } from "./planet/ExperienceStatus";
import { HandRig } from "./planet/hand";
import { Instructions } from "./planet/Instructions";
import { Planet } from "./planet/Planet";
import { Stage } from "./planet/Stage";

// Dev-only `?debug` overlay, lazy and behind a constant esbuild folds to false
// in production, so its chunk never ships. Two rules:
// - `process.env.NODE_ENV`, not `import.meta.env.DEV` (vincentt-xr/v2-template#112);
// - write the check INSIDE the ternary. Hoisted into a `const`, esbuild no
//   longer drops the dead branch and the dynamic import ships.
const HandDebug =
  process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).has("debug")
    ? lazy(() => import("./planet/HandDebug"))
    : null;

export const Scene = () => (
  <>
    {/* 30 fps inference is plenty: the One Euro filter and the spring smooth between samples. */}
    <HandTracker targetFps={30} />
    <HandRig />
    <ExperienceStatus />

    <Stage />
    <Suspense fallback={null}>
      <Planet />
    </Suspense>
    <Instructions />
    <Credit />

    {HandDebug ? (
      <Suspense fallback={null}>
        <HandDebug />
      </Suspense>
    ) : null}
  </>
);
