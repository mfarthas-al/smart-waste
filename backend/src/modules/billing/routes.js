// Billing endpoints cover resident invoices and Stripe checkout sync.
const router = require('express').Router();
const controller = require('./controller');

router.get('/bills', controller.listBills);
router.post('/checkout', controller.createCheckoutSession);
router.get('/checkout/:sessionId', controller.syncCheckoutSession);
router.get('/transactions/:transactionId/receipt', controller.getReceipt);

module.exports = router;
