const Store = require('../models/Store');

/**
 * The frontend always talks in slugs (?store=mall), never Mongo ObjectIds.
 * This resolves a slug to a Store document, or returns null if it doesn't
 * exist / is deactivated.
 */
async function resolveStoreBySlug(slug) {
  if (!slug) return null;
  return Store.findOne({ slug: String(slug).toLowerCase().trim(), isActive: true });
}

module.exports = resolveStoreBySlug;
