# T3.9c — H2H tab-grant fix

**Date:** 2026-04-09
**Type:** Code change + documentation migration (no schema change)
**Status:** PENDING REVIEW — not applied, not committed

---

## 1. CHECK constraint recon

| Table | Column | CHECK constraint? | Needs h2h_award? |
|---|---|---|---|
| `tabs_ledger` | `event_type` | **None** (plain text, unconstrained) | No change needed |
| `tab_notifications` | `notification_type` | **Yes** (enumerates 12 types) | **No** — H2H completion returns tabs_earned in the API response directly; no async notification sent |

**Conclusion:** No schema changes required. The migration file is documentation-only.

## 2. Multiplier pattern recon

Source: `server.js:1783-1786`

```javascript
amount: Math.round(c.base * newBeerMultiplier * tierMultiplier * seederMultiplier)
```

Multipliers are applied **per-component** via `Math.round()`, then components are summed. For h2h_award there is only one "component" (the flat base), so the equivalent is:

```javascript
final_amount = Math.round(base_amount * tierMultiplier * seederMultiplier)
```

No `newBeerMultiplier` for H2H (not a rating).

**How multiplier values are obtained:**

1. `ensureUserTabsProfile(rest, sub, ...)` → returns profile row with `current_tier` and `is_seeder`
2. `getTierMultiplier(rest, profile.current_tier)` → queries `tier_requirements` table → returns `{ multiplier: N }`
3. `seederMultiplier = profile.is_seeder ? 1.5 : 1.0`

Both functions are already imported in `server.js:11-13`.

## 3. Migration SQL

File: `supabase/migrations/20260409022217_hardening_h2h_award_event_type.sql`

```sql
-- T3.9c: Add h2h_award event type support to tabs economy.
--
-- tabs_ledger.event_type has NO CHECK constraint (plain text column).
-- No schema change required — h2h_award rows can be inserted immediately.
--
-- tab_notifications.notification_type has a CHECK constraint but does not
-- need h2h_award — the completion response returns tabs_earned directly
-- to the client; no async notification is sent.
--
-- tabs_ledger_after_insert trigger handles h2h_award automatically.
--
-- This migration is intentionally empty (documentation only).

SELECT 1;
```

## 4. Code diff: lib/headToHead.js

**Before (line 8):**
```javascript
const HEAD_TO_HEAD_REWARD_TABS = Number(process.env.HEAD_TO_HEAD_REWARD_TABS) || 2;
```

**After:**
```javascript
const HEAD_TO_HEAD_REWARD_TABS = Number(process.env.HEAD_TO_HEAD_REWARD_TABS) || 10;
```

Single line change. This affects new prompt creation — `prompt.reward_tabs` is set at creation time from this constant. Existing prompts (none exist) would keep their original value.

## 5. Code diff: server.js complete handler

**Before (lines 2177-2186):**
```javascript
  await rest('PATCH', `/head_to_head_prompts?id=eq.${encodeURIComponent(promptId)}`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed' }),
  });
  const rewardTabs = prompt.reward_tabs ?? 0;
  return res.status(200).json({
    success: true,
    reward_tabs: rewardTabs,
    tabs_earned: rewardTabs,
  });
```

**After:**
```javascript
  await rest('PATCH', `/head_to_head_prompts?id=eq.${encodeURIComponent(promptId)}`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed' }),
  });

  // Grant h2h_award tabs via ledger (trigger maintains profiles.tabs_balance
  // and user_tabs_profile.lifetime_tabs_earned automatically).
  const baseReward = Number(prompt.reward_tabs) || 0;
  let tabsEarned = 0;
  if (baseReward > 0) {
    try {
      const profile = await ensureUserTabsProfile(rest, sub, {});
      const tierInfo = await getTierMultiplier(rest, profile.current_tier);
      const tierMult = Number(tierInfo.multiplier) || 1.0;
      const seederMult = profile.is_seeder ? 1.5 : 1.0;
      const finalAmount = Math.round(baseReward * tierMult * seederMult);

      const ledgerRes = await rest('POST', '/tabs_ledger', {
        body: JSON.stringify({
          event_id: prompt.id,
          user_id: sub,
          event_type: 'h2h_award',
          amount: finalAmount,
          breakdown: {
            base: baseReward,
            tier_multiplier: tierMult,
            seeder_multiplier: seederMult,
            prompt_id: prompt.id,
            winner_beer_id: winnerBeerId,
            loser_beer_id: loserBeerId,
          },
          context: {
            prompt_id: prompt.id,
            winner_rating_id: wid,
            loser_rating_id: loserRatingId,
          },
        }),
      });
      if (ledgerRes.status < 400) {
        tabsEarned = finalAmount;
      } else if (ledgerRes.body?.code === '23505') {
        // Idempotent: prompt already granted (duplicate event_id)
        tabsEarned = finalAmount;
      } else {
        console.error('h2h_award ledger insert failed:', ledgerRes.status, ledgerRes.body);
      }
    } catch (err) {
      console.error('h2h_award tab grant failed (non-blocking):', err?.message || err);
    }
  }

  return res.status(200).json({
    success: true,
    reward_tabs: tabsEarned,
    tabs_earned: tabsEarned,
  });
```

**Key design decisions in the code:**

- `event_id: prompt.id` — uses the prompt UUID as the idempotency key. Completing the same prompt twice won't double-grant (unique constraint `tabs_ledger_event_id_key`).
- On `23505` (unique violation), we still report `tabsEarned = finalAmount` since the grant already happened.
- On any other ledger failure, we log the error but still return success for the H2H completion itself (Elo updates and results are already persisted). `tabs_earned: 0` signals to the client that the tab grant failed.
- `reward_tabs` and `tabs_earned` in the response are now the **final post-multiplier amount**, not the base. This is the actual amount the user received.

## 6. Trigger behavior confirmation

The `tabs_ledger_after_insert` trigger (updated in T3.7) is event_type-agnostic:

```sql
BEGIN
  UPDATE public.profiles
  SET tabs_balance = tabs_balance + NEW.amount
  WHERE id = NEW.user_id;

  IF NEW.amount > 0 THEN
    INSERT INTO public.user_tabs_profile (user_id, lifetime_tabs_earned)
    VALUES (NEW.user_id, NEW.amount)
    ON CONFLICT (user_id) DO UPDATE
    SET lifetime_tabs_earned = user_tabs_profile.lifetime_tabs_earned + NEW.amount,
        updated_at = now();
  END IF;

  RETURN NEW;
END;
```

**Confirmed:** An `h2h_award` ledger insert with a positive amount will automatically:
1. Increment `profiles.tabs_balance` by `amount`
2. Increment `user_tabs_profile.lifetime_tabs_earned` by `amount`

No additional handler code needed.

## 7. Idempotency confirmation

- `event_id = prompt.id` (uuid)
- `tabs_ledger_event_id_key` UNIQUE constraint on `event_id`
- Completing the same prompt twice → second INSERT gets `23505` unique violation → handler catches it and returns the same `tabsEarned` value
- The prompt status check (`if (prompt.status !== 'pending')`) at line 2141 provides a first layer of idempotency — already-completed prompts short-circuit before reaching the ledger insert

## 8. Open questions / concerns

1. **The `ensureUserTabsProfile` call does a profile fetch + possible week_start advance.** This adds 1-2 DB roundtrips to the complete handler. For a low-frequency action (H2H completions), this is acceptable. If H2H volume grows significantly, consider caching the tier/seeder values on the prompt row at creation time.

2. **The prompt.reward_tabs column has DEFAULT 0** but `createPromptAndBuildPayload` writes `HEAD_TO_HEAD_REWARD_TABS` (now 10) at creation time. Any prompts created after the code change but before container rebuild will still have `reward_tabs = 2` (old default from running code). This is a non-issue since zero prompts currently exist and the rebuild will happen before any new prompts are created.

3. **The `winnerBeerId` and `loserBeerId` variables** are in scope at the point of the new code (defined at lines 2154-2155), so the breakdown can reference them without any restructuring.

4. **Weekly cap interaction:** The `award_rating_tabs_with_cap` RPC counts `WHERE event_type = 'rating_award'`. H2H awards use `event_type = 'h2h_award'`, so they are naturally exempt from the weekly cap. This is per the locked decision.
