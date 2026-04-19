const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const c = require('../controllers/trackerController');

router.get('/', isAuthenticated, c.index);
router.post('/add', isAuthenticated, c.add);
router.put('/update/:id', isAuthenticated, c.update);
router.delete('/:id', isAuthenticated, c.delete);
router.post('/sync-from-vessels', isAuthenticated, c.syncFromVessels);

// Search Kpler vessels for autocomplete
router.get('/api/search-vessels', isAuthenticated, async (req, res) => {
  const db = require('../config/database');
  const q = req.query.q || '';
  if (q.length < 2) return res.json([]);
  const [rows] = await db.query(
    'SELECT kpler_id, name, cbm, status FROM kpler_vessels WHERE name LIKE ? ORDER BY name LIMIT 15',
    [`%${q}%`]
  );
  res.json(rows);
});
// AI-powered position analysis
router.post('/api/ai-position/:id', isAuthenticated, async (req, res) => {
  try {
    const db = require('../config/database');
    const { analyzePosition } = require('../services/aiPositionService');
    const id = req.params.id;
    
    // Get vessel + kpler data for this tracker entry
    const [rows] = await db.query(`
      SELECT te.*, v.name as vessel_name, v.kpler_vessel_id,
        kv.zone_port, kv.zone_country, kv.next_dest_name, kv.ais_destination,
        kv.position as kpler_position, kv.position_detail, kv.state as kpler_state,
        kv.lat as kpler_lat, kv.lon as kpler_lon
      FROM tracker_entries te
      JOIN vessels v ON te.vessel_id = v.id
      LEFT JOIN kpler_vessels kv ON v.kpler_vessel_id = kv.kpler_id
      WHERE te.id = ?
    `, [id]);
    
    if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
    
    const result = await analyzePosition(rows[0]);
    res.json(result);
  } catch (err) {
    console.error('AI position error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
