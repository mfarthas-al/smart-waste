const router = require('express').Router();
const controller = require('./controller');

router.get('/config', controller.getConfig);
router.post('/report', controller.generateReport);

module.exports = router;
