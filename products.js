const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const resolveStoreBySlug = require('../utils/resolveStore');

const router = express.Router();

// GET /api/products?store=mall&category=shoes  -> all products for a store
router.get('/', async (req, res) => {
  try {
    const { store, category } = req.query;
    if (!store) {
      return res.status(400).json({ error: 'Query param "store" (slug) is required.' });
    }

    const storeDoc = await resolveStoreBySlug(store);
    if (!storeDoc) {
      return res.status(404).json({ error: `Store "${store}" not found.` });
    }

    const filter = { storeId: storeDoc._id };
    if (category) filter.category = category;

    const products = await Product.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(products);
  } catch (err) {
    console.error('GET /api/products error:', err);
    return res.status(500).json({ error: 'Failed to fetch products.' });
  }
});

// GET /api/products/:id -> single product
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid product id.' });
    }
    const product = await Product.findById(id).lean();
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    return res.json(product);
  } catch (err) {
    console.error('GET /api/products/:id error:', err);
    return res.status(500).json({ error: 'Failed to fetch product.' });
  }
});

module.exports = router;
