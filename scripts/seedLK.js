// scripts/seedLK.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { connectDB } = require('../backend/src/db/mongoose');
const City = require('../backend/src/models/City');
const WasteBin = require('../backend/src/models/WasteBin');
const User = require('../backend/src/models/User');
const WasteCollectionRecord = require('../backend/src/models/WasteCollectionRecord');

const CITIES = [
  {
    name: 'Homagama',
    code: 'HOMA',
    depot: { lat: 6.8442, lon: 80.0031 },
    bbox: [[6.8200, 79.9500], [6.9000, 80.0400]],
    areaSqKm: 13.6,
    population: 91000,
    lastCollectionAt: new Date(Date.now() - 2 * 86_400_000),
    binCount: 38,
  },
  {
    name: 'Borella',
    code: 'BORA',
    depot: { lat: 6.9147, lon: 79.8733 },
    bbox: [[6.9000, 79.8600], [6.9350, 79.9000]],
    areaSqKm: 9.4,
    population: 118000,
    lastCollectionAt: new Date(Date.now() - 1 * 86_400_000),
    binCount: 36,
  },
  {
    name: 'Rajagiriya',
    code: 'RAJA',
    depot: { lat: 6.9105, lon: 79.8875 },
    bbox: [[6.8950, 79.8700], [6.9400, 79.9200]],
    areaSqKm: 7.8,
    population: 76000,
    lastCollectionAt: new Date(Date.now() - 3 * 86_400_000),
    binCount: 35,
  },
];

const makeBinRecords = () => {
  let idx = 1;
  const records = [];
  for (const city of CITIES) {
    const [southWest, northEast] = city.bbox;
    const latSpan = Math.abs((northEast?.[0] ?? city.depot.lat) - (southWest?.[0] ?? city.depot.lat));
    const lonSpan = Math.abs((northEast?.[1] ?? city.depot.lon) - (southWest?.[1] ?? city.depot.lon));
    for (let i = 0; i < (city.binCount || 30); i += 1) {
      const latBase = southWest?.[0] ?? city.depot.lat;
      const lonBase = southWest?.[1] ?? city.depot.lon;
      const lat = latBase + Math.random() * (latSpan || 0.02);
      const lon = lonBase + Math.random() * (lonSpan || 0.02);
      const sector = `Sector-${String((i % 4) + 1).padStart(2, '0')}`;
      records.push({
        binId: `BIN-${String(idx).padStart(3, '0')}`,
        ward: city.name,
        city: city.name,
        area: `${city.name}-${sector}`,
        location: { lat, lon },
        capacityKg: 240 + Math.round(Math.random() * 80),
        lastPickupAt: new Date(Date.now() - (1 + Math.random() * 6) * 86_400_000),
        estRateKgPerDay: 6 + Math.random() * 6,
      });
      idx += 1;
    }
  }
  return records;
};

const WASTE_TYPES = ['household', 'business', 'organic', 'recyclable'];
const BILLING_MODELS = ['weight-based', 'flat-fee', 'subscription'];

const makeCollectionRecords = () => {
  const today = new Date();
  const lookbackDays = 45;
  const records = [];

  for (const city of CITIES) {
    for (let dayOffset = 0; dayOffset < lookbackDays; dayOffset += 1) {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - dayOffset);

      const dailyHouseholds = Math.floor(8 + Math.random() * 6);
      for (let householdIndex = 0; householdIndex < dailyHouseholds; householdIndex += 1) {
        const wasteType = WASTE_TYPES[Math.floor(Math.random() * WASTE_TYPES.length)];
        const billingModel = BILLING_MODELS[Math.floor(Math.random() * BILLING_MODELS.length)];

        const baseWeight = wasteType === 'business'
          ? 120 + Math.random() * 60
          : 30 + Math.random() * 40;

        const recyclableRatio = wasteType === 'recyclable'
          ? 0.85
          : wasteType === 'organic'
            ? 0.35 + Math.random() * 0.15
            : 0.2 + Math.random() * 0.2;

        const recyclableKg = Number((baseWeight * recyclableRatio).toFixed(2));
        const nonRecyclableKg = Number((baseWeight - recyclableKg).toFixed(2));

        records.push({
          collectionDate: date,
          region: city.name,
          zone: `${city.name}-Zone-${1 + (householdIndex % 3)}`,
          householdId: `${city.name.slice(0, 3).toUpperCase()}-${String(householdIndex + 1).padStart(3, '0')}`,
          customerType: wasteType === 'business' ? 'business' : 'household',
          wasteType,
          billingModel,
          weightKg: Number(baseWeight.toFixed(2)),
          recyclableKg,
          nonRecyclableKg,
          recyclableRatio: Number((recyclableKg / Math.max(baseWeight, 1)).toFixed(2)),
        });
      }
    }
  }

  return records;
};

(async () => {
  try {
    await connectDB();
    await Promise.all([
      City.deleteMany({}),
      WasteBin.deleteMany({}),
      WasteCollectionRecord.deleteMany({}),
      User.deleteMany({}),
    ]);

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

    await City.insertMany(CITIES.map(city => ({
      name: city.name,
      code: city.code,
      depot: city.depot,
      bbox: city.bbox,
      areaSqKm: city.areaSqKm,
      population: city.population,
      lastCollectionAt: city.lastCollectionAt,
    })));
    console.log(`✅ Seeded ${CITIES.length} cities with depot metadata`);

    const binDocs = makeBinRecords();
    await WasteBin.insertMany(binDocs);
    console.log(`✅ Seeded ${binDocs.length} bins across ${CITIES.length} cities`);

    const collectionDocs = makeCollectionRecords();
    await WasteCollectionRecord.insertMany(collectionDocs);
    console.log(`✅ Seeded ${collectionDocs.length} waste collection records for analytics`);

  } catch (e) {
    console.error('❌ Seed failed:', e.message);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
})();
