const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const c = require('../controllers/vesselAnalysisController');

router.get('/:kpler_id', isAuthenticated, c.show);

module.exports = router;
