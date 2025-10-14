const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  return mongoose.connection;
}
module.exports = { connectDB };
