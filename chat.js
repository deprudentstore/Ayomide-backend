// netlify/functions/chat.js
//
// This function runs on Netlify's servers, never in the visitor's browser.
// It receives a message from the chat widget, calls the Anthropic API using
// a secret key stored in Netlify's environment variables, and returns the
// reply. The API key is NEVER exposed to the browser at any point.

const SYSTEM_PROMPT = `You are the De Prudent Store Designer assistant, embedded on the company's portfolio site (deprudentportmall.netlify.app).

De Prudent Store Designer, run by Rasheed Ayomide, builds custom online stores for global clients using Firebase, Supabase, Appwrite, Directus, or Backendless (no monthly fees), standard Shopify, or Headless Shopify. Stores are typically delivered within 48 hours. Pricing: store builds $49-$499, monthly management from $15/mo, SEO setup $49-$129, Google Ads management $75-$150/mo.

Live demos on the site: a general store (Mall), a Nigerian restaurant (Abeni), a luxury boutique (MARQUE), and a Headless Shopify build (Kern) — all publicly accessible at /mall, /restaurant, /luxury, and /headless-shopify.

Contact: WhatsApp +234 916 230 6809, email deprudentstoredesigner@gmail.com.

Keep answers short (2-4 sentences), friendly, and specific to store-building, SEO, or e-commerce questions. If asked something unrelated to the business, politely redirect to what De Prudent offers. Always end by inviting the visitor to continue on WhatsApp for anything requiring a human.`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let userMessage;
  try {
    const parsed = JSON.parse(event.body || '{}');
    userMessage = (parsed.message || '').toString().trim();
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!userMessage) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Message is required' }) };
  }
  if (userMessage.length > 800) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Message too long' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return { statusCode: 502, body: JSON.stringify({ error: 'Assistant is temporarily unavailable' }) };
    }

    const data = await response.json();
    const reply = data.content?.find(block => block.type === 'text')?.text || "Sorry, I couldn't process that — try WhatsApp instead.";

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error('Function error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Something went wrong' }) };
  }
};
