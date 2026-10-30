/**
 * Secure Server-Side Resend Email Service for Supabase Edge Functions
 */

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
  unconfigured?: boolean;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const fromEmail = options.fromEmail || Deno.env.get("RESEND_FROM_EMAIL") || "noreply@pdf24x7.com";
  const fromName = options.fromName || Deno.env.get("RESEND_FROM_NAME") || "PDF24x7";

  if (!apiKey || apiKey.includes("YOUR_RESEND") || apiKey.trim() === "") {
    console.warn("[Resend] RESEND_API_KEY is not configured. Email dispatch skipped safely.");
    return {
      success: false,
      unconfigured: true,
      error: "Resend API key is not configured on the server.",
    };
  }

  const payload = {
    from: `${fromName} <${fromEmail}>`,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html: options.html,
    ...(options.replyTo ? { reply_to: options.replyTo } : {}),
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.ok) {
      return { success: true, id: data.id };
    } else {
      console.error("[Resend] API Error:", data);
      return { success: false, error: data.message || `Resend error ${res.status}` };
    }
  } catch (err) {
    console.error("[Resend] Network Exception:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

