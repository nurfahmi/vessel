const router = require('express').Router();
const c = require('../controllers/authController');

router.get('/login', c.loginPage);
router.post('/login', c.login);
router.get('/setup', c.setupPage);
router.post('/setup', c.setup);
router.get('/logout', c.logout);

module.exports = router;
