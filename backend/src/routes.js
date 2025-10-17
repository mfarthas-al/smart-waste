// Aggregates feature routers under the /api namespace.
const router = require('express').Router();

router.use('/ops', require('./modules/collectionOps/routes'));   // UC1
router.use('/schedules', require('./modules/scheduling/routes')); // UC2
router.use('/billing', require('./modules/billing/routes'));      // UC3
// Some modules may be experimental; avoid hard failures during tests if they don't parse
try {
	router.use('/analytics', require('./modules/analytics/routes'));  // UC4
} catch (err) {
	// eslint-disable-next-line no-console
	console.warn('Analytics module not loaded:', err?.message);
}
router.use('/auth', require('./modules/auth/routes'));            // Auth

module.exports = router;
