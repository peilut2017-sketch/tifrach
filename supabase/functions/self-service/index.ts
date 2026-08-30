// ════════════════════════════════════════════════════════════════
// Edge Function: self-service
// Unauthenticated donor self-edit portal, validated SERVER-SIDE.
// Because app_state is locked behind RLS (authenticated only), the
// public self-service page cannot touch the DB directly — it calls this
// function, which uses the service-role key and validates the per-donor
// token before returning limited fields or queueing a pending edit.
//
// POST body:
//   { action: "get",    donorId, token }              -> limited donor fields
//   { action: "submit", donorId, token, edits:{...} } -> queues pendingEdit
// ════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// only these fields may be read/edited by a donor
const ALLOWED = ["firstName", "lastName", "address", "phone", "mobile", "email"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const { action, donorId, token, edits } = payload || {};
  if (!action || !donorId || !token) return json({ error: "missing params" }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // load the app blob
  const { data: row, error } = await sb
    .from("app_state").select("data").eq("id", "main").single();
  if (error || !row) return json({ error: "state unavailable" }, 500);

  const DB = row.data || {};
  const tokens = DB.selfServiceTokens || {};

  // validate token (constant-ish comparison)
  if (tokens[donorId] !== token) return json({ error: "invalid token" }, 403);

  const donor = (DB.donors || []).find((d: any) => d.id === donorId);
  if (!donor) return json({ error: "donor not found" }, 404);

  if (action === "get") {
    const out: Record<string, string> = {};
    for (const f of ALLOWED) out[f] = donor[f] ?? "";
    out["_name"] = [donor.title, donor.firstName, donor.lastName].filter(Boolean).join(" ");
    return json({ donor: out });
  }

  if (action === "submit") {
    const clean: Record<string, string> = {};
    for (const f of ALLOWED) {
      if (edits && typeof edits[f] === "string") clean[f] = edits[f].slice(0, 200);
    }
    if (!DB.pendingEdits) DB.pendingEdits = [];
    DB.pendingEdits.push({
      id: "PE" + Date.now(),
      donorId,
      edits: clean,
      ts: new Date().toISOString(),
      token,
    });
    const { error: upErr } = await sb
      .from("app_state").update({ data: DB }).eq("id", "main");
    if (upErr) return json({ error: "save failed" }, 500);
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
});
