import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { corsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";
import { getFeedbackAckHtml, getFeedbackAdminNotificationHtml } from "../_shared/templates.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const category = (body.category || "General").trim();
    const message = (body.message || "").trim();
    const email = (body.email || "").trim();
    const appVersion = (body.appVersion || "2.1.0").trim();

    if (!message || message.length < 10) {
      return new Response(
        JSON.stringify({ error: "Please write at least 10 characters for your feedback." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (email && (!email.includes("@") || !email.includes("."))) {
      return new Response(
        JSON.stringify({ error: "Please provide a valid email address or leave it blank." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    
    let dbInserted = false;
    let feedbackId = null;

    if (supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        // Optional user_id from auth header
        const authHeader = req.headers.get("Authorization");
        let userId: string | null = null;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
          userId = user?.id || null;
        }

        const { data, error } = await supabase
          .from("feedback")
          .insert({
            user_id: userId,
            email: email.length > 0 ? email : null,
            category: category,
            message: message,
            app_version: appVersion,
          })
          .select("id")
          .single();

        if (!error && data) {
          dbInserted = true;
          feedbackId = data.id;
        } else if (error) {
          console.warn("[Feedback] DB insert warning:", error.message);
        }
      } catch (dbErr) {
        console.warn("[Feedback] DB connection warning:", dbErr);
      }
    }

    // 1. Send Admin Notification Email via Resend
    const adminEmail = Deno.env.get("APP_FEEDBACK_EMAIL") || Deno.env.get("APP_SUPPORT_EMAIL");
    if (adminEmail) {
      const adminHtml = getFeedbackAdminNotificationHtml(category, message, email, appVersion);
      await sendEmail({
        to: adminEmail,
        subject: `[PDF24x7 Feedback] ${category}: ${message.slice(0, 40)}...`,
        html: adminHtml,
        replyTo: email.length > 0 ? email : undefined,
      });
    }

    // 2. Send User Acknowledgement Email via Resend if email was provided
    if (email && email.includes("@")) {
      const ackHtml = getFeedbackAckHtml(category, message.slice(0, 200));
      await sendEmail({
        to: email,
        subject: `We received your PDF24x7 feedback (${category})`,
        html: ackHtml,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Your feedback has been received. Thank you for helping us improve PDF24x7!",
        id: feedbackId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

