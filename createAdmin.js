/**
 * Run once to create your first admin login and seed the four stores
 * (Mall, Portfolio, Luxury, Restaurant) so /api/products?store=mall etc.
 * resolve immediately after deploy.
 *
 * Usage:
 *   node scripts/createAdmin.js
 *
 * Requires MONGO_URI in your .env. Edit the values below before running,
 * then delete or gitignore this script's output — it prints a plaintext
 * password once, on purpose, so you can log in the first time.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../db');
const Admin = require('../models/Admin');
const Store = require('../models/Store');

const ADMIN_EMAIL = 'admin@deprudent.com';
const ADMIN_PASSWORD = 'ChangeMe123!'; // change this before running, and again after first login

const STORES = [
  { slug: 'site', name: 'De Prudent (Agency Site)', whatsappNumber: '2349162306809' },
  { slug: 'mall', name: 'De Prudent Mall', whatsappNumber: '2349162306809' },
  { slug: 'portfolio', name: 'De Prudent Portfolio', whatsappNumber: '2349162306809' },
  { slug: 'luxury', name: 'De Prudent Luxury', whatsappNumber: '2349162306809' },
  { slug: 'restaurant', name: 'Abeni Restaurant', whatsappNumber: '2349162306809' },
];

(async () => {
  try {
    await connectDB();

    const existing = await Admin.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      console.log(`Admin ${ADMIN_EMAIL} already exists — skipping creation.`);
    } else {
      await Admin.create({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'superadmin' });
      console.log(`Created admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
      console.log('Log in once, then change this password.');
    }

    for (const s of STORES) {
      const result = await Store.updateOne({ slug: s.slug }, { $setOnInsert: s }, { upsert: true });
      console.log(
        result.upsertedCount
          ? `Seeded store "${s.slug}"`
          : `Store "${s.slug}" already exists — skipping.`
      );
    }

    console.log('Done.');
  } catch (err) {
    console.error('Seed script failed:', err);
  } finally {
    await mongoose.disconnect();
  }
})();
