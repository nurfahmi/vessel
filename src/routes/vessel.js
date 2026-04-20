const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const c = require('../controllers/vesselController');
router.get('/', isAuthenticated, c.index);
router.post('/', isAuthenticated, c.create);
router.put('/:id', isAuthenticated, c.update);
router.delete('/:id', isAuthenticated, c.delete);
router.get('/api/search', isAuthenticated, c.search);
router.post('/api/toggle-tracked/:id', isAuthenticated, async (req, res) => {
  const db = require('../config/database');
  const [row] = await db.query('SELECT tracked FROM vessels WHERE id = ?', [req.params.id]);
  if (!row.length) return res.status(404).json({ error: 'Not found' });
  const newVal = row[0].tracked ? 0 : 1;
  await db.query('UPDATE vessels SET tracked = ? WHERE id = ?', [newVal, req.params.id]);
  res.json({ tracked: newVal });
});
module.exports = router;
