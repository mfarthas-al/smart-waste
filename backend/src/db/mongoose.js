const mongoose = require('mongoose');

const DEFAULT_OPTS = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
};

async function connectOnce(uri, options = {}) {
  mongoose.set('strictQuery', true);
  return mongoose.connect(uri, { ...DEFAULT_OPTS, ...options });
}

async function connectDB({ retries = 3, delayMs = 2000, uri = process.env.MONGODB_URI, options = {} } = {}) {
  if (!uri) throw new Error('MONGODB_URI is not set');
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await connectOnce(uri, options);
      return mongoose.connection;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

module.exports = { connectDB };
