/**
 * Minimal email sender using Resend's HTTP API (https://resend.com).
 * Uses Node's built-in fetch — no extra npm package needed.
 *
 * Requires two env vars:
 *   RESEND_API_KEY  — from resend.com dashboard (free tier: 100 emails/day)
 *   FROM_EMAIL      — sender address, e.g. "De Prudent <hello@yourdomain.com>"
 *                      or Resend's shared test sender "onboarding@resend.dev"
 *                      while you haven't verified your own domain yet.
 *
 * If RESEND_API_KEY isn't set, this silently no-ops (logs a note) so
 * newsletter/waitlist signups still succeed even before email is configured.
 */
async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || 'De Prudent <onboarding@resend.dev>';

  if (!apiKey) {
    console.log(`[sendEmail] RESEND_API_KEY not set — skipping email to ${to}`);
    return { skipped: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[sendEmail] Resend API error ${res.status}: ${body}`);
      return { error: true };
    }

    return { sent: true };
  } catch (err) {
    console.error('[sendEmail] Failed to send:', err.message);
    return { error: true };
  }
}

module.exports = sendEmail;
