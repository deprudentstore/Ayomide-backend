const express = require('express');
const rateLimit = require('express-rate-limit');

const Newsletter = require('../models/Newsletter');
const Waitlist = require('../models/Waitlist');
const resolveStoreBySlug = require('../utils/resolveStore');
const sendEmail = require('../utils/sendEmail');

const router = express.Router();

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-ups from this device. Please try again shortly.' },
});

// GET /api/stores/:slug -> public store info (WhatsApp number, bank details,
// Paystack key) for checkout.html. No auth — every storefront needs this,
// and none of these fields are sensitive on their own.
router.get('/:slug', async (req, res) => {
  try {
    const storeDoc = await resolveStoreBySlug(req.params.slug);
    if (!storeDoc) return res.status(404).json({ error: `Store "${req.params.slug}" not found.` });

    return res.json({
      slug: storeDoc.slug,
      name: storeDoc.name,
      whatsappNumber: storeDoc.whatsappNumber,
      bankName: storeDoc.bankName,
      accountNumber: storeDoc.accountNumber,
      accountName: storeDoc.accountName,
      paystackPublicKey: storeDoc.paystackPublicKey,
    });
  } catch (err) {
    console.error('GET /api/stores/:slug error:', err);
    return res.status(500).json({ error: 'Failed to fetch store.' });
  }
});

// POST /api/stores/:slug/newsletter  { email }  -> used by mall.html
router.post('/:slug/newsletter', signupLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required.' });

    const storeDoc = await resolveStoreBySlug(req.params.slug);
    if (!storeDoc) return res.status(404).json({ error: `Store "${req.params.slug}" not found.` });

    let alreadySubscribed = false;
    try {
      await Newsletter.create({ email, storeSlug: storeDoc.slug });
    } catch (err) {
      if (err.code !== 11000) throw err; // duplicate = already subscribed, treat as success
      alreadySubscribed = true;
    }

    // Fire the welcome email but never let it block or fail the signup itself.
    if (!alreadySubscribed) {
      sendEmail({
        to: email,
        subject: `Welcome to ${storeDoc.name}! 📬`,
        html: `
          <div style="background-color:#0d0d0d;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;">
            <div style="max-width:480px;margin:0 auto;background-color:#151515;border:1px solid #C9973A;border-radius:8px;overflow:hidden;">
              <div style="padding:32px 28px 24px;text-align:center;border-bottom:1px solid #2a2a2a;">
                <h1 style="margin:0;color:#C9973A;font-size:22px;letter-spacing:1px;">DE PRUDENT</h1>
              </div>
              <div style="padding:28px;color:#e8e8e8;">
                <h2 style="margin:0 0 16px;color:#C9973A;font-size:20px;">Welcome to ${storeDoc.name}!</h2>
                <p style="margin:0 0 16px;line-height:1.6;color:#cfcfcf;">
                  Thanks for subscribing. You'll be the first to hear about new store-building tips, early access, and updates.
                </p>
                <div style="text-align:center;margin:28px 0 8px;">
                  <a href="https://deprudentportmall.netlify.app" style="display:inline-block;padding:12px 28px;background-color:#C9973A;color:#0d0d0d;text-decoration:none;font-weight:bold;border-radius:4px;letter-spacing:0.5px;">
                    Visit De Prudent
                  </a>
                </div>
              </div>
              <div style="padding:18px 28px;text-align:center;border-top:1px solid #2a2a2a;">
                <p style="margin:0;color:#777;font-size:12px;">— De Prudent</p>
              </div>
            </div>
          </div>
        `,
      }).catch(() => {}); // sendEmail already logs its own errors internally
    }

    return res.status(201).json({ message: 'Subscribed.' });
  } catch (err) {
    console.error('POST /api/stores/:slug/newsletter error:', err);
    return res.status(500).json({ error: 'Failed to subscribe.' });
  }
});

// POST /api/stores/:slug/waitlist  { email }  -> used by luxury.html
router.post('/:slug/waitlist', signupLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required.' });

    const storeDoc = await resolveStoreBySlug(req.params.slug);
    if (!storeDoc) return res.status(404).json({ error: `Store "${req.params.slug}" not found.` });

    let alreadyOnList = false;
    try {
      await Waitlist.create({ email, storeSlug: storeDoc.slug });
    } catch (err) {
      if (err.code !== 11000) throw err;
      alreadyOnList = true;
    }

    if (!alreadyOnList) {
      sendEmail({
        to: email,
        subject: `You're on the ${storeDoc.name} waitlist! ⏳`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
            <h2 style="color:#7C2333;">You're on the list!</h2>
            <p>We'll email you the moment ${storeDoc.name} is ready. Thanks for your patience.</p>
            <p style="margin-top:24px;">— De Prudent</p>
          </div>
        `,
      }).catch(() => {});
    }

    return res.status(201).json({ message: 'Joined waitlist.' });
  } catch (err) {
    console.error('POST /api/stores/:slug/waitlist error:', err);
    return res.status(500).json({ error: 'Failed to join waitlist.' });
  }
});

module.exports = router;
