/**
 * Professional, Responsive Branded HTML Email Templates for PDF24x7
 * Color Tokens:
 * - Brand Blue: #0572EC
 * - Brand Dark: #0D1627
 * - Neutral Gray: #F5F6F8
 * - Border Gray: #E5E7EB
 * - Muted Ink: #4B5563
 */

const LOGO_SVG = `
<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="24" fill="#0572EC"/>
  <rect x="13" y="11" width="22" height="26" rx="4" fill="#FFFFFF"/>
  <path d="M17 17H25M17 22H31M17 27H27M17 32H23" stroke="#0572EC" stroke-width="2" stroke-linecap="round"/>
</svg>
`;

function layout(title: string, bodyContent: string, supportEmail: string = "support@pdf24x7.com"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #F5F6F8;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1F2937;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #F5F6F8;
      padding: 40px 16px;
    }
    .card {
      max-width: 580px;
      margin: 0 auto;
      background-color: #FFFFFF;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
      border: 1px solid #E5E7EB;
    }
    .header {
      padding: 32px 32px 24px;
      text-align: center;
      background-color: #FFFFFF;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 700;
      color: #0572EC;
      margin-top: 12px;
      letter-spacing: -0.3px;
    }
    .content {
      padding: 0 32px 32px;
      line-height: 1.6;
      font-size: 15px;
      color: #374151;
    }
    .btn {
      display: inline-block;
      background-color: #0572EC;
      color: #FFFFFF !important;
      padding: 13px 28px;
      border-radius: 9999px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      margin: 20px 0;
    }
    .feature-box {
      background-color: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      padding: 18px 20px;
      margin: 20px 0;
    }
    .feature-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .feature-item:last-child {
      margin-bottom: 0;
    }
    .feature-icon {
      color: #0572EC;
      font-size: 16px;
      font-weight: bold;
      margin-right: 10px;
      line-height: 1.4;
    }
    .footer {
      padding: 24px 32px;
      background-color: #F9FAFB;
      border-top: 1px solid #E5E7EB;
      text-align: center;
      font-size: 12px;
      color: #6B7280;
      line-height: 1.5;
    }
    .footer a {
      color: #0572EC;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        ${LOGO_SVG}
        <div class="brand-title">PDF24x7</div>
      </div>
      <div class="content">
        ${bodyContent}
      </div>
      <div class="footer">
        <p>PDF24x7 — Fast, Private On-Device PDF Utilities</p>
        <p>Questions or need help? Contact <a href="mailto:${supportEmail}">${supportEmail}</a></p>
        <p style="margin-top: 8px; color: #9CA3AF;">© ${new Date().getFullYear()} PDF24x7. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── 1. Welcome Email ─────────────────────────────────────────────────────────

export function getWelcomeEmailHtml(email: string, appSupportEmail: string = "support@pdf24x7.com"): string {
  const content = `
    <h1 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 16px; text-align: center;">Welcome to PDF24x7!</h1>
    <p>Hi there,</p>
    <p>Thank you for creating an account with <strong>PDF24x7</strong>. You're all set to take complete control of your PDF documents with fast, offline-first tools built right into your phone.</p>
    
    <div class="feature-box">
      <div style="font-weight: 600; color: #1E293B; margin-bottom: 12px;">What makes PDF24x7 different:</div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="24" valign="top" style="color: #0572EC; font-size: 16px; font-weight: bold;">✓</td>
          <td style="padding-bottom: 8px; font-size: 14px; color: #475569;"><strong>100% Local & Private:</strong> All operations (merge, split, compress, watermark, protect, OCR) run directly on your device.</td>
        </tr>
        <tr>
          <td width="24" valign="top" style="color: #0572EC; font-size: 16px; font-weight: bold;">✓</td>
          <td style="padding-bottom: 8px; font-size: 14px; color: #475569;"><strong>No Connection Required:</strong> Use your tools anywhere, anytime, even in airplane mode.</td>
        </tr>
        <tr>
          <td width="24" valign="top" style="color: #0572EC; font-size: 16px; font-weight: bold;">✓</td>
          <td style="font-size: 14px; color: #475569;"><strong>Optional Cloud Backup:</strong> Sync your saved files securely with your own Google Drive whenever you choose.</td>
        </tr>
      </table>
    </div>

    <p>Your account (<code>${email}</code>) gives you access to upcoming cloud synchronization and preference syncing.</p>

    <p style="margin-top: 24px;">If you ever have any suggestions, feature ideas, or feedback, simply open the app's <strong>Settings &gt; Send Feedback</strong> or reply directly to this email.</p>
    
    <p style="margin-top: 24px; color: #111827;">Best regards,<br><strong>The PDF24x7 Team</strong></p>
  `;
  return layout("Welcome to PDF24x7", content, appSupportEmail);
}

// ── 2. Feedback Acknowledgement Email (To User) ──────────────────────────────

export function getFeedbackAckHtml(
  category: string,
  messageExcerpt: string,
  appSupportEmail: string = "support@pdf24x7.com"
): string {
  const content = `
    <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 16px; text-align: center;">We Received Your Feedback</h1>
    <p>Hello,</p>
    <p>Thank you for reaching out to us. We have successfully received your submission for <strong>${category}</strong>.</p>
    
    <div style="background-color: #F8FAFC; border-left: 4px solid #0572EC; padding: 14px 18px; border-radius: 4px; margin: 18px 0; font-size: 14px; color: #334155; font-style: italic;">
      "${escapeHtml(messageExcerpt)}"
    </div>

    <p>Our engineering and product team reviews every report and feature request to make PDF24x7 better and more reliable with every update. If additional information is needed regarding your submission, our team will reply to this thread.</p>

    <p style="margin-top: 24px; color: #111827;">Warm regards,<br><strong>The PDF24x7 Team</strong></p>
  `;
  return layout("Feedback Received - PDF24x7", content, appSupportEmail);
}

// ── 3. Feedback Notification Email (To Administrator) ─────────────────────────

export function getFeedbackAdminNotificationHtml(
  category: string,
  message: string,
  userEmail: string,
  appVersion: string,
  submissionDate: string = new Date().toUTCString()
): string {
  const content = `
    <h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 16px;">New In-App Feedback Received</h1>
    
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px; font-size: 14px; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 8px 0; color: #64748B; font-weight: 600; width: 140px;">Category:</td>
        <td style="padding: 8px 0; color: #0F172A; font-weight: bold;">${escapeHtml(category)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 8px 0; color: #64748B; font-weight: 600;">User Contact:</td>
        <td style="padding: 8px 0; color: #0F172A;">${escapeHtml(userEmail || "Anonymous / Unspecified")}</td>
      </tr>
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 8px 0; color: #64748B; font-weight: 600;">App Version:</td>
        <td style="padding: 8px 0; color: #0F172A;">${escapeHtml(appVersion || "2.1.0")} (Android)</td>
      </tr>
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 8px 0; color: #64748B; font-weight: 600;">Received At:</td>
        <td style="padding: 8px 0; color: #0F172A;">${submissionDate}</td>
      </tr>
    </table>

    <div style="font-weight: 600; color: #1E293B; margin-bottom: 8px;">Message Content:</div>
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 16px; border-radius: 8px; font-size: 14px; color: #1E293B; line-height: 1.6; white-space: pre-wrap;">
${escapeHtml(message)}
    </div>
  `;
  return layout(`[Feedback] ${category}`, content);
}

// ── 4. Supabase Auth Custom Email Templates ──────────────────────────────────

export function getSupabaseResetPasswordTemplate(): string {
  return layout(
    "Reset Your PDF24x7 Password",
    `
    <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 16px; text-align: center;">Reset Your Password</h1>
    <p>Hi there,</p>
    <p>We received a request to reset the password for your PDF24x7 account. Click the button below to choose a new password:</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="{{ .ConfirmationURL }}" class="btn">Reset Password</a>
    </div>
    <p style="font-size: 13px; color: #6B7280;">If the button above does not work, copy and paste this link into your browser:<br>
    <span style="word-break: break-all; color: #0572EC;">{{ .ConfirmationURL }}</span></p>
    <p style="font-size: 13px; color: #9CA3AF; margin-top: 24px;">If you did not request a password reset, you can safely ignore this email. Your current password remains secure.</p>
    `
  );
}

export function getSupabaseConfirmationTemplate(): string {
  return layout(
    "Confirm Your PDF24x7 Email",
    `
    <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 16px; text-align: center;">Confirm Your Email</h1>
    <p>Welcome to PDF24x7!</p>
    <p>Please confirm your email address by tapping the button below:</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="{{ .ConfirmationURL }}" class="btn">Confirm Email Address</a>
    </div>
    <p style="font-size: 13px; color: #6B7280;">If the button above does not work, open this link directly:<br>
    <span style="word-break: break-all; color: #0572EC;">{{ .ConfirmationURL }}</span></p>
    `
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

