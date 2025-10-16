const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (!SMTP_HOST) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === 'true' || Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  return transporter;
}

async function sendMail(message) {
  const mailClient = getTransporter();
  if (!mailClient) {
    console.info('📨 Mailer skipped (SMTP not configured)', {
      subject: message.subject,
      to: message.to,
    });
    return { sent: false, reason: 'not-configured' };
  }

  const envelope = {
    from: process.env.SMTP_FROM,
    ...message,
  };

  await mailClient.sendMail(envelope);
  return { sent: true, sentAt: new Date() };
}

async function sendSpecialCollectionConfirmation({ resident, slot, request }) {
  if (!resident?.email) {
    return { sent: false, reason: 'missing-recipient' };
  }

  const subject = `Special collection confirmed: ${new Date(slot.start).toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })}`;
  const slotWindow = `${new Date(slot.start).toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })} - ${new Date(slot.end).toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })}`;

  const text = [
    `Hello ${resident.name},`,
    '',
    'Your special waste collection has been scheduled successfully.',
    `Item type: ${request.itemType}`,
    `Quantity: ${request.quantity}`,
    `Collection window: ${slotWindow}`,
    request.paymentRequired ? `Payment amount: LKR ${request.paymentAmount.toLocaleString()}` : 'Payment collected: Not required',
    '',
    'If you need to make changes, contact the municipal hotline at 1919.',
    '',
    'Smart Waste LK operations team',
  ].join('\n');

  const html = `<p>Hello ${resident.name},</p>
  <p>Your special waste collection has been scheduled successfully.</p>
  <ul>
    <li><strong>Item type:</strong> ${request.itemType}</li>
    <li><strong>Quantity:</strong> ${request.quantity}</li>
    <li><strong>Collection window:</strong> ${slotWindow}</li>
    <li><strong>Payment:</strong> ${request.paymentRequired ? `LKR ${request.paymentAmount.toLocaleString()}` : 'Not required'}</li>
  </ul>
  <p>If you need to make changes, contact the municipal hotline at 1919.</p>
  <p>Smart Waste LK operations team</p>`;

  return sendMail({ to: resident.email, subject, text, html });
}

async function notifyAuthorityOfSpecialPickup({ request, slot }) {
  const authorityEmail = process.env.COLLECTION_AUTHORITY_EMAIL;
  if (!authorityEmail) {
    console.info('📨 Authority notification skipped (COLLECTION_AUTHORITY_EMAIL not set)', {
      requestId: request._id?.toString(),
    });
    return { sent: false, reason: 'not-configured' };
  }

  const subject = `New special pickup scheduled (${request.itemType}, ${request.quantity})`;
  const slotWindow = `${new Date(slot.start).toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })} - ${new Date(slot.end).toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })}`;

  const text = [
    'Special pickup confirmed:',
    `Resident: ${request.userName} (${request.userEmail})`,
    `Item type: ${request.itemType} (qty ${request.quantity})`,
    `Window: ${slotWindow}`,
    `Payment: ${request.paymentRequired ? `Collected LKR ${request.paymentAmount}` : 'Not required'}`,
  ].join('\n');

  const html = `<p>Special pickup confirmed:</p>
  <ul>
    <li><strong>Resident:</strong> ${request.userName} (${request.userEmail})</li>
    <li><strong>Item type:</strong> ${request.itemType} (qty ${request.quantity})</li>
    <li><strong>Window:</strong> ${slotWindow}</li>
    <li><strong>Payment:</strong> ${request.paymentRequired ? `Collected LKR ${request.paymentAmount}` : 'Not required'}</li>
  </ul>`;

  return sendMail({ to: authorityEmail, subject, text, html });
}

async function sendPaymentReceipt({ resident, bill, transaction }) {
  if (!resident?.email) {
    return { sent: false, reason: 'missing-recipient' };
  }

  const subject = `Payment received for ${bill.invoiceNumber}`;
  const amount = transaction.amount?.toLocaleString('en-LK', { style: 'currency', currency: bill.currency || 'LKR' });
  const paidAt = transaction.updatedAt || new Date();

  const receiptLink = transaction.receiptUrl ? `You can download the payment receipt here: ${transaction.receiptUrl}` : 'A receipt is available in the Smart Waste LK portal.';

  const text = [
    `Hello ${resident.name},`,
    '',
    `We received your payment of ${amount} for invoice ${bill.invoiceNumber}.`,
    `Payment reference: ${transaction.stripePaymentIntentId || transaction.stripeSessionId}`,
    `Paid on: ${paidAt.toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })}`,
    '',
    receiptLink,
    '',
    'Thank you for keeping your waste services up to date.',
    '',
    'Smart Waste LK billing office',
  ].join('\n');

  const html = `<p>Hello ${resident.name},</p>
  <p>We received your payment of <strong>${amount}</strong> for invoice <strong>${bill.invoiceNumber}</strong>.</p>
  <ul>
    <li><strong>Payment reference:</strong> ${transaction.stripePaymentIntentId || transaction.stripeSessionId}</li>
    <li><strong>Paid on:</strong> ${paidAt.toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })}</li>
  </ul>
  <p>${transaction.receiptUrl ? `<a href="${transaction.receiptUrl}">Download your receipt</a>` : 'A receipt is available in the Smart Waste LK portal.'}</p>
  <p>Thank you for keeping your waste services up to date.</p>
  <p>Smart Waste LK billing office</p>`;

  return sendMail({ to: resident.email, subject, text, html });
}

module.exports = {
  sendMail,
  sendSpecialCollectionConfirmation,
  notifyAuthorityOfSpecialPickup,
  sendPaymentReceipt,
};
