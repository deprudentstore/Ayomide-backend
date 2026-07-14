const mongoose = require('mongoose');

const StoreSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // e.g. "mall", "restaurant", "luxury", "portfolio"
    },
    name: { type: String, required: true, trim: true },
    whatsappNumber: { type: String, required: true, trim: true }, // e.g. 2349162306809
    bankName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    accountName: { type: String, default: '' },
    paystackPublicKey: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Store || mongoose.model('Store', StoreSchema);
