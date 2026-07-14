const express = require('express');
const rateLimit = require('express-rate-limit');
const Order = require('../models/Order');
const resolveStoreBySlug = require('../utils/resolveStore');

const router = express.Router();

// Basic abuse protection on the public order-creation endpoint.
const createOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 orders per IP per 15 min is plenty for a real customer, not a script
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many orders submitted from this device. Please try again shortly.' },
});

// POST /api/orders  -> create a new order
router.post('/', createOrderLimiter, async (req, res) => {
  try {
    const { storeId, storeSlug, customer, items, total } = req.body;

    // Accept either a raw storeId (ObjectId) or a slug ("mall") for convenience,
    // since the storefronts only know their own slug.
    let resolvedStoreId = storeId;
    if (!resolvedStoreId && storeSlug) {
      const storeDoc = await resolveStoreBySlug(storeSlug);
      if (!storeDoc) return res.status(404).json({ error: `Store "${storeSlug}" not found.` });
      resolvedStoreId = storeDoc._id;
    }

    if (!resolvedStoreId) {
      return res.status(400).json({ error: '"storeId" or "storeSlug" is required.' });
    }
    if (!customer || !customer.name || !customer.phone) {
      return res.status(400).json({ error: 'customer.name and customer.phone are required.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array.' });
    }

    // Recompute total server-side so a tampered client request can't
    // under-charge or send a mismatched total.
    const serverTotal = items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);

    const order = await Order.create({
      storeId: resolvedStoreId,
      customer,
      items,
      total: typeof total === 'number' ? total : serverTotal,
      status: 'pending',
    });

    return res.status(201).json(order);
  } catch (err) {
    console.error('POST /api/orders error:', err);
    return res.status(500).json({ error: 'Failed to create order.' });
  }
});

// GET /api/orders?store=mall  -> lightweight public listing (no PII)
// This is intentionally trimmed: it's a public, unauthenticated endpoint,
// so it never returns customer phone/address/email. Use the admin
// endpoint (GET /api/admin/orders) for the full record.
router.get('/', async (req, res) => {
  try {
    const { store } = req.query;
    if (!store) return res.status(400).json({ error: 'Query param "store" (slug) is required.' });

    const storeDoc = await resolveStoreBySlug(store);
    if (!storeDoc) return res.status(404).json({ error: `Store "${store}" not found.` });

    const orders = await Order.find({ storeId: storeDoc._id })
      .select('items total status createdAt')
      .sort({ createdAt: -1 })
      .lean();

    return res.json(orders);
  } catch (err) {
    console.error('GET /api/orders error:', err);
    return res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

module.exports = router;
