// scripts/seedLK.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { connectDB } = require('../backend/src/db/mongoose');
const WasteBin = require('../backend/src/models/WasteBin');
const User = require('../backend/src/models/User');

const CITIES = [
  {
    name: 'Rajagiriya',
    center: { lat: 6.9105, lon: 79.8875 },
    count: 35,
  },
  {
    name: 'Kolonnawa',
    center: { lat: 6.955, lon: 79.883 },
    count: 33,
  },
  {
    name: 'Borella',
    center: { lat: 6.9147, lon: 79.8733 },
    count: 34,
  },
];

const jitter = magnitude => (Math.random() - 0.5) * magnitude;

const makeBinRecords = () => {
  let idx = 1;
  const records = [];
  for (const city of CITIES) {
    for (let i = 0; i < city.count; i += 1) {
      records.push({
        binId: `BIN-${String(idx).padStart(3, '0')}`,
        ward: city.name,
        location: {
          lat: city.center.lat + jitter(0.028),
          lon: city.center.lon + jitter(0.028),
        },
        capacityKg: 240 + Math.round(Math.random() * 60),
        lastPickupAt: new Date(Date.now() - (1 + Math.random() * 6) * 86_400_000),
        estRateKgPerDay: 3 + Math.random() * 2,
      });
      idx += 1;
    }
  }
  return records;
};

(async () => {
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
    

    const docs = makeBinRecords();
    await WasteBin.insertMany(docs);
    console.log(`✅ Seeded ${docs.length} bins across ${CITIES.length} cities`);

  } catch (e) {
    console.error('❌ Seed failed:', e.message);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
})();
