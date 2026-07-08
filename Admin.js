const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AdminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // bcrypt hash, never store plaintext
    role: { type: String, enum: ['admin', 'superadmin'], default: 'admin' },
    // Optional: restrict an admin to specific stores by slug. Empty array = access to all stores.
    storeAccess: { type: [String], default: [] },
  },
  { timestamps: true }
);

AdminSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

AdminSchema.pre('save', async function preSave(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

module.exports = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);
