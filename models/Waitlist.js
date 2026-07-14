const mongoose = require('mongoose');

const WaitlistSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    storeSlug: { type: String, required: true, trim: true, lowercase: true, index: true },
  },
  { timestamps: { createdAt: 'joinedAt', updatedAt: false } }
);

WaitlistSchema.index({ email: 1, storeSlug: 1 }, { unique: true });

module.exports = mongoose.models.Waitlist || mongoose.model('Waitlist', WaitlistSchema);
