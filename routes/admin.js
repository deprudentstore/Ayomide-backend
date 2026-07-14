const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const Admin = require('../models/Admin');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Newsletter = require('../models/Newsletter');
const Waitlist = require('../models/Waitlist');
const auth = require('../middleware/auth');
const resolveStoreBySlug = require('../utils/resolveStore');

const router = express.Router();

// Slow down brute-force login attempts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait a few minutes and try again.' },
});

/* ------------------------------------------------------------------ */
/*  AUTH                                                               */
/* ------------------------------------------------------------------ */

// POST /api/admin/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    // Same generic error whether the email doesn't exist or the password is
    // wrong, so we don't leak which admin accounts exist.
    if (!admin) return res.status(401).json({ error: 'Invalid email or password.' });

    const match = await admin.comparePassword(password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = jwt.sign(
      {
        id: admin._id,
        email: admin.email,
        role: admin.role,
        storeAccess: admin.storeAccess,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      admin: { id: admin._id, email: admin.email, role: admin.role, storeAccess: admin.storeAccess },
    });
  } catch (err) {
    console.error('POST /api/admin/login error:', err);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

// GET /api/admin/me -> confirms the token is valid and returns the admin's identity.
// Handy for the dashboard to check "am I still logged in?" on page load.
router.get('/me', auth, (req, res) => {
  res.json({ admin: req.user });
});

// GET /api/admin/newsletter?store=site  -> list all newsletter subscribers
// (omit ?store to see every store's subscribers at once). Requires login.
router.get('/newsletter', auth, async (req, res) => {
  try {
    const { store } = req.query;
    const filter = {};
    if (store) filter.storeSlug = store;
    const subscribers = await Newsletter.find(filter).sort({ subscribedAt: -1 }).lean();
    return res.json(subscribers);
  } catch (err) {
    console.error('GET /api/admin/newsletter error:', err);
    return res.status(500).json({ error: 'Failed to fetch subscribers.' });
  }
});

// GET /api/admin/waitlist?store=luxury  -> list all waitlist sign-ups
router.get('/waitlist', auth, async (req, res) => {
  try {
    const { store } = req.query;
    const filter = {};
    if (store) filter.storeSlug = store;
    const entries = await Waitlist.find(filter).sort({ joinedAt: -1 }).lean();
    return res.json(entries);
  } catch (err) {
    console.error('GET /api/admin/waitlist error:', err);
    return res.status(500).json({ error: 'Failed to fetch waitlist.' });
  }
});

// PATCH /api/admin/me/password  { currentPassword, newPassword }
// Lets a logged-in admin change their own password. Requires the current
// password so a stolen/left-open session token alone can't be used to
// lock the real owner out.
router.patch('/me/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'newPassword must be at least 8 characters.' });
    }

    const admin = await Admin.findById(req.user.id);
    if (!admin) return res.status(404).json({ error: 'Admin not found.' });

    const match = await admin.comparePassword(currentPassword);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    admin.password = newPassword; // pre('save') hook rehashes it
    await admin.save();

    return res.json({ message: 'Password updated.' });
  } catch (err) {
    console.error('PATCH /api/admin/me/password error:', err);
    return res.status(500).json({ error: 'Failed to update password.' });
  }
});

/* ------------------------------------------------------------------ */
/*  ONE-TIME SEED (browser-hittable, secret-protected)                 */
/*  Lets you bootstrap the first admin login + the four storefronts     */
/*  by visiting a URL once from your phone, instead of running a local   */
/*  script against production Mongo. Safe to leave deployed: idempotent, */
/*  does nothing once the admin/stores already exist, and refuses to    */
/*  run at all unless the SEED_SECRET env var matches.                  */
/* ------------------------------------------------------------------ */

const SEED_STORES = [
  { slug: 'site', name: 'De Prudent (Agency Site)', whatsappNumber: '2349162306809' },
  { slug: 'mall', name: 'De Prudent Mall', whatsappNumber: '2349162306809' },
  { slug: 'portfolio', name: 'De Prudent Portfolio', whatsappNumber: '2349162306809' },
  { slug: 'luxury', name: 'De Prudent Luxury', whatsappNumber: '2349162306809' },
  { slug: 'restaurant', name: 'Abeni Restaurant', whatsappNumber: '2349162306809' },
];

// GET /api/admin/seed?secret=...
router.get('/seed', async (req, res) => {
  try {
    if (!process.env.SEED_SECRET) {
      return res.status(500).json({ error: 'SEED_SECRET is not configured on the server.' });
    }
    if (req.query.secret !== process.env.SEED_SECRET) {
      return res.status(403).json({ error: 'Invalid or missing secret.' });
    }

    const ADMIN_EMAIL = 'admin@deprudent.com';
    const ADMIN_PASSWORD = 'ChangeMe123!';

    let adminCreated = false;
    let adminMessage;
    const existingAdmin = await Admin.findOne({ email: ADMIN_EMAIL });
    if (existingAdmin) {
      adminMessage = `Admin ${ADMIN_EMAIL} already exists — skipped.`;
    } else {
      await Admin.create({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'superadmin' });
      adminCreated = true;
      adminMessage = `Created admin ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} — log in once, then change the password.`;
    }

    const storeResults = [];
    for (const s of SEED_STORES) {
      const result = await Store.updateOne({ slug: s.slug }, { $setOnInsert: s }, { upsert: true });
      storeResults.push({
        slug: s.slug,
        created: Boolean(result.upsertedCount),
      });
    }

    return res.json({
      message: 'Seed complete.',
      admin: {
        created: adminCreated,
        note: adminMessage,
        ...(adminCreated ? { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } : {}),
      },
      stores: storeResults,
    });
  } catch (err) {
    console.error('GET /api/admin/seed error:', err);
    return res.status(500).json({ error: 'Seed failed.' });
  }
});

// ------------------------------------------------------------------
// ONE-TIME IMPORT: pulls each storefront's built-in fallback demo
// catalogue (the placeholder products shown when a store has zero
// products in the database) into real Product documents, so they
// show up — and become editable — in this admin dashboard.
// Safe to re-run: skips any store that already has products.
// ------------------------------------------------------------------
const DEMO_CATALOGUES = {
  mall: [
    { name:'Oversized Denim Jacket', category:'trending', price:42, description:'Relaxed-fit denim jacket with raw-edge trim.', image_url:'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=300&h=300&fit=crop' },
    { name:'Wireless Earbuds Pro', category:'trending', price:38, description:'Active noise cancelling, 24hr battery.', image_url:'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=300&h=300&fit=crop' },
    { name:'Floral Wrap Dress', category:'women', price:34, description:'Lightweight wrap dress, true to size.', image_url:'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=300&h=300&fit=crop' },
    { name:'High-Waist Trousers', category:'women', price:29, description:'Tailored trousers with a wide leg.', image_url:'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=300&h=300&fit=crop' },
    { name:'Classic Oxford Shirt', category:'men', price:26, description:'Breathable cotton, slim fit.', image_url:'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=300&h=300&fit=crop' },
    { name:'Leather Chelsea Boots', category:'men', price:64, description:'Genuine leather, elastic side panels.', image_url:'https://images.unsplash.com/photo-1638247025967-b4e38f787b76?w=300&h=300&fit=crop' },
    { name:'Kids Dino Hoodie', category:'kids', price:18, description:'Soft fleece hoodie with dino print.', image_url:'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=300&h=300&fit=crop' },
    { name:'Toddler Sneakers', category:'kids', price:15, description:'Velcro strap sneakers, non-slip sole.', image_url:'https://images.unsplash.com/photo-1514989940723-e8e51635b782?w=300&h=300&fit=crop' },
    { name:'Smartwatch Series X', category:'electronics', price:89, description:'Heart-rate tracking, 7-day battery.', image_url:'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&h=300&fit=crop' },
    { name:'Portable Bluetooth Speaker', category:'electronics', price:32, description:'Waterproof, 12-hour playtime.', image_url:'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=300&h=300&fit=crop' },
    { name:'Ceramic Dinnerware Set', category:'home', price:48, description:'16-piece set, dishwasher safe.', image_url:'https://images.unsplash.com/photo-1584346133934-a3afd2e5b1e2?w=300&h=300&fit=crop' },
    { name:'Scented Soy Candle', category:'home', price:14, description:'Hand-poured, 40-hour burn time.', image_url:'https://images.unsplash.com/photo-1602874801007-a3f4c6939d59?w=300&h=300&fit=crop' },
    { name:'Yoga Mat Pro', category:'sports', price:24, description:'Non-slip, 6mm thick, carry strap included.', image_url:'https://images.unsplash.com/photo-1592432678016-e910b452f9a2?w=300&h=300&fit=crop' },
    { name:'Adjustable Dumbbell Set', category:'sports', price:76, description:'5–25kg adjustable, space-saving.', image_url:'https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=300&h=300&fit=crop' },
    { name:'Vitamin C Serum', category:'beauty', price:19, description:'Brightening serum with hyaluronic acid.', image_url:'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=300&h=300&fit=crop' },
    { name:'Matte Lipstick Set', category:'beauty', price:22, description:'6-shade set, long-wear formula.', image_url:'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=300&h=300&fit=crop' },
    { name:'Minimalist Backpack', category:'recommend', price:44, description:'Water-resistant, fits 15" laptop.', image_url:'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300&h=300&fit=crop' },
    { name:'Polarized Sunglasses', category:'recommend', price:21, description:'UV400 protection, unisex frame.', image_url:'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=300&h=300&fit=crop' },
    { name:'Clearance: Travel Duffel Bag', category:'deals', price:19, description:'Was $39 — 51% off this week only.', image_url:'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300&h=300&fit=crop' },
    { name:'Clearance: LED Desk Lamp', category:'deals', price:12, description:'Was $28 — 57% off this week only.', image_url:'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=300&h=300&fit=crop' },
  ],
  restaurant: [
    { name:'Peppered Gizzard', category:'starters', price:3500, description:'Grilled gizzard tossed in a smoky pepper sauce.', image_url:'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400&h=300&fit=crop', spice:'Medium' },
    { name:'Puff-Puff (6pc)', category:'starters', price:1500, description:'Classic Nigerian fried dough, lightly sweetened.', image_url:'https://images.unsplash.com/photo-1541599468348-e96984315921?w=400&h=300&fit=crop', spice:null },
    { name:'Spring Rolls (5pc)', category:'starters', price:2500, description:'Crispy vegetable spring rolls with chili dip.', image_url:'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=300&fit=crop', spice:'Mild' },
    { name:'Party Jollof Rice', category:'mains', price:4500, description:'Smoky party-style jollof with fried plantain.', image_url:'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=400&h=300&fit=crop', spice:'Medium' },
    { name:'Egusi Soup & Pounded Yam', category:'mains', price:5500, description:'Melon-seed soup with assorted meat, served with pounded yam.', image_url:'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=300&fit=crop', spice:'Hot' },
    { name:'Fried Rice & Chicken', category:'mains', price:4800, description:'Vegetable fried rice with grilled chicken thigh.', image_url:'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop', spice:'Mild' },
    { name:'Beef Suya Skewers', category:'grills', price:4000, description:'Charcoal-grilled beef in a spiced suya rub, 5 skewers.', image_url:'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&h=300&fit=crop', spice:'Hot' },
    { name:'Grilled Chicken Half', category:'grills', price:5200, description:'Half chicken marinated and grilled to order.', image_url:'https://images.unsplash.com/photo-1598515213692-5f252f0c14e3?w=400&h=300&fit=crop', spice:'Medium' },
    { name:'Chin Chin', category:'desserts', price:1800, description:'Crunchy fried pastry snack, lightly sweet.', image_url:'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=400&h=300&fit=crop', spice:null },
    { name:'Coconut Candy Bites', category:'desserts', price:1500, description:'Toasted coconut caramel bites.', image_url:'https://images.unsplash.com/photo-1481391319762-47dff72954d9?w=400&h=300&fit=crop', spice:null },
    { name:'Chapman', category:'drinks', price:2200, description:'Classic Nigerian fruit cocktail, non-alcoholic.', image_url:'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&h=300&fit=crop', spice:null },
    { name:'Zobo Drink', category:'drinks', price:1800, description:'Hibiscus drink infused with ginger and pineapple.', image_url:'https://images.unsplash.com/photo-1560508601-116e0d7c2ff4?w=400&h=300&fit=crop', spice:null },
  ],
  luxury: [
    { name:'The Atelier Coat', sku:'AC-014', price:340, image_url:'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=700&h=900&fit=crop', colors:[{name:'Ink Black',hex:'#15161B'},{name:'Bone',hex:'#E9E2D3'},{name:'Burgundy',hex:'#7C2333'}], sizes:['XS','S','M','L','XL'], soldOut:false, description:'Hand-finished wool-blend overcoat with a structured drape.' },
    { name:'Silk Column Dress', sku:'SD-022', price:215, image_url:'https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?w=700&h=900&fit=crop', colors:[{name:'Bone',hex:'#E9E2D3'},{name:'Ink Black',hex:'#15161B'}], sizes:['XS','S','M','L'], soldOut:false, description:'Bias-cut silk column dress, single back seam.' },
    { name:'Brushed Wool Trouser', sku:'WT-009', price:165, image_url:'https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=700&h=900&fit=crop', colors:[{name:'Brass',hex:'#A98358'},{name:'Ink Black',hex:'#15161B'}], sizes:['XS','S','M','L','XL'], soldOut:true, description:'High-waisted brushed wool trouser with a tapered leg.' },
    { name:'Linen Wrap Blouse', sku:'LB-031', price:120, image_url:'https://images.unsplash.com/photo-1521334884684-d80222895322?w=700&h=900&fit=crop', colors:[{name:'Bone',hex:'#E9E2D3'},{name:'Burgundy',hex:'#7C2333'}], sizes:['XS','S','M','L'], soldOut:false, description:'Heavyweight linen wrap blouse, mother-of-pearl buttons.' },
    { name:'Tailored Vest', sku:'TV-017', price:140, image_url:'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=700&h=900&fit=crop', colors:[{name:'Ink Black',hex:'#15161B'}], sizes:['S','M','L'], soldOut:false, description:'Structured tailored vest, can be worn open or buttoned.' },
    { name:'Suede Ankle Boot', sku:'SB-040', price:260, image_url:'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=700&h=900&fit=crop', colors:[{name:'Brass',hex:'#A98358'}], sizes:['36','37','38','39','40'], soldOut:true, description:'Hand-cut suede ankle boot on a stacked leather heel.' },
  ],
};

router.get('/import-demo-products', async (req, res) => {
  try {
    if (!process.env.SEED_SECRET) {
      return res.status(500).json({ error: 'SEED_SECRET is not configured on the server.' });
    }
    if (req.query.secret !== process.env.SEED_SECRET) {
      return res.status(403).json({ error: 'Invalid or missing secret.' });
    }

    const results = [];
    for (const slug of Object.keys(DEMO_CATALOGUES)) {
      const storeDoc = await resolveStoreBySlug(slug);
      if (!storeDoc) {
        results.push({ slug, imported: 0, note: 'Store not found — run /api/admin/seed first.' });
        continue;
      }
      const existingCount = await Product.countDocuments({ storeId: storeDoc._id });
      if (existingCount > 0) {
        results.push({ slug, imported: 0, note: `Skipped — already has ${existingCount} product(s).` });
        continue;
      }
      const docs = DEMO_CATALOGUES[slug].map((p) => ({ ...p, storeId: storeDoc._id }));
      await Product.insertMany(docs);
      results.push({ slug, imported: docs.length });
    }

    return res.json({ message: 'Demo product import complete.', results });
  } catch (err) {
    console.error('GET /api/admin/import-demo-products error:', err);
    return res.status(500).json({ error: 'Import failed.' });
  }
});

/* ------------------------------------------------------------------ */
/*  PRODUCTS (admin)                                                   */
/* ------------------------------------------------------------------ */


// POST /api/admin/products  { storeId or storeSlug, name, price, ... }
router.post('/products', auth, async (req, res) => {
  try {
    const { storeId, storeSlug, ...rest } = req.body;

    let resolvedStoreId = storeId;
    if (!resolvedStoreId && storeSlug) {
      const storeDoc = await resolveStoreBySlug(storeSlug);
      if (!storeDoc) return res.status(404).json({ error: `Store "${storeSlug}" not found.` });
      resolvedStoreId = storeDoc._id;
    }
    if (!resolvedStoreId) return res.status(400).json({ error: '"storeId" or "storeSlug" is required.' });
    if (!rest.name || rest.price === undefined) {
      return res.status(400).json({ error: 'name and price are required.' });
    }

    const product = await Product.create({ storeId: resolvedStoreId, ...rest });
    return res.status(201).json(product);
  } catch (err) {
    console.error('POST /api/admin/products error:', err);
    return res.status(500).json({ error: 'Failed to create product.' });
  }
});

// PUT /api/admin/products/:id
router.put('/products/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid product id.' });

    const { storeId, ...updates } = req.body; // don't allow moving a product between stores by accident
    const product = await Product.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    return res.json(product);
  } catch (err) {
    console.error('PUT /api/admin/products/:id error:', err);
    return res.status(500).json({ error: 'Failed to update product.' });
  }
});

// DELETE /api/admin/products/:id
router.delete('/products/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid product id.' });

    const product = await Product.findByIdAndDelete(id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    return res.json({ message: 'Product deleted.', id });
  } catch (err) {
    console.error('DELETE /api/admin/products/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete product.' });
  }
});

/* ------------------------------------------------------------------ */
/*  ORDERS (admin)                                                     */
/* ------------------------------------------------------------------ */

// GET /api/admin/orders?store=mall&status=pending -> full order records, PII included
router.get('/orders', auth, async (req, res) => {
  try {
    const { store, status } = req.query;
    if (!store) return res.status(400).json({ error: 'Query param "store" (slug) is required.' });

    const storeDoc = await resolveStoreBySlug(store);
    if (!storeDoc) return res.status(404).json({ error: `Store "${store}" not found.` });

    const filter = { storeId: storeDoc._id };
    if (status) filter.status = status;

    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(orders);
  } catch (err) {
    console.error('GET /api/admin/orders error:', err);
    return res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

// PATCH /api/admin/orders/:id  { status: 'shipped' }
router.patch('/orders/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid order id.' });

    const allowed = ['pending', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }

    const order = await Order.findByIdAndUpdate(id, { status }, { new: true, runValidators: true });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    return res.json(order);
  } catch (err) {
    console.error('PATCH /api/admin/orders/:id error:', err);
    return res.status(500).json({ error: 'Failed to update order status.' });
  }
});

/* ------------------------------------------------------------------ */
/*  STORE MANAGEMENT (admin)                                           */
/*  Lets you manage Mall / Portfolio / Luxury / Restaurant configs      */
/*  (WhatsApp number, bank details, Paystack key) from the dashboard    */
/*  instead of editing the database by hand.                            */
/* ------------------------------------------------------------------ */

// GET /api/admin/stores -> list every store (for the store-switcher in the dashboard)
router.get('/stores', auth, async (req, res) => {
  try {
    const stores = await Store.find().sort({ name: 1 }).lean();
    return res.json(stores);
  } catch (err) {
    console.error('GET /api/admin/stores error:', err);
    return res.status(500).json({ error: 'Failed to fetch stores.' });
  }
});

// POST /api/admin/stores -> create a new storefront config
router.post('/stores', auth, async (req, res) => {
  try {
    const { slug, name, whatsappNumber } = req.body;
    if (!slug || !name || !whatsappNumber) {
      return res.status(400).json({ error: 'slug, name, and whatsappNumber are required.' });
    }
    const store = await Store.create(req.body);
    return res.status(201).json(store);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A store with that slug already exists.' });
    console.error('POST /api/admin/stores error:', err);
    return res.status(500).json({ error: 'Failed to create store.' });
  }
});

// PUT /api/admin/stores/:id -> update a storefront config
router.put('/stores/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid store id.' });

    const store = await Store.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!store) return res.status(404).json({ error: 'Store not found.' });

    return res.json(store);
  } catch (err) {
    console.error('PUT /api/admin/stores/:id error:', err);
    return res.status(500).json({ error: 'Failed to update store.' });
  }
});

// DELETE /api/admin/stores/:id -> deactivate (soft-delete) a storefront
// Soft delete keeps historical orders/products intact instead of orphaning them.
router.delete('/stores/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid store id.' });

    const store = await Store.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!store) return res.status(404).json({ error: 'Store not found.' });

    return res.json({ message: 'Store deactivated.', store });
  } catch (err) {
    console.error('DELETE /api/admin/stores/:id error:', err);
    return res.status(500).json({ error: 'Failed to deactivate store.' });
  }
});

/* ------------------------------------------------------------------ */
/*  DASHBOARD SUMMARY (admin)                                          */
/*  One call the dashboard home screen can use instead of stitching     */
/*  together several requests.                                          */
/* ------------------------------------------------------------------ */

// GET /api/admin/summary?store=mall
router.get('/summary', auth, async (req, res) => {
  try {
    const { store } = req.query;
    if (!store) return res.status(400).json({ error: 'Query param "store" (slug) is required.' });

    const storeDoc = await resolveStoreBySlug(store);
    if (!storeDoc) return res.status(404).json({ error: `Store "${store}" not found.` });

    const [productCount, orderCounts, revenueAgg] = await Promise.all([
      Product.countDocuments({ storeId: storeDoc._id }),
      Order.aggregate([
        { $match: { storeId: storeDoc._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { storeId: storeDoc._id, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ]);

    const byStatus = { pending: 0, shipped: 0, delivered: 0, cancelled: 0 };
    orderCounts.forEach((row) => {
      byStatus[row._id] = row.count;
    });

    return res.json({
      store: { slug: storeDoc.slug, name: storeDoc.name },
      productCount,
      orders: byStatus,
      totalOrders: Object.values(byStatus).reduce((a, b) => a + b, 0),
      revenue: revenueAgg[0]?.total || 0,
    });
  } catch (err) {
    console.error('GET /api/admin/summary error:', err);
    return res.status(500).json({ error: 'Failed to build summary.' });
  }
});

module.exports = router;
