const router = require('express').Router();
const controller = require('./controller');

router.get('/bills', controller.listBills);
router.post('/checkout', controller.createCheckoutSession);
router.get('/checkout/:sessionId', controller.syncCheckoutSession);

module.exports = router;
