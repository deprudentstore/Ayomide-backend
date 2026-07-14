const express = require('express');
const BlogPost = require('../models/BlogPost');

const router = express.Router();

// GET /api/blog -> published posts, newest first
router.get('/', async (req, res) => {
  try {
    const posts = await BlogPost.find({ published: true })
      .select('slug title excerpt image_url category createdAt')
      .sort({ createdAt: -1 })
      .lean();
    return res.json(posts);
  } catch (err) {
    console.error('GET /api/blog error:', err);
    return res.status(500).json({ error: 'Failed to fetch posts.' });
  }
});

// GET /api/blog/:slug -> single published post, full body
router.get('/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug.toLowerCase(), published: true }).lean();
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    return res.json(post);
  } catch (err) {
    console.error('GET /api/blog/:slug error:', err);
    return res.status(500).json({ error: 'Failed to fetch post.' });
  }
});

module.exports = router;
