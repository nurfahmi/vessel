const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const c = require('../controllers/vesselController');
router.get('/', isAuthenticated, c.index);
router.post('/', isAuthenticated, c.create);
router.put('/:id', isAuthenticated, c.update);
router.delete('/:id', isAuthenticated, c.delete);
router.get('/api/search', isAuthenticated, c.search);
module.exports = router;
