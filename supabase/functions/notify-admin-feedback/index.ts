import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";
import { getFeedbackAdminNotificationHtml } from "../_shared/templates.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const record = body.record || body;

    const category = record.category || "General";
    const message = record.message || "";
    const email = record.email || "";
    const appVersion = record.app_version || "2.1.0";
    const createdAt = record.created_at || new Date().toUTCString();

    const adminEmail = Deno.env.get("APP_FEEDBACK_EMAIL") || Deno.env.get("APP_SUPPORT_EMAIL");

    if (!adminEmail) {
      return new Response(
        JSON.stringify({ warning: "APP_FEEDBACK_EMAIL is not set. Admin notification skipped." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = getFeedbackAdminNotificationHtml(category, message, email, appVersion, createdAt);

    const result = await sendEmail({
      to: adminEmail,
      subject: `[PDF24x7 Feedback] ${category}`,
      html: html,
      replyTo: email.length > 0 ? email : undefined,
    });

    return new Response(
      JSON.stringify({ success: result.success, id: result.id, error: result.error }),
      { status: result.success ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

