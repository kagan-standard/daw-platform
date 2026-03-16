---
name: Add PostRatingOverlay rename to plan
overview: Update the Head-to-Head ranking system plan to include renaming TabsEarnedBanner to PostRatingOverlay, so the component name reflects its role as the single post-rating overlay (tabs + optional head-to-head) rather than only "tabs earned."
todos: []
isProject: false
---

# Add PostRatingOverlay Rename to Head-to-Head Plan

Update the existing Head-to-Head plan document so that the component rename is part of the Phase 1 scope.

---

## 1. Add rename to Phase 1 (plan doc)

In [.cursor/plans/head-to-head_ranking_system_0fa08338.plan.md](.cursor/plans/head-to-head_ranking_system_0fa08338.plan.md):

- **Section 1.4** — Change the title from "TabsEarnedBanner extended for Head-to-Head" to **"PostRatingOverlay (rename + extend)"** and add an explicit rename step at the top of the section:
  - **Rename**: Rename `TabsEarnedBanner` to **PostRatingOverlay** (component name and file: `TabsEarnedBanner.tsx` → `PostRatingOverlay.tsx`). The name reflects that this overlay owns the full post-rating experience (tabs earned phase + optional Head-to-Head phase), not just the tabs breakdown. Use "Overlay" rather than "Screen" since it is not a route.
  - Keep the rest of 1.4 (extend same overlay with two phases, props, Phase 1/Transition/Phase 2, no headToHead behavior).
- **Current state (mobile)** — Update the bullet that mentions TabsEarnedBanner to say it will be renamed to PostRatingOverlay in Phase 1 (or leave as-is and only reference the new name from 1.4 onward; either is fine).
- **Section 1.3** — Where it says "show burst + TabsEarnedBanner", change to "show burst + PostRatingOverlay" (or "post-rating overlay") so the plan is consistent after the rename.
- **Section 1.5** — Replace "tabs banner" / "TabsEarnedBanner" with "PostRatingOverlay" or "post-rating overlay" in the RateScreen bullets.
- **Summary table** — In Phase 1 mobile work, mention the rename: e.g. "Rename TabsEarnedBanner → PostRatingOverlay; two-phase overlay (tabs fade → Head-to-Head in same overlay); types, API, contract doc."

---

## 2. Implementation scope (when executing Phase 1)

When Phase 1 is implemented, the rename will involve:

- **File**: [src/components/ratings/TabsEarnedBanner.tsx](src/components/ratings/TabsEarnedBanner.tsx) → `PostRatingOverlay.tsx` (same directory or keep under `ratings/`).
- **Component and export**: `TabsEarnedBanner` → `PostRatingOverlay`; default export and any named exports.
- **Imports**: Update the single consumer [RateScreen](src/screens/rate/RateScreen.tsx) (and [OnboardingRateScreen](src/screens/onboarding/OnboardingRateScreen.tsx) if it ever uses this overlay) to import `PostRatingOverlay` from the new file name.
- **Props interface**: Can stay `TabsEarnedBannerProps` or be renamed to `PostRatingOverlayProps` for consistency.

No other references to "TabsEarnedBanner" exist in the codebase beyond RateScreen (and the plan doc). The plan document itself should be updated as above so the rename is clearly part of the Phase 1 checklist.