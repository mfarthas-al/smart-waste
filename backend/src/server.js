require('dotenv').config();
const { connectDB } = require('./db/mongoose');
const app = require('./app');
const { loadEnv } = require('./config/env');

const env = loadEnv();
const PORT = env.PORT || 4000;

connectDB()
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`API up on :${PORT}`));
  })
  .catch(err => {
    console.error('DB connection failed:', err);
    process.exit(1);
  });

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
