# BeerBook Supabase (Backend)

This directory contains migrations and Edge Functions for the BeerBook backend (iOS app and other clients). **Auth is Keycloak** (same as the BFF); user identity is Keycloak `sub` (text). No frontend or web UI is maintained here.

---

## Achievements + Tabs Ledger (Backend)

### Table overview

| Table | Purpose |
|-------|--------|
| `achievement_categories` | Category metadata (key, name, icon, sort_order). Read-only for clients. |
| `achievements` | Achievement definitions (key, name, rules, reward_tabs, trigger_type, etc.). Only `active = true` rows are visible. |
| `user_achievements` | One row per user per unlocked achievement. `user_id` = Keycloak `sub` (text). Written **only** by the `process-event` Edge Function. |
| `tabs_ledger` | Append-only log; one row per award event. `id` = PK, `event_id` = UNIQUE (BFF-generated idempotency key), `event_type`, `amount`, `breakdown` jsonb, `context` jsonb. Written **only** by `process-event`. |
| `profiles` | Existing table; `id` = Keycloak `sub` (text). Column `tabs_balance` only; updated by an **update-only** trigger on `tabs_ledger` INSERT (no row insert from trigger). |

- **Idempotency:** `event_id` uuid UNIQUE on `tabs_ledger`; BFF sends same `event_id` on retries; duplicate insert returns zero delta.
- **Cached balance:** `profiles.tabs_balance` is updated by trigger (UPDATE only) when rows are inserted into `tabs_ledger`. BFF must ensure profile exists before awarding tabs.

### RLS behavior (Keycloak)

- **Read (allowed):**
  - `achievement_categories`: SELECT for `anon` and `authenticated`.
  - `achievements`: SELECT for `anon` and `authenticated` where `active = true`.
- **Read (no direct client policy):**
  - `user_achievements` and `tabs_ledger` have **no** SELECT policy for `anon`/`authenticated` (Supabase does not have Keycloak `auth.uid()`). Clients get their unlocks and ledger/balance via the **BFF** (with Keycloak JWT) or from the **process-event** response (`unlocked`, `tabs_balance`). The BFF or Edge Function uses the service role to read by `user_id` = Keycloak `sub`.
- **profiles:** Existing app policies apply; if clients read profiles via the BFF, they get their own row by `id` = Keycloak sub.
- **Write (not allowed for clients):** No INSERT/UPDATE/DELETE on `user_achievements` or `tabs_ledger`; only the `process-event` Edge Function (service role) writes them.

### How to call `process-event` (BFF only)

- **URL (Supabase hosted):** `POST https://<project-ref>.supabase.co/functions/v1/process-event` (set `PROCESS_EVENT_URL` or `SUPABASE_URL` in BFF).
- **URL (self-hosted, no Edge Runtime):** BFF uses in-app route by default: `POST http://127.0.0.1:<PORT>/internal/process-event` when `PROCESS_EVENT_URL` and `SUPABASE_URL` are unset.
- **Headers:** `Authorization: Bearer <Keycloak access token>`, `Content-Type: application/json`
- **Auth:** Keycloak JWT only; `user_id` = `payload.sub`. Caller is BFF (server-to-server); app does not call process-event directly.
- **Body (JSON):** `event_type`, optional `event_id` (required for `rating_award`, `cheers_given`, `cheers_received`, `admin_grant`), `payload`.

**Valid `event_type` values:** `rating_award`, `cheers_given`, `cheers_received`, `rating_submitted`, `achievement_unlock`, `admin_grant`, `spend`.

**Cheers:** Tab awards for cheering a rating use `tabs_ledger` only (no legacy `tab_transactions`). BFF calls process-event twice per cheer: `cheers_given` (ledger user = JWT sub) and `cheers_received` (ledger user = `payload.target_user_id` = rating owner). Both require a UUID `event_id` for idempotency; duplicate event_id returns `tabs_delta: 0`.

**Example (rating_award — BFF generates event_id):**

```json
{
  "event_type": "rating_award",
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "amount": 7,
    "breakdown": { "rating_base": 1, "rating_location": 1, "rating_photo": 2 },
    "context": { "rating_id": "...", "tier_multiplier": 1.1 }
  }
}
```

**Example (rating_submitted — achievement eval only; no event_id):**

```json
{
  "event_type": "rating_submitted",
  "payload": { "rating_id": "...", "beer_id": "..." }
}
```

- **Response (200):**

```json
{
  "unlocked": [
    { "key": "first_checkin", "name": "First Check-in", "reward_tabs": 5 }
  ],
  "tabs_delta": 5,
  "tabs_balance": 105
}
```

- **Response fields for iOS UI:** Use `unlocked` to show “Achievement unlocked” toasts and badges; use `tabs_delta` for the amount just earned this call; use `tabs_balance` as the current Tabs balance from this ledger (or read `profiles.tabs_balance` via the BFF if you prefer).

### Edge Function env (Keycloak)

Set these for the `process-event` function (e.g. in Supabase dashboard or `supabase secrets`):

- `KEYCLOAK_ISSUER` — e.g. `https://auth.drinksafterwork.net/realms/daw`
- `KEYCLOAK_JWKS_URI` — e.g. `https://auth.drinksafterwork.net/realms/daw/protocol/openid-connect/certs`
- Optional: `TOKEN_CLOCK_SKEW_SECONDS` (default 30)

Defaults match the BFF (`server.js`) if not set.

### iOS integration checklist

- [ ] Run the Supabase migration that creates `achievement_categories`, `achievements`, `user_achievements`, `tabs_ledger`, adds `profiles.tabs_balance`, and the ledger trigger (all use Keycloak `user_id` = `sub`).
- [ ] Deploy the `process-event` Edge Function and set `KEYCLOAK_ISSUER` and `KEYCLOAK_JWKS_URI`.
- [ ] BFF calls `process-event` after creating a rating (rating_award + rating_submitted). App does not call process-event; use **GET /api/achievements** and **GET /api/tabs/profile** for unlocks and balance.
- [ ] Read achievements via **GET /api/achievements** (BFF); read balance via **GET /api/tabs/profile** (BFF returns `profiles.tabs_balance` when present).
- [ ] Do **not** insert or update `user_achievements` or `tabs_ledger` from the client; only `process-event` (service role) should write those tables.

### Cheers migration (tabs_ledger only)

- Cheers tab awards are handled entirely by `process-event` (BFF POST `/api/ratings/:id/cheers`). No writes to `tab_transactions` or `user_tabs_profile` for cheers.
- **Deploy:** After code changes, rebuild/restart the beerbook-api container so it picks up BFF and Edge Function changes. Redeploy the `process-event` Edge Function if `engine.ts` changed.
- **Manual test plan:**
  1. Cheer the same rating twice using the same event_ids (e.g. retry with same IDs) → second call should return `tabs_delta: 0` (idempotent).
  2. Giver balance increases by +1 (or configured amount); receiver balance increases by +1.
  3. No new rows in `tab_transactions` for cheers (only `tabs_ledger`).
  4. **GET /api/tabs/profile** returns `profiles.tabs_balance` as source of truth.
