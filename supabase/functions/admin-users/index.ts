// ════════════════════════════════════════════════════════════════
// Edge Function: admin-users
// Lets a SUPERADMIN create Supabase Auth accounts from inside the app
// (פאנל ניהול → משתמשים) instead of the Supabase Dashboard.
//
// Security: verify_jwt = true (config.toml) — the caller must be a signed-in
// user. On top of that we look the caller's email up in the app's user list
// and require role === "superadmin" before touching the Auth admin API.
//
// POST body: { action: "create", email, password, displayName? }
// ════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // 1. who is calling? (JWT from the app's Supabase session)
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: me, error: meErr } = await asUser.auth.getUser();
  if (meErr || !me?.user?.email) return json({ error: "unauthorized" }, 401);
  const callerEmail = me.user.email.toLowerCase();

  // 2. is the caller a superadmin in the app's user list?
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: row, error } = await admin.from("app_state").select("data").eq("id", "main").single();
  if (error || !row) return json({ error: "state unavailable" }, 500);
  const users: any[] = (row.data && row.data.users) || [];
  const profile = users.find((u) => String(u.email || u.username || "").toLowerCase() === callerEmail);
  if (!profile || profile.role !== "superadmin") return json({ error: "forbidden" }, 403);

  // 3. do the work
  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { action } = payload || {};

  if (action === "create") {
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const displayName = String(payload.displayName || "").slice(0, 80);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "invalid email" }, 400);
    if (password.length < 8) return json({ error: "password too short" }, 400);
    const { data, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { displayName, createdBy: callerEmail },
    });
    if (cErr) return json({ error: cErr.message }, 400);
    return json({ ok: true, id: data.user?.id });
  }

  return json({ error: "unknown action" }, 400);
});
