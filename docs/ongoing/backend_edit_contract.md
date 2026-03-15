# Backend: Edit Previous Ratings — Contract Summary

This document summarizes what the backend must implement so the mobile app’s “Edit Previous Ratings” feature works end-to-end.

---

## 1. New endpoint: `PATCH /api/ratings/:id`

### Purpose

Allow users to update an existing rating by its ID (no ambiguity when a user has multiple ratings for the same beer at different venues).

### Auth

- **Required** — same as `POST /api/ratings` and `DELETE /api/ratings/:id`.
- **Guest**: If the app supports guest ratings, allow edit only for ratings owned by the current guest. Mobile sends the same headers as for create when in guest mode:
  - `X-Guest-Id`: guest UUID
  - `X-Guest-Display-Name`: guest display name (optional)

### URL

- **Parameter**: `id` — rating UUID. The rating must be owned by the authenticated user (or the guest identified by `X-Guest-Id`).

### Request body

Same fields as `POST /api/ratings`, **all optional** (partial update):

- `beer_name`, `brewery`, `style`, `abv`
- `notes`, `yg_value`
- Flavor sliders: `flavor_hoppy`, `flavor_malty`, `flavor_bitter`, `flavor_sweet`, `flavor_fruity`
- `latitude`, `longitude`, `location_name`, `venue_id`
- `photo_url`, `price_cents`, `serve_type`, `is_happy_hour`
- `beer_id`

Validation rules should match POST where applicable (e.g. `yg_value` in allowed set, ABV range).

### Response

- **200** with body: `{ data: Rating }` (full updated rating object).
- **Do not** return tabs, achievements, streak, or other “create” bonuses. Edit is a content update only.

### Errors

- **404** — rating not found or not owned by the caller.
- **400** — validation error (e.g. invalid `yg_value`).

### Side effects

- Update the `ratings` row only.
- **No** new tabs, **no** achievement re-evaluation, **no** new beer/venue creation.
- Optionally refresh any denormalized/cache fields that depend on rating content (e.g. search/display).

---

## 2. Alternative: extend `POST /api/ratings`

If the backend prefers not to add a new HTTP method:

- Accept an optional **`rating_id`** (or **`id`**) in the **body** of `POST /api/ratings`.
- When present:
  - Verify the rating exists and is owned by the current user (or guest).
  - Update that rating with the provided fields (same semantics as PATCH above).
  - Return **200** with `{ updated: true, data: Rating }`.
- Mobile can be updated to send `rating_id` in the body instead of calling `PATCH /api/ratings/:id`; the contract (ownership, no tabs on update, response shape) remains the same.

---

## 3. Documentation

- Update backend API docs (e.g. `docs/backend_references/API_CONTRACT.md`) with the new or extended contract.
- Mobile contract is already updated in `docs/API_CONTRACT_MOBILE.md` for `PATCH /api/ratings/:id`.

---

## 4. Edge cases

- **Guest**: Only allow edit for ratings owned by the current guest; use the same auth/header pattern as create/delete.
- **Beer identity**: Allowing edit of `beer_name`/`brewery`/`style` may change which beer the rating is tied to; backend should update the rating row and, if needed, relink to a different `beer_id` or leave as custom text. Product may later restrict edits to notes/yg/flavor/photo/location only.
- **Offline**: Handled on mobile (error + retry); no backend change required.

---

## Summary

| Item | Requirement |
|------|--------------|
| **Endpoint** | `PATCH /api/ratings/:id` (or optional `rating_id` in `POST /api/ratings` body) |
| **Auth** | Required; guest uses `X-Guest-Id` (and optionally `X-Guest-Display-Name`) when applicable |
| **Body** | Same fields as POST, all optional |
| **Response** | 200 `{ data: Rating }`; no tabs/achievements/streak |
| **Errors** | 404 (not found / not owned), 400 (validation) |
| **Side effects** | Update rating row only; no tabs, no achievement re-eval |
