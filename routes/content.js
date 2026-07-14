const express = require('express');
const SiteContent = require('../models/SiteContent');

const router = express.Router();

// GET /api/content/:page -> the editable content doc for that page, or null
// if nothing's been saved yet (frontend falls back to its own defaults).
router.get('/:page', async (req, res) => {
  try {
    const content = await SiteContent.findOne({ page: req.params.page.toLowerCase() }).lean();
    return res.json(content || null);
  } catch (err) {
    console.error('GET /api/content/:page error:', err);
    return res.status(500).json({ error: 'Failed to fetch content.' });
  }
});

module.exports = router;
