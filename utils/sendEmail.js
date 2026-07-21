/**
 * Minimal email sender using Brevo's (formerly Sendinblue) transactional
 * email HTTP API — https://developers.brevo.com/reference/sendtransacemail
 * Uses Node's built-in fetch, no extra npm package needed.
 *
 * Requires two env vars:
 *   BREVO_API_KEY   — from Brevo dashboard > SMTP & API > API Keys
 *   FROM_EMAIL      — sender address, e.g. "De Prudent <hello@yourdomain.com>".
 *                      Must be a sender/domain you've verified in Brevo.
 *   FROM_NAME       — optional display name, defaults to "De Prudent"
 *
 * If BREVO_API_KEY isn't set, this silently no-ops (logs a note) so
 * newsletter/waitlist signups still succeed even before email is configured.
 */
async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'hello@deprudentportmall.netlify.app';
  const fromName = process.env.FROM_NAME || 'De Prudent';

  if (!apiKey) {
    console.log(`[sendEmail] BREVO_API_KEY not set — skipping email to ${to}`);
    return { skipped: true };
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[sendEmail] Brevo API error ${res.status}: ${body}`);
      return { error: true };
    }

    return { sent: true };
  } catch (err) {
    console.error('[sendEmail] Failed to send:', err.message);
    return { error: true };
  }
}

module.exports = sendEmail;
