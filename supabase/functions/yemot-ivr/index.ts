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
    amount,
    date: new Date().toISOString().slice(0, 10),
    method: "טלפון (ימות)",
    campaignId: activeCamp?.id || "",
    notes: "תרומה טלפונית דרך ימות המשיח",
  };

  if (donor) {
    if (!donor.donations) donor.donations = [];
    donor.donations.push(donation);
  } else {
    // unknown caller — record as a pending/unassigned donation on a stub
    if (!DB.pendingEdits) DB.pendingEdits = [];
    DB.pendingEdits.push({
      id: "PE" + Date.now(),
      donorId: null,
      edits: { _phoneDonation: { phone, ...donation } },
      ts: new Date().toISOString(),
      token: "yemot",
    });
  }

  const { error: upErr } = await sb.from("app_state").update({ data: DB }).eq("id", "main");
  if (upErr) return reply("שגיאה בשמירת התרומה");

  return reply(`תודה רבה, התקבלה תרומה על סך ${amount} שקלים`);
});
