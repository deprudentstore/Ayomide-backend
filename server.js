// Convenience wrapper for local development so `node server.js` works too.
// Vercel itself only uses api/index.js (see vercel.json).
require('./api/index.js');
