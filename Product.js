const mongoose = require('mongoose');

const VariantSchema = new mongoose.Schema(
  {
    color: { type: String, trim: true },
    size: { type: String, trim: true },
    stock: { type: Number, default: 0 },
  },
  { _id: false }
);

const ColorSchema = new mongoose.Schema(
  { name: { type: String, trim: true }, hex: { type: String, trim: true } },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    description: { type: String, default: '' },
    category: { type: String, default: '', trim: true },
    image_url: { type: String, default: '' },
    stock: { type: Number, default: null }, // null = unlimited/untracked
    variants: { type: [VariantSchema], default: [] },

    // Luxury-store fields (STORE_TYPES.luxury.fields in store-admin.html)
    sku: { type: String, trim: true, default: '' },
    sizes: { type: [String], default: [] },
    colors: { type: [ColorSchema], default: [] },
    soldOut: { type: Boolean, default: false },

    // Restaurant-store field (STORE_TYPES.restaurant.fields)
    spice: { type: String, trim: true, default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

ProductSchema.index({ storeId: 1, category: 1 });

module.exports = mongoose.models.Product || mongoose.model('Product', ProductSchema);
