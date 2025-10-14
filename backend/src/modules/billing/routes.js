const router = require('express').Router();
router.get('/bills', (_req, res) => res.json([]));
module.exports = router;
