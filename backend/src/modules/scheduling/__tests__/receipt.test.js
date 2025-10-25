const { generateSpecialCollectionReceipt } = require('../receipt');

describe('generateSpecialCollectionReceipt', () => {
  const baseRequest = {
    _id: 'req-1',
    address: '123 Riverside Ave',
    district: 'Colombo',
    contactPhone: '+94 77 123 4567',
    contactEmail: 'resident@example.com',
    residentName: 'Resident One',
    ownerName: 'Owner Two',
    itemLabel: 'Furniture & bulky items',
    itemType: 'furniture',
    quantity: 3,
    approxWeightKg: 28.5,
    totalWeightKg: 85.5,
    paymentSubtotal: 4200,
    paymentWeightCharge: 1200,
    paymentTaxCharge: 126,
    paymentAmount: 5526,
  };

  const baseSlot = {
    start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  };

  it('returns a non-empty PDF buffer populated with request details', async () => {
    const buffer = await generateSpecialCollectionReceipt({
      request: baseRequest,
      slot: baseSlot,
      issuedAt: new Date(),
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('gracefully handles falsy and invalid numeric fields', async () => {
    const buffer = await generateSpecialCollectionReceipt({
      request: {
        ...baseRequest,
        approxWeightKg: undefined,
        totalWeightKg: 'not-a-number',
        paymentSubtotal: null,
        paymentWeightCharge: undefined,
        paymentTaxCharge: null,
        paymentAmount: 'not-a-number',
      },
      slot: {
        start: new Date().toISOString(),
        end: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
      },
      issuedAt: new Date('not-a-real-date'),
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
