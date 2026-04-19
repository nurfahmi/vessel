const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const c = require('../controllers/dashboardController');
router.get('/', isAuthenticated, c.index);
module.exports = router;
