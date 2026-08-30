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

  // Atomic appends via SQL — never rewrite the whole blob, so concurrent
  // staff saves cannot be clobbered by this webhook.
  if (donor) {
    const { data: ok, error: upErr } = await sb.rpc("append_donor_donation", {
      p_donor_id: donor.id,
      p_donation: donation,
    });
    if (upErr || !ok) return reply("שגיאה בשמירת התרומה");
  } else {
    // unknown caller — queue as a pending edit for manual assignment
    const { error: upErr } = await sb.rpc("append_pending_edit", {
      p_edit: {
        id: "PE" + Date.now() + Math.random().toString(36).slice(2, 6),
        donorId: null,
        edits: { _phoneDonation: { phone, ...donation } },
        ts: new Date().toISOString(),
        token: "yemot",
      },
    });
    if (upErr) return reply("שגיאה בשמירת התרומה");
  }

  return reply(`תודה רבה, התקבלה תרומה על סך ${amount} שקלים`);
});
