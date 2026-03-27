---
name: Push register 23505 idempotent
overview: Treat PostgREST unique violations (`code` `23505`) during push token upsert as successful idempotent registration when reconciliation finds a safe canonical row—first by `expo_push_token`, then by active `(user_id, device_id)` when present—returning **200 OK** only when ownership matches the JWT subject.
todos:
  - id: push-23505-handler
    content: "In push.js: on upsert 23505, reconcile in order (token GET → device active GET); return 200 + already_registered when row is same user; preserve conflict otherwise"
    status: completed
  - id: push-tests
    content: "Add integration tests for all five cases (normal success; 23505+token same user; 23505+token other user; 23505+device fallback same user; 23505+no safe match)"
    status: completed
  - id: api-contract-push
    content: "Document reconciliation + response fields for POST /api/push/register in API_CONTRACT.md"
    status: completed
isProject: false
---

# Idempotent push registration on duplicate key (23505)

## Context

- Handler: [`apps/beerbook-api/routes/push.js`](apps/beerbook-api/routes/push.js) — `POST /api/push/register` upserts via PostgREST (`on_conflict=expo_push_token`, `Prefer: resolution=merge-duplicates`).
- PostgREST maps Postgres `unique_violation` to **HTTP 409** with JSON where **`code` is `"23505"`** (same pattern as [`apps/beerbook-api/routes/crews.js`](apps/beerbook-api/routes/crews.js) `parseRpcError`).
- Conflicts are **not** always on `expo_push_token`. The partial unique index [`uq_push_tokens_user_device_active`](apps/beerbook-api/supabase/migrations/20260331100000_push_tokens.sql) enforces at most one **active** row per `(user_id, device_id)` when `device_id IS NOT NULL`. Races between PATCH deactivation and INSERT can surface **23505** with a message about `(user_id, device_id)` while **no row exists yet** for the submitted `expo_push_token`—token-only reconciliation would false-negative idempotency.

## Behavior change

After the upsert `rest` call fails (`status >= 400`):

1. Parse the body. If **not** a unique violation (`String(code) !== '23505'`), keep current behavior (forward upstream status/body).
2. **Reconcile (ordered)** — reuse the **same `select=` projection** as the upsert for any successful `200` response:
   1. `GET /push_tokens?expo_push_token=eq.<token>&limit=1&select=...`
   2. If a row exists and **`user_id === req.claims.sub`** → **200** idempotent success (see response contract below).
   3. Else if **`device_id` is present** (submitted body, after normalization):
      - `GET /push_tokens?user_id=eq.<sub>&device_id=eq.<device_id>&is_active=eq.true&limit=1&select=...`
      - If a row exists (caller is already the owner via JWT) → **200** idempotent success.
   4. Else → **preserve conflict/error** (forward upstream response, or **409** with upstream body—same as today’s failure path).
3. **Ownership / safety**: The device fallback only queries **`user_id=req.claims.sub`**, so rows belonging to another user are never returned as success. If **step 2** finds a row for the token with **`user_id !== sub`**, do **not** return 200; preserve conflict/error (token bound to another account).
4. **Pathological**: **23505** but **no** row from either reconcile step → preserve conflict/error; log for observability.

## Response contract (idempotent success)

```json
{
  "registered": true,
  "already_registered": true,
  "token": { }
}
```

- Normal successful upsert (no conflict): **200** with `registered: true`, `token` set; **`already_registered` omitted or `false`** (implementation choice: omit is fine; tests should accept absent or false).

## Implementation notes

- Helper: `isPostgrestUniqueViolation(body)` — `code === '23505' || code === 23505`.
- **Single shared constant** for the `select=` list on POST and all GETs.
- **`device_id` null**: skip device fallback (only token path applies).

## Required tests

[`apps/beerbook-api/test/push-routes.integration.test.js`](apps/beerbook-api/test/push-routes.integration.test.js) — extend the REST mock to support `GET /push_tokens` with `expo_push_token`, `user_id`, `device_id`, and `is_active` filters as needed.

1. **Normal upsert success** → **200**; `already_registered` absent or false.
2. **23505** + token GET finds row, **same `user_id` as JWT** → **200**, `already_registered: true`.
3. **23505** + token GET finds row, **different `user_id`** → conflict preserved (e.g. **409**).
4. **23505** + **no** token row + **device** GET finds valid active row for **`user_id=sub` and submitted `device_id`** → **200**, `already_registered: true`.
5. **23505** + **no** safe reconcile match (no token row, no device row, or device not provided and token miss) → conflict preserved.

## Docs

- [`apps/beerbook-api/docs/API_CONTRACT.md`](apps/beerbook-api/docs/API_CONTRACT.md) — under **POST /api/push/register**: document `already_registered`, **23505** reconciliation order (token then device), and that cross-user token ownership still errors.

## Out of scope

- **`POST /api/auth/register`**: unchanged (Keycloak **409**, not this flow).
