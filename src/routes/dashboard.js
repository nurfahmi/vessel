const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const c = require('../controllers/dashboardController');
router.get('/', isAuthenticated, c.index);

// Manual token refresh
router.post('/api/refresh-token', isAuthenticated, async (req, res) => {
  try {
    const { refreshTokenJob } = require('../services/kplerCron');
    await refreshTokenJob();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
