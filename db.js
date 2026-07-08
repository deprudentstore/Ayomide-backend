const mongoose = require('mongoose');

// Vercel serverless functions can be re-invoked on a warm container.
// We cache the connection on the global object so we don't reconnect
// to MongoDB Atlas on every request (which would exhaust connections
// and slow every cold-ish call down).
let cached = global._mongooseConn;
if (!cached) {
  cached = global._mongooseConn = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not set. Add it to your .env file or Vercel project env vars.');
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGO_URI, {
        bufferCommands: false,
      })
      .then((mongooseInstance) => mongooseInstance);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

module.exports = connectDB;
