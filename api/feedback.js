// Vercel Serverless Function: POST /api/feedback
// Securely dispatches user feedback to support via Resend without exposing secrets in client code.

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Only POST requests are supported.',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { category, message, email, appVersion } = body;

    // 1. Input Validation & Abuse Protection
    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Message must be at least 10 characters long.',
      });
    }

    if (message.length > 3000) {
      return res.status(400).json({
        success: false,
        error: 'Message exceeds maximum length of 3000 characters.',
      });
    }

    const cleanCategory = (typeof category === 'string' ? category.trim() : 'General Feedback').slice(0, 50);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmail = typeof email === 'string' && email.trim() ? email.trim() : null;
    if (cleanEmail && (!emailRegex.test(cleanEmail) || cleanEmail.length > 255)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address provided.',
      });
    }

    // 2. Check Resend API configuration
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey || resendApiKey.startsWith('re_YOUR') || resendApiKey === '') {
      return res.status(503).json({
        success: false,
        configured: false,
        error: 'Feedback delivery service is not configured yet. Please configure RESEND_API_KEY in your environment variables.',
      });
    }

    const toEmail = process.env.FEEDBACK_TO_EMAIL || 'support@pdf24x7.com';
    const fromEmail = process.env.FEEDBACK_FROM_EMAIL || 'PDF24x7 Feedback <onboarding@resend.dev>';

    // 3. Dispatch Email via Resend API
    const textContent = [
      `Category: ${cleanCategory}`,
      `From: ${cleanEmail || 'Anonymous'}`,
      `App Version: ${appVersion || 'Unknown'}`,
      `Timestamp: ${new Date().toISOString()}`,
      '',
      '--- Message ---',
      message.trim(),
    ].join('\n');

    const payload = {
      from: fromEmail,
      to: [toEmail],
      subject: `[PDF24x7 Feedback] ${cleanCategory}`,
      text: textContent,
      reply_to: cleanEmail || undefined,
    };

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      return res.status(resendResponse.status).json({
        success: false,
        error: resendData.message || 'Failed to dispatch email via Resend.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Feedback received successfully. Thank you for helping improve PDF24x7!',
      id: resendData.id,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Server error: ${err.message || 'Unknown error'}`,
    });
  }
}

