// ════════════════════════════════════════════════════════════════
// Edge Function: yemot-ivr  (OPTIONAL — phone donations via Yemot HaMashiach)
// Webhook called by the Yemot IVR system. Server-to-server, no user JWT.
// This is a STARTER you should adapt to your exact IVR call flow.
//
// Yemot calls this URL with query params (ApiPhone, ApiExtension, and any
// values you collect in the IVR). Here we look up a donor by phone and
// append a donation to the app blob, then return a Yemot "read" response.
// Docs: https://f2.freeivr.co.il/post/1094  (Yemot API)
// ════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Optional shared secret: set YEMOT_WEBHOOK_SECRET and pass ?secret=... from Yemot.
const WEBHOOK_SECRET = Deno.env.get("YEMOT_WEBHOOK_SECRET") ?? "";

function normPhone(p: string) { return (p || "").replace(/\D/g, "").replace(/^972/, "0"); }

// Compare-and-swap write of the whole blob after `mutate` — used only when the
// atomic SQL helpers from migration 0002 are unavailable. The update lands only
// if nobody saved in between (updated_at unchanged), otherwise re-read + retry,
// so a concurrent staff save is never clobbered.
async function casWrite(sb: any, mutate: (data: any) => boolean): Promise<string | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row, error: rErr } = await sb
      .from("app_state").select("data,updated_at").eq("id", "main").single();
    if (rErr || !row) return "read failed: " + (rErr?.message || "no row");
    const data = JSON.parse(JSON.stringify(row.data || {}));
    if (!mutate(data)) return "target not found";
    const { data: upd, error: uErr } = await sb
      .from("app_state").update({ data })
      .eq("id", "main").eq("updated_at", row.updated_at)
      .select("updated_at");
    if (uErr) return "write failed: " + uErr.message;
    if (upd && upd.length) return null;
    await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
  }
  return "write contention";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams;

  if (WEBHOOK_SECRET && q.get("secret") !== WEBHOOK_SECRET) {
    return new Response("id_list_message=t-שגיאת אבטחה", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const phone = normPhone(q.get("ApiPhone") || q.get("phone") || "");
  const amount = parseFloat(q.get("amount") || q.get("Amount") || "0");

  const reply = (text: string) =>
    new Response("id_list_message=t-" + text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  if (!phone || !(amount > 0)) return reply("לא התקבלו פרטי תרומה תקינים");

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: row, error } = await sb
    .from("app_state").select("data").eq("id", "main").single();
  if (error || !row) return reply("שגיאת מערכת, נסו מאוחר יותר");

  const DB = row.data || {};
  const donor = (DB.donors || []).find((d: any) =>
    normPhone(d.phone) === phone || normPhone(d.mobile) === phone);

  const activeCamp = (DB.campaigns || []).find((c: any) => c.active);
  const donation = {
    // stable id — required by the client's multi-user merge engine
    id: "dn" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    amount,
    date: new Date().toISOString().slice(0, 10),
    method: "טלפון (ימות)",
    campaignId: activeCamp?.id || "",
    notes: "תרומה טלפונית דרך ימות המשיח",
  };

  // Atomic appends via SQL (migration 0002) — never rewrite the whole blob, so
  // concurrent staff saves cannot be clobbered. If the helpers are missing,
  // fall back to a compare-and-swap write (same guarantee, more round-trips).
  if (donor) {
    const { data: ok, error: upErr } = await sb.rpc("append_donor_donation", {
      p_donor_id: donor.id,
      p_donation: donation,
    });
    if (upErr) {
      console.warn("append_donor_donation RPC failed → CAS fallback:", upErr.code, upErr.message);
      const fail = await casWrite(sb, (data) => {
        const d = (data.donors || []).find((x: any) => x.id === donor.id);
        if (!d) return false;
        d.donations = Array.isArray(d.donations) ? d.donations : [];
        d.donations.push(donation);
        return true;
      });
      if (fail) { console.error("donation save failed:", fail); return reply("שגיאה בשמירת התרומה"); }
    } else if (!ok) return reply("שגיאה בשמירת התרומה");
  } else {
    // unknown caller — queue as a pending edit for manual assignment
    const edit = {
      id: "PE" + Date.now() + Math.random().toString(36).slice(2, 6),
      donorId: null,
      edits: { _phoneDonation: { phone, ...donation } },
      ts: new Date().toISOString(),
      token: "yemot",
    };
    const { error: upErr } = await sb.rpc("append_pending_edit", { p_edit: edit });
    if (upErr) {
      console.warn("append_pending_edit RPC failed → CAS fallback:", upErr.code, upErr.message);
      const fail = await casWrite(sb, (data) => {
        data.pendingEdits = Array.isArray(data.pendingEdits) ? data.pendingEdits : [];
        data.pendingEdits.push(edit);
        return true;
      });
      if (fail) { console.error("pending save failed:", fail); return reply("שגיאה בשמירת התרומה"); }
    }
  }

  return reply(`תודה רבה, התקבלה תרומה על סך ${amount} שקלים`);
});
