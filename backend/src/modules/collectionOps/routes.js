const router = require('express').Router();
const c = require('./controller');

router.post('/routes/optimize', c.optimizeRoute);
router.get('/routes/:truckId/today', c.getTodayRoute);
router.post('/collections', c.recordCollection);

module.exports = router;
