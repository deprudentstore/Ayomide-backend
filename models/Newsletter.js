const mongoose = require('mongoose');

const NewsletterSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    storeSlug: { type: String, required: true, trim: true, lowercase: true, index: true },
  },
  { timestamps: { createdAt: 'subscribedAt', updatedAt: false } }
);

// Same email can subscribe once per store, not once globally.
NewsletterSchema.index({ email: 1, storeSlug: 1 }, { unique: true });

module.exports = mongoose.models.Newsletter || mongoose.model('Newsletter', NewsletterSchema);
