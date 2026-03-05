/**
 * BeerBook process-event Engine
 * Handles: rating_award (weekly cap), cheers_given/received, rating_submitted (achievement eval).
 * Idempotency: event_id on tabs_ledger; achievements: only mint if user_achievements INSERT actually inserted a row.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

export type EventType =
  | "rating_award"
  | "cheers_given"
  | "cheers_received"
  | "rating_submitted"
  | "achievement_unlock"
  | "admin_grant"
  | "spend";

export interface ProcessEventInput {
  eventType: EventType;
  eventId: string | null; // BFF-generated UUID for ledger idempotency; null for rating_submitted (achievement-eval only)
  payload: Record<string, unknown>;
  userId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}

export interface UnlockedAchievement {
  key: string;
  name: string;
  reward_tabs: number;
}

export interface ProcessEventResult {
  unlocked: UnlockedAchievement[];
  tabs_delta: number;
  tabs_balance: number;
}

const VALID_EVENT_TYPES: EventType[] = [
  "rating_award",
  "cheers_given",
  "cheers_received",
  "rating_submitted",
  "achievement_unlock",
  "admin_grant",
  "spend",
];

/** Monday 00:00 UTC for the current week (ISO string for created_at filter). */
function getCurrentWeekStartUtc(): string {
  const d = new Date();
  const utcDay = d.getUTCDay();
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Count rating_award rows in tabs_ledger for user in current week (Monday 00:00 UTC).
 */
async function countRatingAwardsThisWeek(
  admin: ReturnType<typeof createClient>,
  userId: string
): Promise<number> {
  const weekStart = getCurrentWeekStartUtc();
  const { count, error } = await admin
    .from("tabs_ledger")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "rating_award")
    .gte("created_at", weekStart);
  if (error) return 999;
  return count ?? 0;
}

/**
 * Rating award: enforce weekly cap (10), then insert one ledger row. Idempotent by event_id.
 */
async function processRatingAward(
  admin: ReturnType<typeof createClient>,
  userId: string,
  eventId: string,
  payload: Record<string, unknown>
): Promise<{ amount: number }> {
  const breakdown = (payload.breakdown as Record<string, number>) ?? {};
  const context = (payload.context as Record<string, unknown>) ?? {};
  const amount = Number(payload.amount ?? 0);
  if (!Number.isInteger(amount) || amount < 0) return { amount: 0 };

  // Weekly cap: only first 10 rating_award events per week earn tabs (Monday 00:00 UTC)
  const count = await countRatingAwardsThisWeek(admin, userId);
  if (count >= 10) return { amount: 0 };

  const { error } = await admin.from("tabs_ledger").insert({
    event_id: eventId,
    user_id: userId,
    event_type: "rating_award",
    amount,
    breakdown: breakdown,
    context: context,
  });
  if (error?.code === "23505") return { amount: 0 }; // event_id conflict = already processed
  if (error) throw new Error(`tabs_ledger insert: ${error.message}`);
  return { amount };
}

/**
 * Cheers or single-row award: insert one ledger row. Idempotent by event_id.
 * For cheers_received, ledgerUserId is the receiver (payload.target_user_id); context holds from_user_id/to_user_id.
 */
async function processSingleAward(
  admin: ReturnType<typeof createClient>,
  ledgerUserId: string,
  eventId: string,
  eventType: "cheers_given" | "cheers_received" | "admin_grant",
  payload: Record<string, unknown>,
  contextOverride?: Record<string, unknown>
): Promise<number> {
  const amount = Number(payload.amount ?? 0);
  if (!Number.isInteger(amount)) return 0;
  const breakdown = (payload.breakdown as Record<string, unknown>) ?? {};
  const context = contextOverride ?? (payload.context as Record<string, unknown>) ?? {};
  const { error } = await admin.from("tabs_ledger").insert({
    event_id: eventId,
    user_id: ledgerUserId,
    event_type: eventType,
    amount,
    breakdown: breakdown,
    context: context,
  });
  if (error?.code === "23505") return 0;
  if (error) throw new Error(`tabs_ledger insert: ${error.message}`);
  return amount;
}

/**
 * Load achievements for trigger_type (e.g. rating_submitted).
 */
async function loadAchievementsForTrigger(
  admin: ReturnType<typeof createClient>,
  triggerType: string
): Promise<
  Array<{ id: string; key: string; name: string; reward_tabs: number; subtype: string; rules: Record<string, unknown> }>
> {
  const { data, error } = await admin
    .from("achievements")
    .select("id, key, name, reward_tabs, subtype, rules")
    .eq("trigger_type", triggerType)
    .eq("active", true);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    reward_tabs: r.reward_tabs ?? 0,
    subtype: r.subtype,
    rules: (r.rules as Record<string, unknown>) ?? {},
  }));
}

async function grantAchievementCosmetics(
  admin: ReturnType<typeof createClient>,
  userId: string,
  achievementKey: string
): Promise<void> {
  if (!achievementKey) return;
  const { data, error } = await admin
    .from("cosmetics")
    .select("id")
    .eq("achievement_key", achievementKey)
    .eq("active", true)
    .in("unlock_type", ["achievement", "both"]);
  if (error) return;
  const rows = Array.isArray(data) ? data : [];
  for (const row of rows) {
    if (!row?.id) continue;
    const { error: insertError } = await admin
      .from("user_cosmetics")
      .insert({
        user_id: userId,
        cosmetic_id: row.id,
        acquired_via: "achievement",
      });
    if (insertError?.code === "23505") continue;
  }
}

async function getCheckinCount(admin: ReturnType<typeof createClient>, userId: string): Promise<number> {
  const { count, error } = await admin
    .from("ratings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return 0;
  return count ?? 0;
}

async function evaluateCheckinCount(
  admin: ReturnType<typeof createClient>,
  userId: string,
  _payload: Record<string, unknown>,
  rules: Record<string, unknown>
): Promise<boolean> {
  const minCheckins = Number(rules.min_checkins);
  if (!Number.isInteger(minCheckins) || minCheckins < 0) return false;
  const count = await getCheckinCount(admin, userId);
  return count >= minCheckins;
}

function evaluateTimeWindowCheckin(
  _admin: ReturnType<typeof createClient>,
  _userId: string,
  payload: Record<string, unknown>,
  rules: Record<string, unknown>
): boolean {
  const checkinTime = payload.checkin_time as string | undefined;
  const start = rules.start as string | undefined;
  const end = rules.end as string | undefined;
  if (!checkinTime || !start || !end) return false;
  const [h, m] = String(checkinTime).split(":").map(Number);
  const [startH, startM] = String(start).split(":").map(Number);
  const [endH, endM] = String(end).split(":").map(Number);
  const mins = (h ?? 0) * 60 + (m ?? 0);
  const startMins = (startH ?? 0) * 60 + (startM ?? 0);
  const endMins = (endH ?? 0) * 60 + (endM ?? 0);
  if (startMins <= endMins) return mins >= startMins && mins <= endMins;
  return mins >= startMins || mins <= endMins;
}

async function evaluateStub(): Promise<boolean> {
  return false;
}

const EVALUATORS: Record<
  string,
  (
    admin: ReturnType<typeof createClient>,
    userId: string,
    payload: Record<string, unknown>,
    rules: Record<string, unknown>
  ) => Promise<boolean>
> = {
  checkin_count: evaluateCheckinCount,
  time_window_checkin: (_, __, p, r) => Promise.resolve(evaluateTimeWindowCheckin(null as any, "", p, r)),
};

async function evaluate(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: Record<string, unknown>,
  subtype: string,
  rules: Record<string, unknown>
): Promise<boolean> {
  const fn = EVALUATORS[subtype];
  if (fn) return fn(admin, userId, payload, rules);
  return evaluateStub();
}

/**
 * rating_submitted: evaluate achievements. Only mint ledger if user_achievements INSERT actually inserted (ON CONFLICT DO NOTHING; mint only when no conflict).
 */
async function processRatingSubmitted(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: Record<string, unknown>
): Promise<{ unlocked: UnlockedAchievement[]; tabsDelta: number }> {
  const unlocked: UnlockedAchievement[] = [];
  let tabsDelta = 0;
  const achievements = await loadAchievementsForTrigger(admin, "rating_submitted");
  for (const ach of achievements) {
    const passed = await evaluate(admin, userId, payload, ach.subtype, ach.rules);
    if (!passed) continue;

    // INSERT: only mint if this insert actually added a row (no conflict). On PK conflict we get 23505.
    const { error: insertError } = await admin.from("user_achievements").insert({
      user_id: userId,
      achievement_id: ach.id,
      progress: {},
      context: payload,
    });

    if (insertError?.code === "23505") continue; // already unlocked
    if (insertError) throw new Error(`user_achievements insert: ${insertError.message}`);

    // No error = row was inserted; mint tabs for this achievement only.
    {
      unlocked.push({ key: ach.key, name: ach.name, reward_tabs: ach.reward_tabs });
      await grantAchievementCosmetics(admin, userId, ach.key);
      if (ach.reward_tabs > 0) {
        const eventId = crypto.randomUUID();
        const { error: ledgerError } = await admin.from("tabs_ledger").insert({
          event_id: eventId,
          user_id: userId,
          event_type: "achievement_unlock",
          amount: ach.reward_tabs,
          breakdown: {},
          context: { achievement_key: ach.key, ...payload },
        });
        if (!ledgerError) tabsDelta += ach.reward_tabs;
      }
    }
  }
  return { unlocked, tabsDelta };
}

async function getTabsBalance(admin: ReturnType<typeof createClient>, userId: string): Promise<number> {
  const { data } = await admin.from("profiles").select("tabs_balance").eq("id", userId).maybeSingle();
  return data?.tabs_balance ?? 0;
}

/**
 * Main entry: route by event_type; enforce event_id for ledger events; on event_id conflict return zero delta.
 * For cheers_received ONLY: require payload.target_user_id (receiver); ledger row is for receiver; return receiver's balance.
 * Other event types: ignore target_user_id; ledger user = JWT sub.
 */
export async function processEvent(input: ProcessEventInput): Promise<ProcessEventResult> {
  const { eventType, eventId, payload, userId, supabaseUrl, serviceRoleKey } = input;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let tabsDelta = 0;
  let unlocked: UnlockedAchievement[] = [];
  /** User whose balance we return (ledger row owner for award events). */
  let balanceUserId = userId;

  if (eventType === "rating_award") {
    if (!eventId) throw new Error("event_id required for rating_award");
    const result = await processRatingAward(admin, userId, eventId, payload);
    tabsDelta = result.amount;
  } else if (eventType === "cheers_received") {
    if (!eventId) throw new Error("event_id required for cheers_received");
    const target = payload.target_user_id;
    if (typeof target !== "string" || !target.trim()) {
      throw new Error("payload.target_user_id (Keycloak sub of receiver) is required for cheers_received");
    }
    const ledgerUserId = target.trim();
    balanceUserId = ledgerUserId;
    const context: Record<string, unknown> = {
      from_user_id: userId,
      to_user_id: ledgerUserId,
      ...((payload.context as Record<string, unknown>) ?? {}),
    };
    tabsDelta = await processSingleAward(admin, ledgerUserId, eventId, eventType, payload, context);
  } else if (eventType === "cheers_given" || eventType === "admin_grant") {
    if (!eventId) throw new Error(`event_id required for ${eventType}`);
    // Ignore target_user_id for non-cheers_received; ledger user = JWT sub
    const context =
      eventType === "cheers_given"
        ? { from_user_id: userId, to_user_id: payload.to_user_id ?? null, ...((payload.context as Record<string, unknown>) ?? {}) }
        : undefined;
    tabsDelta = await processSingleAward(admin, userId, eventId, eventType, payload, context);
  } else if (eventType === "rating_submitted") {
    const result = await processRatingSubmitted(admin, userId, payload);
    unlocked = result.unlocked;
    tabsDelta = result.tabsDelta;
  } else if (eventType === "achievement_unlock" || eventType === "spend") {
    // Stub or handle as needed
  }

  const tabs_balance = await getTabsBalance(admin, balanceUserId);
  return { unlocked, tabs_delta: tabsDelta, tabs_balance };
}

export { VALID_EVENT_TYPES };
