# PDF24x7 – Supabase & Resend Complete Setup Guide

This guide explains how to configure **Supabase Authentication**, **Database Row Level Security (RLS)**, and **Resend Email Integration** for PDF24x7.

All client-side screens, network engines, database migrations, Edge Functions, and responsive HTML email templates are **fully prepared and ready for production**.

---

## 1. Credentials Checklist: Where Each Key Belongs

| Credential | Where to Enter | Exposure Level |
| :--- | :--- | :--- |
| **`SUPABASE_URL`** | `.env` or `local.properties` | Public / Safe in Android Client |
| **`SUPABASE_PUBLISHABLE_KEY`** | `.env` or `local.properties` | Public / Safe in Android Client |
| **`GOOGLE_CLIENT_ID`** (Web Client ID) | `.env` or `local.properties` | Public / Safe in Android Client |
| **`GOOGLE_CLIENT_SECRET`** | **Supabase Dashboard ONLY** | **CONFIDENTIAL (Server-Side Only)** |
| **`RESEND_API_KEY`** | **Supabase Secrets ONLY** | **CONFIDENTIAL (Server-Side Only)** |
| **`RESEND_FROM_EMAIL`** | **Supabase Secrets ONLY** | Server-Side Only |
| **`APP_FEEDBACK_EMAIL`** | **Supabase Secrets ONLY** | Server-Side (Admin Inbox) |
| **`APP_SUPPORT_EMAIL`** | `.env` & Supabase Secrets | Client-Safe Support Contact |

---

## 2. Step-by-Step Setup Guide

### Step 1: Supabase Project & API Keys
1. Create a project at [supabase.com](https://supabase.com).
2. Go to **Project Settings** (bottom left gear icon) $\rightarrow$ **API**.
3. Copy **Project URL** $\rightarrow$ set as `SUPABASE_URL` in `.env`.
4. Copy **Project API Keys $\rightarrow$ `anon` `public`** $\rightarrow$ set as `SUPABASE_PUBLISHABLE_KEY` in `.env`.

---

### Step 2: Supabase URL Configuration (Deep Links)
1. Go to **Authentication** $\rightarrow$ **URL Configuration**.
2. Set **Site URL** to:
   ```
   com.pandu78.pdf24x7://auth-callback
   ```
3. Under **Redirect URLs**, add:
   ```
   com.pandu78.pdf24x7://auth-callback
   ```
4. Click **Save**.

---

### Step 3: Google Sign-In Setup

#### In Google Cloud Console:
1. Open [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials).
2. Click **Create Credentials** $\rightarrow$ **OAuth client ID**.
3. Choose **Web application** as application type.
4. Under **Authorized redirect URIs**, enter:
   ```
   https://<your-supabase-project-id>.supabase.co/auth/v1/callback
   ```
5. Click **Create** and copy both the **Client ID** and **Client Secret**.

#### In Supabase Dashboard:
1. Go to **Authentication** $\rightarrow$ **Providers** $\rightarrow$ **Google**.
2. Toggle **Enable**.
3. Paste the **Client ID** and **Client Secret**.
4. Click **Save**.

#### In PDF24x7 App Configuration:
Set your Google Web Client ID in `.env`:
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

---

### Step 4: Resend Email Integration

1. Sign up at [resend.com](https://resend.com) and create an API Key at [resend.com/api-keys](https://resend.com/api-keys).
2. Verify your sending domain (e.g. `pdf24x7.com`) in Resend Domains, or use `onboarding@resend.dev` for testing.
3. Configure the secrets in Supabase via the CLI:
   ```bash
   npx supabase secrets set \
     RESEND_API_KEY="re_your_api_key_here" \
     RESEND_FROM_EMAIL="noreply@yourdomain.com" \
     RESEND_FROM_NAME="PDF24x7" \
     APP_FEEDBACK_EMAIL="admin@yourdomain.com" \
     APP_SUPPORT_EMAIL="support@yourdomain.com"
   ```

---

### Step 5: Database Migration (Feedback Table & RLS)

Run the included database migration to create the `feedback` table and Row Level Security policies:

```bash
npx supabase db push
```

Or copy the SQL from [`supabase/migrations/20261030000000_create_feedback.sql`](file:///c:/Users/medur/Documents/PDF24x7/supabase/migrations/20261030000000_create_feedback.sql) and run it in the **Supabase Dashboard $\rightarrow$ SQL Editor**.

#### Row Level Security Policies Applied:
- **Insert**: Allowed for all users (authenticated and anonymous feedback).
- **Select**: Users can strictly only read their own feedback records (`auth.uid() = user_id`).
- **Admin**: Service role has full access to query all feedback.

---

### Step 6: Deploy Edge Functions

Deploy the server-side email dispatch and feedback processing functions:

```bash
# 1. Feedback submission, DB insertion & email alerts
npx supabase functions deploy submit-feedback --no-verify-jwt

# 2. Welcome email dispatcher
npx supabase functions deploy send-welcome-email --no-verify-jwt

# 3. Dedicated admin feedback notifier
npx supabase functions deploy notify-admin-feedback --no-verify-jwt
```

---

### Step 7: Supabase Auth Email Templates (Optional Customization)

PDF24x7 includes customized HTML templates ready to paste into the Supabase Dashboard under **Authentication $\rightarrow$ Email Templates**:

1. **Password Reset**: Copy from [`supabase/email-templates/supabase_reset_password.html`](file:///c:/Users/medur/Documents/PDF24x7/supabase/email-templates/supabase_reset_password.html).
2. **Account Confirmation**: Copy from [`supabase/email-templates/supabase_confirmation.html`](file:///c:/Users/medur/Documents/PDF24x7/supabase/email-templates/supabase_confirmation.html).

---

## 3. How to Test the Integration

1. **Email & Password Authentication**:
   - Register a new account on the Welcome screen.
   - Accept the legal checkboxes and submit.
   - The app signs in and transitions directly to the main Home screen.
   - An automated welcome email is dispatched to the user.
2. **Google Sign-In**:
   - Tap **Continue with Google**.
   - Select your Google account in the Google Play dialog.
   - The app verifies your ID token against Supabase and opens the Home screen.
3. **Password Recovery**:
   - Tap **Forgot password?** on the sign-in screen.
   - Enter your email and submit. Check your email for the recovery link with deep-link redirect.
4. **In-App Feedback**:
   - Open **Settings $\rightarrow$ Send Feedback**.
   - Choose a category (Bug Report, Feature Request, PDF Issue, General).
   - Enter your message (min 10 characters) and tap **Send Feedback**.
   - The message is stored in the Supabase `feedback` table, an acknowledgement email is sent to the user, and an alert is delivered to the admin inbox.
