/**
 * BeerBook process-event Edge Function
 * Keycloak JWT required. User id = payload.sub. Evaluates achievements and mints Tabs for new unlocks.
 * Idempotent: safe to call multiple times for the same event.
 */

import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";
import {
  processEvent,
  VALID_EVENT_TYPES,
  type EventType,
} from "./engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KEYCLOAK_ISSUER = Deno.env.get("KEYCLOAK_ISSUER") ?? "https://auth.drinksafterwork.net/realms/daw";
const KEYCLOAK_JWKS_URI = Deno.env.get("KEYCLOAK_JWKS_URI") ?? "https://auth.drinksafterwork.net/realms/daw/protocol/openid-connect/certs";
const CLOCK_SKEW = Number(Deno.env.get("TOKEN_CLOCK_SKEW_SECONDS")) || 30;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(KEYCLOAK_JWKS_URI));
  return jwks;
}

/** Verify Keycloak JWT and return sub (user id). */
async function getKeycloakUserId(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: KEYCLOAK_ISSUER,
      clockTolerance: CLOCK_SKEW,
    });
    const aud = payload.aud;
    const azp = payload.azp;
    const audOk =
      aud === "beerbook" ||
      aud === "beerbook-mobile" ||
      (Array.isArray(aud) && (aud.includes("beerbook") || aud.includes("beerbook-mobile")));
    if (!audOk) return null;
    const azpOk = azp === "beerbook" || azp === "beerbook-mobile";
    if (!azpOk) return null;
    const sub = payload.sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const token = authHeader.slice(7);
  const userId = await getKeycloakUserId(token);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let body: { event_type?: string; event_id?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const eventType = body.event_type as string | undefined;
  const eventId = body.event_id as string | undefined;
  const payload = (body.payload ?? {}) as Record<string, unknown>;

  if (
    !eventType ||
    !VALID_EVENT_TYPES.includes(eventType as EventType)
  ) {
    return new Response(
      JSON.stringify({
        error: "Invalid event_type",
        valid_types: VALID_EVENT_TYPES,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const requiresEventId = ["rating_award", "cheers_given", "cheers_received", "admin_grant"].includes(eventType);
  if (requiresEventId && (!eventId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId))) {
    return new Response(
      JSON.stringify({ error: "event_id (UUID) required for " + eventType }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const result = await processEvent({
      eventType: eventType as EventType,
      eventId: requiresEventId ? eventId! : null,
      payload,
      userId,
      supabaseUrl,
      serviceRoleKey,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
