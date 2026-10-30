import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";
import { getWelcomeEmailHtml } from "../_shared/templates.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    // Handle both direct invocation { email: "..." } and Supabase auth webhook { record: { email: "..." } }
    const email = body.email || body.record?.email;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "A valid email address is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const appSupportEmail = Deno.env.get("APP_SUPPORT_EMAIL") || "support@pdf24x7.com";
    const html = getWelcomeEmailHtml(email, appSupportEmail);

    const result = await sendEmail({
      to: email,
      subject: "Welcome to PDF24x7 – Your On-Device PDF Suite",
      html: html,
    });

    if (result.unconfigured) {
      return new Response(
        JSON.stringify({
          success: true,
          warning: "Resend API key is not configured on the backend yet. Email was not sent.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error || "Failed to send welcome email." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Welcome email sent successfully." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

