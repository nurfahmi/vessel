const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const c = require('../controllers/sorterController');
router.get('/', isAuthenticated, c.index);
module.exports = router;
