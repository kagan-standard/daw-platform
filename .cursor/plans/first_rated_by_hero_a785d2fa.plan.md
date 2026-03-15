---
name: First rated by hero
overview: Add "First rated by [user]" with a profile link to the Beer of the Week hero. This requires extending the backend beer-of-the-week response with first-rater user info, then updating the mobile type, hero UI, and navigation.
todos: []
isProject: false
---

# Beer of the Week: "First rated by [user]" with profile link

## Current state

- **Hero:** [src/components/dashboard/BeerOfTheWeekHero.tsx](src/components/dashboard/BeerOfTheWeekHero.tsx) shows badge, beer name, brewery, and meta (review count / avg or style). No first-rater attribution.
- **API:** [src/api/highlights.ts](src/api/highlights.ts) defines `BeerOfTheWeek` with optional `first_reviewed?: string` (ISO date). Backend contract in [docs/backend_references/API_CONTRACT.md](docs/backend_references/API_CONTRACT.md) (lines 2184–2212) documents the same; no user info for “who rated first.”
- **Navigation:** Dashboard lives on `HomeStack`, which has `UserProfile: { userId: string }`. Other screens already use `navigation.navigate('UserProfile', { userId })` (e.g. [DashboardScreen.tsx](src/screens/home/DashboardScreen.tsx) line 185 for rating cards).

## Approach

1. **Backend (beerbook-api, separate repo)**
  Extend `GET /api/highlights/beer-of-the-week` so the `beer` object includes optional first-rater info when available:
  - Add `first_rated_by: { user_id: string, display_name: string } | null`.
  - For the chosen beer (auto-computed or from `featured_beers`), determine the earliest rating in the same time window (e.g. last 7 days for auto, or week for featured) and join to `profiles` (or equivalent) for that user’s `id` and `display_name`. For admin-curated picks, “first” can be defined as first rating ever for that beer, or first in the feature week—product choice.
  - If no rating/user can be resolved (e.g. no ratings, or guest-only), return `first_rated_by: null`.
2. **Mobile (this repo)**
  - **Types and API**  
   In [src/api/highlights.ts](src/api/highlights.ts), extend `BeerOfTheWeek` with:

```ts
     first_rated_by?: { user_id: string; display_name: string } | null;
     

```

```
 No change to `getBeerOfTheWeek()`; it already returns the full `beer` object.
```

- **Hero UI**  
In [src/components/dashboard/BeerOfTheWeekHero.tsx](src/components/dashboard/BeerOfTheWeekHero.tsx):
  - Add optional prop: `onFirstRaterPress?: (userId: string) => void`.
  - When `beer.first_rated_by` is present (and has `user_id` and `display_name`), render a line below the existing meta (or in place of/in addition to it): **"First rated by [display_name]"**, with the display name wrapped in a `TouchableOpacity`/`Pressable` that calls `onFirstRaterPress(beer.first_rated_by.user_id)` and is styled like a link (e.g. `colors.primary` or `colors.gold`, optional underline).
  - Ensure the whole card still uses `onRatePress` for the main tap target; the first-rater line should not trigger navigation when the user taps elsewhere on the card. Use `onPress` on the name only and prevent event bubbling if needed so only the name is the profile link.
- **Dashboard wiring**  
In [src/screens/home/DashboardScreen.tsx](src/screens/home/DashboardScreen.tsx), pass the callback into the hero:

```ts
     <BeerOfTheWeekHero
       beer={beerOfTheWeek ?? null}
       onRatePress={navigateToBeerOfTheWeek}
       onFirstRaterPress={(userId) => navigation.navigate('UserProfile', { userId })}
     />
     

```

1. **Contract doc**
  In [docs/backend_references/API_CONTRACT.md](docs/backend_references/API_CONTRACT.md), update the beer-of-the-week success response to include:
  - `first_rated_by`: `{ "user_id": "string", "display_name": "string" } | null`

## Behaviour summary

- If the API does not yet return `first_rated_by`, the hero simply omits the line (graceful degradation).
- When `first_rated_by` is present, the hero shows “First rated by ” with the name as a tappable link to that user’s profile.
- Tapping the main card still goes to the rate flow; only tapping the name goes to the user profile.

## Files to change (mobile)


| File                                                                                             | Change                                                                                           |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [src/api/highlights.ts](src/api/highlights.ts)                                                   | Add `first_rated_by` to `BeerOfTheWeek`.                                                         |
| [src/components/dashboard/BeerOfTheWeekHero.tsx](src/components/dashboard/BeerOfTheWeekHero.tsx) | Add `onFirstRaterPress` prop; render “First rated by [name]” link when `first_rated_by` present. |
| [src/screens/home/DashboardScreen.tsx](src/screens/home/DashboardScreen.tsx)                     | Pass `onFirstRaterPress` that navigates to `UserProfile`.                                        |
| [docs/backend_references/API_CONTRACT.md](docs/backend_references/API_CONTRACT.md)               | Document `first_rated_by` in beer-of-the-week response.                                          |


Backend work (in beerbook-api repo): extend `routes/highlights.js` (or equivalent) to compute and return `first_rated_by` for the selected beer.