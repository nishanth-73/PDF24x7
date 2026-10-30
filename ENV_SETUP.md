# PDF24x7 – Environment & Secret Configuration Guide (`ENV_SETUP.md`)

This guide explains how to configure environment variables for **PDF24x7** across the Android client, Supabase backend, and Resend email service.

---

## 1. Environment Variable Reference

The project uses a centralized `.env` file (copied from `.env.example`). Below is the exact list of variables and where each one operates:

```env
# SUPABASE CONFIGURATION
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=

# GOOGLE OAUTH CONFIGURATION
GOOGLE_CLIENT_ID=

# RESEND EMAIL CONFIGURATION
RESEND_API_KEY=
RESEND_FROM_EMAIL=
RESEND_FROM_NAME=PDF24x7

# APP CONFIGURATION
APP_NAME=PDF24x7
APP_SUPPORT_EMAIL=
APP_FEEDBACK_EMAIL=
APP_WEBSITE_URL=
```

---

## 2. Detailed Breakdown & Scope

| Variable | Where Used | Client / Server | Description & Source |
| :--- | :--- | :--- | :--- |
| **`SUPABASE_URL`** | Android App & Edge Functions | **Client-Safe** | Your Supabase project URL (e.g. `https://xyz.supabase.co`). Found in Supabase Dashboard $\rightarrow$ Project Settings $\rightarrow$ API. |
| **`SUPABASE_PUBLISHABLE_KEY`** | Android App & Edge Functions | **Client-Safe** | The public `anon` API key. Safe in client apps because it is strictly bounded by Row Level Security (RLS). |
| **`GOOGLE_CLIENT_ID`** | Android App & Supabase Auth | **Client-Safe** | Google Cloud OAuth 2.0 Web Client ID. Used for Android native Google Sign-In and Supabase OAuth exchange. |
| **`RESEND_API_KEY`** | **Supabase Edge Functions ONLY** | **CONFIDENTIAL (Server-Only)** | API key from [Resend](https://resend.com/api-keys). **NEVER expose in the Android APK or client code.** |
| **`RESEND_FROM_EMAIL`** | Supabase Edge Functions | Server-Side | Verified sender email address in Resend (e.g. `noreply@pdf24x7.com` or `onboarding@resend.dev` for testing). |
| **`RESEND_FROM_NAME`** | Supabase Edge Functions | Server-Side | Sender display name shown in email inboxes (defaults to `PDF24x7`). |
| **`APP_NAME`** | Android App & Emails | Client / Server | The product name (`PDF24x7`). |
| **`APP_SUPPORT_EMAIL`** | Android App & Emails | Client-Safe | User-facing support address (e.g. `support@pdf24x7.com`). Displayed in footers and fallback email buttons. |
| **`APP_FEEDBACK_EMAIL`** | **Supabase Edge Functions ONLY** | Server-Side | Internal administrator inbox where user feedback and bug reports are automatically delivered. |
| **`APP_WEBSITE_URL`** | Android App & Emails | Client-Safe | Official web address (e.g. `https://pdf24x7.com`). |

---

## 3. Security Rules & Guardrails

> [!CAUTION]
> **Never include confidential secrets in Android client builds:**
> 1. `RESEND_API_KEY`: Must **ONLY** be deployed to Supabase Edge Function secrets. It allows sending emails from your domain and must never be placed inside the client app.
> 2. `GOOGLE_CLIENT_SECRET`: Configured **ONLY** in the Supabase Dashboard under *Authentication $\rightarrow$ Providers $\rightarrow$ Google*. Never in the mobile app.
> 3. `SUPABASE_SERVICE_ROLE_KEY`: Bypasses all Row Level Security. Only use in server-side scripts or Supabase Edge Functions.

---

## 4. How the Android Client Loads Configuration

The Gradle build script ([`app/build.gradle.kts`](file:///c:/Users/medur/Documents/PDF24x7/app/build.gradle.kts)) resolves configuration in the following order:
1. System environment variables (e.g. CI/CD pipelines).
2. The root `.env` file.
3. Your local `local.properties` file.
4. Fallback safe defaults.

Values are compiled into `BuildConfig` fields and consumed via [`SupabaseConfig.kt`](file:///c:/Users/medur/Documents/PDF24x7/app/src/main/java/com/pandu78/PDF24x7/auth/SupabaseConfig.kt):
- `BuildConfig.SUPABASE_URL`
- `BuildConfig.SUPABASE_PUBLISHABLE_KEY`
- `BuildConfig.GOOGLE_CLIENT_ID`

---

## 5. Setting Up Supabase Edge Functions & Resend

When you are ready to deploy your backend functions, use the Supabase CLI:

### Step 1: Install & Link Supabase CLI
```bash
# Login to Supabase
npx supabase login

# Link your local project to your cloud project
npx supabase link --project-ref your-project-id
```

### Step 2: Push Database Migration (Feedback Table & RLS)
```bash
npx supabase db push
```
*(This creates the `feedback` table with Row Level Security policies from `supabase/migrations/20261030000000_create_feedback.sql`).*

### Step 3: Set Backend Secrets
Push your server-only secrets directly to Supabase:
```bash
npx supabase secrets set \
  RESEND_API_KEY="re_123456789_abcdef" \
  RESEND_FROM_EMAIL="noreply@yourdomain.com" \
  RESEND_FROM_NAME="PDF24x7" \
  APP_FEEDBACK_EMAIL="admin@yourdomain.com" \
  APP_SUPPORT_EMAIL="support@yourdomain.com"
```

### Step 4: Deploy Edge Functions
Deploy the three Edge Functions:
```bash
# 1. Welcome email dispatcher
npx supabase functions deploy send-welcome-email --no-verify-jwt

# 2. In-app feedback submission & email processor
npx supabase functions deploy submit-feedback --no-verify-jwt

# 3. Admin feedback notifier
npx supabase functions deploy notify-admin-feedback --no-verify-jwt
```

---

## 6. Testing the Integration Without Real Keys

- When `.env` contains empty placeholders, the app gracefully detects this via `SupabaseConfig.isConfigured = false`.
- The authentication screen provides informative messages without crashing or assuming fake successes.
- The feedback form allows users to test the UI and provides an *"Open Email App Instead"* fallback button when the backend is offline.

