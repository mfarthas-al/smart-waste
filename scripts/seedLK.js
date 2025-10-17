// scripts/seedLK.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { connectDB } = require('../backend/src/db/mongoose');
const WasteBin = require('../backend/src/models/WasteBin');
const User = require('../backend/src/models/User');
const WasteCollectionRecord = require('../backend/src/models/WasteCollectionRecord');
const Bill = require('../backend/src/models/Bill');
const PaymentTransaction = require('../backend/src/models/PaymentTransaction');

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
      WasteBin.deleteMany({}),
      WasteCollectionRecord.deleteMany({}),
      Bill.deleteMany({}),
      PaymentTransaction.deleteMany({}),
    ]);

    const ensureSeedUser = async ({ name, email, password, role }) => {
      const existing = await User.findOne({ email });
      if (existing) {
        let dirty = false;
        if (name && existing.name !== name) {
          existing.name = name;
          dirty = true;
        }
        if (role && existing.role !== role) {
          existing.role = role;
          dirty = true;
        }
        if (dirty) {
          await existing.save();
        }
        return existing;
      }

      const passwordHash = await User.hashPassword(password);
      return User.create({
        name,
        email,
        passwordHash,
        role,
      });
    };

    const [adminUser, collectorUser, residentUser] = await Promise.all([
      ensureSeedUser({
        name: 'Nadeesha Perera',
        email: 'admin@smartwaste.lk',
        password: 'Admin@123',
        role: 'admin',
      }),
      ensureSeedUser({
        name: 'Chamika Fernando',
        email: 'collector@smartwaste.lk',
        password: 'Collector@123',
        role: 'regular',
      }),
      ensureSeedUser({
        name: 'Ishara Silva',
        email: 'resident@smartwaste.lk',
        password: 'Resident@123',
        role: 'regular',
      }),
    ]);
    console.log('✅ Ensured admin, collector, and resident seed users exist');

    const binDocs = makeBinRecords();
    await WasteBin.insertMany(binDocs);
    console.log(`✅ Seeded ${binDocs.length} bins across ${CITIES.length} cities`);

    const collectionDocs = makeCollectionRecords();
    await WasteCollectionRecord.insertMany(collectionDocs);
    console.log(`✅ Seeded ${collectionDocs.length} waste collection records for analytics`);

    const now = new Date();
    const toDate = days => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      return d;
    };

    const billingDocs = [
      {
        userId: residentUser._id,
        invoiceNumber: 'INV-2025-001',
        description: 'Residential waste service - August 2025',
        amount: 1850,
        currency: 'LKR',
        billingPeriodStart: toDate(-60),
        billingPeriodEnd: toDate(-30),
        generatedAt: toDate(-28),
        dueDate: toDate(-5),
        status: 'unpaid',
      },
      {
        userId: residentUser._id,
        invoiceNumber: 'INV-2025-002',
        description: 'Residential waste service - September 2025',
        amount: 1925,
        currency: 'LKR',
        billingPeriodStart: toDate(-30),
        billingPeriodEnd: toDate(0),
        generatedAt: toDate(-2),
        dueDate: toDate(14),
        status: 'unpaid',
      },
      {
        userId: residentUser._id,
        invoiceNumber: 'INV-2025-000',
        description: 'Residential waste service - July 2025',
        amount: 1780,
        currency: 'LKR',
        billingPeriodStart: toDate(-90),
        billingPeriodEnd: toDate(-60),
        generatedAt: toDate(-58),
        dueDate: toDate(-30),
        status: 'paid',
        paidAt: toDate(-28),
        paymentMethod: 'card',
      },
    ];

    const insertedBills = await Bill.insertMany(billingDocs);
    console.log(`✅ Seeded ${billingDocs.length} resident billing records`);

    const paidBill = insertedBills.find(doc => doc.status === 'paid');
    if (paidBill) {
      await PaymentTransaction.create({
        billId: paidBill._id,
        userId: paidBill.userId,
        amount: paidBill.amount,
        currency: paidBill.currency,
        status: 'success',
        paymentMethod: paidBill.paymentMethod || 'card',
        stripeSessionId: 'seed-session',
        stripePaymentIntentId: 'seed-intent',
        receiptUrl: 'https://example.com/demo-receipt.pdf',
      });
      console.log('✅ Seeded historical payment transaction for paid invoice');
    }

  } catch (e) {
    console.error('❌ Seed failed:', e.message);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
})();
