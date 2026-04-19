const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const c = require('../controllers/restrictedController');
router.get('/', isAuthenticated, c.index);
router.post('/', isAuthenticated, c.create);
router.delete('/:id', isAuthenticated, c.delete);
module.exports = router;
