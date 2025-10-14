// scripts/seedLK.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { connectDB } = require('../backend/src/db/mongoose');
const WasteBin = require('../backend/src/models/WasteBin');
const User = require('../backend/src/models/User');

(async () => {
  const depot = { lat: 6.927, lon: 79.861 };
  const jitter = n => (Math.random() - 0.5) * n;
  const mk = i => ({
    binId: `BIN-${String(i).padStart(3, '0')}`,
    ward: i % 2 ? 'CMC-W05' : 'CMC-W06',
    location: { lat: depot.lat + jitter(0.06), lon: depot.lon + jitter(0.06) },
    capacityKg: 240,
    lastPickupAt: new Date(Date.now() - (1 + Math.random() * 5) * 86400000),
    estRateKgPerDay: 3 + Math.random() * 2,
  });

  try {
    await connectDB();
    await WasteBin.deleteMany({});
    await WasteBin.insertMany(Array.from({ length: 80 }, (_, i) => mk(i + 1)));
    console.log('✅ Seeded 80 bins');

    await User.deleteMany({});
    const [adminHash, regularHash] = await Promise.all([
      User.hashPassword('Admin@123'),
      User.hashPassword('Collector@123'),
    ]);
    await User.insertMany([
      {
        name: 'Nadeesha Perera',
        email: 'admin@smartwaste.lk',
        passwordHash: adminHash,
        role: 'admin',
      },
      {
        name: 'Chamika Fernando',
        email: 'collector@smartwaste.lk',
        passwordHash: regularHash,
        role: 'regular',
      },
    ]);
    console.log('✅ Seeded admin and regular users');
    
  } catch (e) {
    console.error('❌ Seed failed:', e.message);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
})();
