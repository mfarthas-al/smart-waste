const { Schema, model, Types } = require('mongoose');

const transactionSchema = new Schema({
  billId: { type: Types.ObjectId, ref: 'Bill', required: true, index: true },
  userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'LKR' },
  paymentMethod: { type: String },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'cancelled'],
    default: 'pending',
    index: true,
  },
  stripeSessionId: { type: String, index: true },
  stripePaymentIntentId: { type: String },
  receiptUrl: { type: String },
  failureReason: { type: String },
  rawGatewayResponse: { type: Schema.Types.Mixed },
}, { timestamps: true });

module.exports = model('PaymentTransaction', transactionSchema);
