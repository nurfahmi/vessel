const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const c = require('../controllers/kplerController');

router.get('/', isAuthenticated, c.index);

// API sync routes
router.post('/api/test', isAuthenticated, c.testApi);
router.post('/api/set-token', isAuthenticated, c.setToken);
router.post('/api/sync-single', isAuthenticated, c.syncSingle);
router.post('/api/sync-all', isAuthenticated, c.syncAllVessels);
router.get('/api/sync-status', isAuthenticated, c.syncStatus);
router.post('/api/enrich', isAuthenticated, c.enrichAll);
router.post('/api/map-vessel', isAuthenticated, c.mapVessel);
router.post('/api/bulk-map', isAuthenticated, c.bulkMap);
router.get('/api/unmapped', isAuthenticated, c.unmapped);
router.post('/api/fetch-preview/:id', isAuthenticated, c.fetchPreview);

// Reset enrichment so next sync re-enriches all
router.post('/api/reset-enrichment', isAuthenticated, async (req, res) => {
  const db = require('../config/database');
  const [r] = await db.query("UPDATE kpler_vessels SET enriched_at = NULL WHERE status != 'Under Construction'");
  res.json({ reset: r.affectedRows });
});

module.exports = router;
