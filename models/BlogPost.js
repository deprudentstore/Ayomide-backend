const mongoose = require('mongoose');

const BlogPostSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    excerpt: { type: String, default: '', trim: true },
    body: { type: String, required: true }, // simple HTML/paragraph text, rendered as-is on blog-post.html
    image_url: { type: String, default: '' },
    category: { type: String, default: '', trim: true },
    published: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.BlogPost || mongoose.model('BlogPost', BlogPostSchema);
