require('dotenv').config();
const express = require('express');
const cors = require('cors');

const connectDB = require('../db');
const productsRouter = require('../routes/products');
const ordersRouter = require('../routes/orders');
const adminRouter = require('../routes/admin');
const storesRouter = require('../routes/stores');

const app = express();

app.use(express.json({ limit: '1mb' }));

// CORS: only allow the storefronts/dashboards you actually run.
// Falls back to allowing everything only if ALLOWED_ORIGINS isn't set,
// so local dev doesn't break before you've configured env vars.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // curl/Postman/server-to-server
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin "${origin}" is not allowed.`));
    },
    credentials: true,
  })
);

// Ensure DB is connected before any route handler runs.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('MongoDB connection error:', err);
    res.status(500).json({ error: 'Database connection failed.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/stores', storesRouter);

// 404 fallback for unmatched API routes.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
});

// Central error handler (e.g. CORS rejection, unexpected throws).
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

module.exports = app;

// Only start a listener when run directly (local dev). On Vercel the
// exported `app` is used as the serverless function handler instead.
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`De Prudent backend running on http://localhost:${PORT}`));
}
