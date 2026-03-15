---
name: Venue Check-In Verification
overview: "Implement best-effort venue check-in verification: app sends device GPS at submit when a venue is selected; backend verifies distance and sets location_verified; use that flag for crew-visited pins and milestones. App work is in this repo; backend and downstream changes are documented for the separate beerbook-api codebase."
todos: []
isProject: false
---

# Venue Check-In Verification — Implementation Plan

## Summary of the feature plan

The [venue check-in verification plan](.cursor/plans/venue_check-in_verification_f0505839.plan.md) describes:

- **Current behavior:** The app sends the **venue’s stored coordinates** (and `venue_id`) when the user selects a venue. The backend does not check if the device was actually at the venue.
- **Goal:** When a venue is selected, capture the **device’s current position at submit time** and send it; backend computes distance to the venue and sets a `location_verified` flag. Use that flag for crew-visited pins, “first venue visit” milestones, and optionally for location-based tabs.

---

## Architecture (high level)

```mermaid
sequenceDiagram
  participant User
  participant RateScreen
  participant Location as expo-location
  participant API as ratingsApi.create
  participant Backend as POST /api/ratings

  User->>RateScreen: Submit (venue selected)
  RateScreen->>Location: getCurrentPositionAsync (if venue_id)
  alt Permission + success
    Location-->>RateScreen: device lat/lng
    RateScreen->>API: payload with device lat/lng + venue_id
  else No permission or skip
    RateScreen->>API: payload with venue coords only (unverified)
  end
  API->>Backend: POST /api/ratings
  Backend->>Backend: Haversine vs venue; set location_verified
  Backend-->>API: 201 + data.location_verified
```



---

## 1. App: Send device location at submit when venue is selected

**Scope:** This repo only. Backend is in `daw-platform/apps/beerbook-api` (see [API_CONTRACT.md](docs/backend_references/API_CONTRACT.md)); backend changes are listed in section 2 for that codebase.

### 1.1 Where to get device location

- **Online create (RateScreen):** In the submit handler (around where `submissionForm` is built and `createRating(submissionForm)` is called in [RateScreen.tsx](src/screens/rate/RateScreen.tsx)), when `submissionForm.venue_id != null` (or when the user has chosen a venue/location), call `expo-location` **before** calling `createRating`.
- **Draft submit (DraftSubmissionService):** In [DraftSubmissionService.ts](src/services/DraftSubmissionService.ts), inside `executeSingleSubmission`, when `draft.venue_id != null`, get device position before building the payload; pass device coords into `buildPayload` (or override `latitude`/`longitude` on the payload) so the create request sends device coords, not the draft’s stored venue coords.

Use the same options as existing usage (e.g. [DiscoverScreen](src/screens/discover/DiscoverScreen.tsx), [LocationPickerScreen](src/screens/rate/LocationPickerScreen.tsx)): `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, maxAge: 60000 })`. Optionally request permission first with `Location.requestForegroundPermissionsAsync()` if you want to prompt; otherwise, if permission is denied, fall back to sending existing coords (backend will not set `location_verified`).

### 1.2 UX choice (plan options A vs B)

- **Option A (Automatic):** When a venue is selected, on submit always try to get device location; if available, send it; if not (permission denied or error), send venue coords and backend leaves verification false. No new UI.
- **Option B (Explicit “Verify I’m here”):** Add a “Verify I’m here” button that gets GPS and, if within range of the selected venue, locks the check-in as “Verified”; submit then sends device coords. If the user never taps it, submit sends venue coords only.

Recommendation: Start with **Option A** for less UI surface and consistent behavior; Option B can be added later if you want an explicit verification step.

### 1.3 Permission and fallback (privacy)

- Prefer **optional** verification: if the user has not granted location or location fails, still allow submit with `venue_id` and existing coords (or no coords). Backend will not set `location_verified`.
- Do **not** block submit with a hard “Turn on location to check in” unless you explicitly choose the “stricter” enforcement UX from the plan (section 5 of the plan).

### 1.4 Implementation points

- **RateScreen:** Before `createRating(submissionForm)` (and before `updateRating` when editing a rating with a venue), if the payload has `venue_id`, call a small helper (e.g. `getDeviceLocationForVerification()`) that returns `{ latitude, longitude } | null`. If non-null, set `submissionForm.latitude` and `submissionForm.longitude` to those values; otherwise keep the existing form coords. Then call `createRating`/`updateRating` with the resulting payload.
- **DraftSubmissionService:** In `executeSingleSubmission`, when `draft.venue_id != null`, call the same (or similar) device-location helper. If you get coords, pass them into `buildPayload` (e.g. extend `buildPayload(draft, photoUrl, deviceCoords?)` and use `deviceCoords ?? draft` for lat/lng), then call `ratingsApi.create` with that payload. If no coords, keep current behavior (draft lat/lng).
- **Single place for location logic:** Extract one shared helper (e.g. in `src/utils/geolocation.ts` or a small `src/utils/venueCheckIn.ts`) that:
  - Optionally checks/requests foreground permission.
  - Calls `getCurrentPositionAsync` with `Accuracy.Balanced` and `maxAge: 60000`.
  - Returns `{ latitude, longitude }` or `null` on denial/error.
  So both RateScreen and DraftSubmissionService use the same behavior and options.

### 1.5 Types and API response

- **Request:** No change to the API contract: `latitude` and `longitude` are already part of [CreateRatingPayload](src/types/api.ts). You simply send **device** coords instead of venue coords when verification is attempted.
- **Response:** Once the backend adds `location_verified` to the rating object, add `location_verified?: boolean` to the [Rating](src/types/models.ts) type (and any API response type that returns a rating). Normalize it in [ratingsApi](src/api/ratings.ts) in `normalizeRating` if the backend uses a different key (e.g. `location_verified`).

### 1.6 Optional UI: “Verified check-in” badge

- When displaying a rating that has `venue_id` and `location_verified === true`, show a small “Verified check-in” badge (e.g. in [RatingCard](src/components/ratings/RatingCard.tsx) or [DashboardActivityCard](src/components/dashboard/DashboardActivityCard.tsx) where the venue/location row is shown). If `location_verified` is missing or false, do not show the badge. This can be done in a follow-up after the backend returns the field.

---

## 2. Backend (separate codebase: beerbook-api)

These items are for the backend repo (`daw-platform/apps/beerbook-api`), not for changes in this mobile repo. Document or implement them there.

### 2.1 Schema

- Add to `ratings` (or equivalent): `**location_verified`** (boolean, default `false`). Set to `true` only when the backend has verified that the submitted coordinates were within the configured distance of the linked venue at create time.

### 2.2 POST /api/ratings behavior

- When the request has both `**venue_id`** and `**latitude`** + `**longitude`**:
  - Load the venue’s stored coordinates.
  - Compute haversine distance (meters) between `(latitude, longitude)` and the venue.
  - If distance is within a **threshold** (e.g. 100–200 m; configurable):
    - Set `**location_verified = true`** on the rating.
  - If beyond the threshold:
    - **Strict option:** Return `400` with a message like “You must be at the venue to check in. Your location was X m away.” and do not create/update the rating.
    - **Soft option (recommended):** Save the rating with `**location_verified = false`**; downstream features (crew visited, milestones) only count ratings where `location_verified = true`.
- When the request has `venue_id` but **no** lat/lng (or only venue coords repeated): do **not** set `location_verified` (or set `false`). Verification only happens when the client sends device coords.

### 2.3 Response and list/detail

- Include `**location_verified`** in the rating payload for create/update and for list/detail responses so the app can show the “Verified check-in” badge.

### 2.4 Downstream use of `location_verified`

- **Crew “visited” pins / Discover:** When computing “crew visited” for a venue, count only ratings where `venue_id = that venue` **and** `location_verified = true` (or, for legacy behavior, fall back to all ratings with that `venue_id` until you fully switch).
- **Milestones “first venue visit”:** Emit or compute “Tyler visited a new venue: Hardywood” only when the rating that first links that user (and crew) to the venue has `**location_verified = true`**.
- **Tabs / rewards:** Either keep awarding `rating_location` tabs for any rating with location, or restrict the location bonus to ratings with `location_verified` only (product decision).

---

## 3. Limitations (from the plan)

- **Spoofing:** Mock location apps can fake coordinates; verification is best-effort.
- **Accuracy:** GPS can be 5–50 m off; ~100–150 m threshold is a reasonable balance.
- **Privacy:** Allowing unverified check-in (submit with venue_id but without device coords) keeps users who deny location in the flow.

---

## 4. Suggested implementation order

1. **App – shared device location helper**
  Add a small helper (e.g. in `src/utils/geolocation.ts` or `src/utils/venueCheckIn.ts`) that gets current position with Balanced accuracy and 60s maxAge, returns coords or null. Use it from both RateScreen and DraftSubmissionService.
2. **App – RateScreen submit path**
  Before `createRating(submissionForm)` / `updateRating(...)`, when payload has `venue_id`, call the helper and, if coords returned, set `submissionForm.latitude` / `longitude` to device coords. Then submit.
3. **App – DraftSubmissionService**
  In `executeSingleSubmission`, when `draft.venue_id != null`, call the same helper; if coords returned, build the create payload with those as lat/lng instead of the draft’s. Then call `ratingsApi.create`.
4. **App – types and normalization**
  Add `location_verified?: boolean` to the Rating type and to API response handling; normalize in `normalizeRating` if needed.
5. **Backend (separate repo)**
  Add `location_verified` to schema; implement distance check and flag in POST /api/ratings; include `location_verified` in responses; update crew-visited and first_venue_visit logic to use it.
6. **App – optional “Verified check-in” badge**
  In rating cards, show a small badge when `rating.location_verified === true` and the rating has a venue.

---

## 5. Files to touch (mobile repo)


| Area          | File                                                                                                                                                                 | Change                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Helper        | `src/utils/geolocation.ts` or new `src/utils/venueCheckIn.ts`                                                                                                        | Add `getDeviceLocationForVerification()` (optional permission request, getCurrentPositionAsync, return `{ lat, lng }                  |
| Submit        | [src/screens/rate/RateScreen.tsx](src/screens/rate/RateScreen.tsx)                                                                                                   | Before create/update, if venue_id set, get device coords and override submissionForm lat/lng; then call createRating/updateRating     |
| Drafts        | [src/services/DraftSubmissionService.ts](src/services/DraftSubmissionService.ts)                                                                                     | In executeSingleSubmission, when draft.venue_id != null, get device coords and use them in buildPayload (or override payload lat/lng) |
| Types         | [src/types/models.ts](src/types/models.ts)                                                                                                                           | Add `location_verified?: boolean` to Rating                                                                                           |
| Types         | [src/types/api.ts](src/types/api.ts)                                                                                                                                 | Add `location_verified` to any Rating-shaped response type if not already on Rating                                                   |
| API           | [src/api/ratings.ts](src/api/ratings.ts)                                                                                                                             | In normalizeRating, map backend `location_verified` if key differs                                                                    |
| UI (optional) | [src/components/ratings/RatingCard.tsx](src/components/ratings/RatingCard.tsx), [LocationVenueSection](src/components/ratings/LocationVenueSection.tsx) or venue row | Show “Verified check-in” when `rating.location_verified === true` and rating has venue                                                |


Backend and downstream (crew visited, milestones, tabs) are implemented in the beerbook-api repo and documented above for that team.