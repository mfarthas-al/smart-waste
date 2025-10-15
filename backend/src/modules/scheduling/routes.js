const router = require('express').Router();
const controller = require('./controller');

router.get('/special/config', controller.getConfig);
router.post('/special/availability', controller.checkAvailability);
router.post('/special/confirm', controller.confirmBooking);
router.get('/special/my', controller.listUserRequests);

module.exports = router;
