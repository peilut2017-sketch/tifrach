// ════════════════════════════════════════════════════════════════
// Edge Function: self-service
// Unauthenticated donor forms, validated SERVER-SIDE.
// Because app_state is locked behind RLS (authenticated only), the public
// pages cannot touch the DB directly — they call this function, which uses
// the service-role key and only ever APPENDS a pending request via the
// atomic SQL helper (migration 0002); staff approve it inside the app.
//
// POST body:
//   { action: "get",      donorId, token }              -> limited donor fields + affiliation options
//   { action: "submit",   donorId, token, edits:{...} } -> queues pendingEdit for that donor
//   { action: "info" }                                  -> affiliation options (public add form)
//   { action: "register", edits:{...}, website:"" }     -> queues a NEW-donor request
// ════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// fields a donor may read/edit about themselves
const TEXT_FIELDS = ["firstName", "lastName", "address", "entrance", "zip", "phone", "mobile", "email",
                     "marriageYear", "marriageMonth", "cohort", "notes"];
const MAX_LEN: Record<string, number> = { notes: 1000, address: 200 };
const DEFAULT_AFFILS = ["תלמיד", "בוגר", "הורה תלמיד", "הורה בוגר", "סבא תלמיד", "סבא בוגר", "מכר", "עסקי", "אחר"];

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

function cleanEdits(edits: any, affilOptions: string[]) {
  const clean: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) {
    if (edits && typeof edits[f] === "string") clean[f] = edits[f].trim().slice(0, MAX_LEN[f] ?? 120);
  }
  if (edits && Array.isArray(edits.affils)) {
    const allowed = new Set(affilOptions);
    clean.affils = edits.affils
      .filter((a: unknown) => typeof a === "string" && allowed.has(a as string))
      .slice(0, 8);
  }
  return clean;
}

function newId(prefix: string) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { action, donorId, token, edits } = payload || {};
  if (!action) return json({ error: "missing action" }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // load the app blob (read-only here; writes go through the atomic RPCs)
  const { data: row, error } = await sb
    .from("app_state").select("data").eq("id", "main").single();
  if (error || !row) return json({ error: "state unavailable" }, 500);

  const DB = row.data || {};
  const affilOptions: string[] = (DB.settings && Array.isArray(DB.settings.affiliations) && DB.settings.affiliations.length)
    ? DB.settings.affiliations : DEFAULT_AFFILS;

  // ── public add-donor form ──
  if (action === "info") return json({ affiliations: affilOptions });

  if (action === "register") {
    // honeypot: bots fill the hidden "website" field → pretend success
    if (typeof payload.website === "string" && payload.website.trim()) return json({ ok: true });
    const clean = cleanEdits(edits, affilOptions);
    if (!clean.firstName && !clean.lastName) return json({ error: "name required" }, 400);
    if (!clean.phone && !clean.mobile && !clean.email) return json({ error: "contact required" }, 400);
    // soft flood guard: never let the queue grow without bound
    if (Array.isArray(DB.pendingEdits) && DB.pendingEdits.length >= 500) return json({ error: "queue full" }, 429);
    const { error: upErr } = await sb.rpc("append_pending_edit", {
      p_edit: {
        id: newId("PE"),
        donorId: null,
        edits: { _newDonor: clean },
        ts: new Date().toISOString(),
        token: "public-add",
      },
    });
    if (upErr) return json({ error: "save failed" }, 500);
    return json({ ok: true });
  }

  // ── token-protected self edit ──
  if (!donorId || !token) return json({ error: "missing params" }, 400);
  const tokens = DB.selfServiceTokens || {};
  if (typeof donorId !== "string" || !Object.prototype.hasOwnProperty.call(tokens, donorId) || tokens[donorId] !== token) {
    return json({ error: "invalid token" }, 403);
  }
  const donor = (DB.donors || []).find((d: any) => d.id === donorId);
  if (!donor) return json({ error: "donor not found" }, 404);

  if (action === "get") {
    const out: Record<string, unknown> = {};
    for (const f of TEXT_FIELDS) out[f] = donor[f] ?? "";
    out.affils = Array.isArray(donor.affils) ? donor.affils
      : String(donor.affil || "").split(/[,;|]/).map((x: string) => x.trim()).filter(Boolean);
    out._name = [donor.title, donor.firstName, donor.lastName].filter(Boolean).join(" ");
    return json({ donor: out, affiliations: affilOptions });
  }

  if (action === "submit") {
    const clean = cleanEdits(edits, affilOptions);
    // Atomic append via SQL — never rewrites the whole blob, so concurrent
    // staff saves can no longer be clobbered by this function.
    const { error: upErr } = await sb.rpc("append_pending_edit", {
      p_edit: {
        id: newId("PE"),
        donorId,
        edits: clean,
        ts: new Date().toISOString(),
        token,
      },
    });
    if (upErr) return json({ error: "save failed" }, 500);
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
});
