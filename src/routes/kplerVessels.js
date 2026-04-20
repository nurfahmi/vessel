const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const db = require('../config/database');
const kplerApi = require('../services/kplerApiService');

// Position dropdown options (from spreadsheet)
const POSITION_OPTIONS = [
  'AG','Balboa','Cape ballast','Cape laden','Caribs','Cayman','ECI','East China',
  'East Med','Eu','Far East','Galle','Gibraltar','Honolulu','Indo','Japan','Korea',
  'Malaysia laden','Mexico','Mohammedia','Monteverde','North China','Ocoa',
  'Philippines','Port Louis ballast','Port Louis laden','Richards Bay',
  'Singapore ballast','Singapore laden','South China','Suape','Suez','Taiwan',
  'Tanzania','Thailand','Turkey','USG','Vietnam','WAF','WCI',
  'loads AG','loads MH','loads USG','loads WAF'
];

/**
 * Auto-resolve position from area (based on spreadsheet patterns)
 */
function resolvePosition(area, state) {
  if (!area || area === 'No AIS') return null;
  const a = area.trim();

  // Direct area → position mappings (most common from spreadsheet)
  const map = {
    'USG': 'loads USG',
    'AG': 'loads AG',
    'WAF': 'loads WAF',
    'Panama': 'loads USG',
    'Cape (as proxy)': 'loads USG',
    'Gibraltar': 'Gibraltar',
    'Caribs': 'Caribs',
    'Cayman': 'Cayman',
    'Mexico': 'Mexico',
    'Ocoa': 'Ocoa',
    'East Med': 'East Med',
    'Richards Bay': 'Richards Bay',
  };
  if (map[a]) return map[a];

  // Pattern: "AreaName + N" → strip suffix, use base as position
  const plusMatch = a.match(/^(.+?)\s*[\+\-]\s*\d/);
  if (plusMatch) {
    const base = plusMatch[1].trim();
    // Check if base matches a position option
    const found = POSITION_OPTIONS.find(p => p.toLowerCase() === base.toLowerCase());
    if (found) return found;
  }

  // Pattern: "+N days to AreaName"
  const daysTo = a.match(/^\+?\d+\s*days?\s*(?:to|open)\s+(.+)/i);
  if (daysTo) return daysTo[1].trim();

  // Pattern: "loads X"
  if (a.startsWith('loads ')) return a;

  // Pattern: "Singapore" → laden/ballast based on state
  if (a === 'Singapore') return state === 'loaded' ? 'Singapore laden' : 'Singapore ballast';
  if (a === 'Port Louis') return state === 'loaded' ? 'Port Louis laden' : 'Port Louis ballast';

  // Pattern: area contains known position name
  const known = POSITION_OPTIONS.find(p => a.toLowerCase().includes(p.toLowerCase()) && p.length > 2);
  if (known) return known;

  return null;
}

// Panama Canal coordinates
const PANAMA_LAT = 9.0, PANAMA_LON = -79.5;

// Haversine distance in nautical miles
function haversineNM(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // Earth radius in NM
  const dLat = (lat2-lat1) * Math.PI/180, dLon = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// GET /kpler-vessels/panama - Panama Canal transit view
router.get('/panama', isAuthenticated, async (req, res) => {
  try {
    const [vessels] = await db.query(`
      SELECT f.*, d.last_port_zone AS enriched_port_zone,
             d.last_port_arrival AS enriched_arrival, d.last_port_departure AS enriched_departure
      FROM kpler_fleet f
      LEFT JOIN kpler_vessel_details d ON f.kpler_id = d.kpler_id
      WHERE (f.next_dest_zone LIKE '%Panama%' OR f.next_dest_zone LIKE '%Balboa%' OR f.next_dest_zone LIKE '%Cristobal%'
        OR f.next_dest_installation LIKE '%Panama%' OR f.next_dest_installation LIKE '%Balboa%'
        OR d.last_port_zone LIKE '%Panama%' OR d.last_port_zone LIKE '%Balboa%' OR d.last_port_zone LIKE '%Cristobal%'
        OR (f.lat BETWEEN 6 AND 12 AND f.lon BETWEEN -82 AND -77))
        AND f.status = 'Active'
      ORDER BY f.name
    `);

    const atCanal = [], pacificApproach = [], atlanticApproach = [];
    const now = Date.now();

    vessels.forEach(v => {
      const lat = parseFloat(v.lat) || 0;
      const lon = parseFloat(v.lon) || 0;
      const speed = parseFloat(v.speed) || 0;
      const distNM = haversineNM(lat, lon, PANAMA_LAT, PANAMA_LON);

      v._distNM = Math.round(distNM);

      // At canal anchorage: within ~100 NM of Panama Canal entrance
      if (distNM < 100) {
        v._side = lon < -79.6 ? 'Pacific side (Balboa)' : 'Atlantic side (Cristobal)';
        v._status = speed < 2 ? 'Anchored/Waiting' : 'Transiting';

        // Wait days: only if enriched last_port_zone is Panama-area
        const epz = (v.enriched_port_zone || '').toLowerCase();
        if (epz.includes('panama') || epz.includes('balboa') || epz.includes('cristobal')) {
          if (v.enriched_arrival) {
            v._arrivalAtCanal = v.enriched_arrival;
            v._waitDays = Math.floor((now - new Date(v.enriched_arrival).getTime()) / 86400000);
          }
        } else if (v.enriched_departure) {
          // Last port was elsewhere — show departure from previous port
          v._fromPort = v.enriched_port_zone;
          v._departedPrevPort = v.enriched_departure;
        }
        atCanal.push(v);
      } else if (lon < PANAMA_LON || lon > 0) {
        // Pacific approach: west of Panama OR East Asia (crossing Pacific)
        v._daysToCanal = speed > 0 ? Math.round(distNM / (speed * 24) * 10) / 10 : null;
        pacificApproach.push(v);
      } else {
        // Atlantic side: east of Panama, negative longitude (Caribbean/Atlantic)
        atlanticApproach.push(v);
      }
    });

    // Sort: at canal by speed (anchored first), approaches by distance
    atCanal.sort((a, b) => (parseFloat(a.speed)||0) - (parseFloat(b.speed)||0));
    pacificApproach.sort((a, b) => (a._distNM) - (b._distNM));
    atlanticApproach.sort((a, b) => (a._distNM) - (b._distNM));

    res.render('kpler-vessels/panama', { vessels, atCanal, pacificApproach, atlanticApproach });
  } catch (err) {
    console.error('Panama view error:', err);
    req.flash('error', 'Failed to load Panama transit');
    res.redirect('/kpler-vessels');
  }
});

// GET /kpler-vessels - Fleet list
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const q = req.query.q || '';
    const state = req.query.state || '';
    const status = req.query.status || '';
    const ais = req.query.ais || '';

    let where = ['1=1'];
    let params = [];

    if (q) { where.push('(f.name LIKE ? OR f.imo LIKE ? OR f.mmsi LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (state) { where.push('f.state = ?'); params.push(state); }
    if (status) { where.push('f.status = ?'); params.push(status); }
    if (ais === 'noais') { where.push('(f.lat IS NULL AND f.speed IS NULL)'); }
    if (ais === 'hasais') { where.push('(f.lat IS NOT NULL OR f.speed IS NOT NULL)'); }

    const [vessels] = await db.query(
      `SELECT f.*, d.last_port_zone AS enriched_port_zone, d.last_port_install AS enriched_port_install,
              d.last_port_departure AS enriched_departure, d.last_port_availability AS enriched_availability,
              d.position_snapshot AS enriched_snapshot,
              d.fetched_at AS enriched_at
       FROM kpler_fleet f
       LEFT JOIN kpler_vessel_details d ON f.kpler_id = d.kpler_id
       WHERE ${where.join(' AND ')} 
       ORDER BY CASE 
         WHEN f.status = 'Under Construction' THEN 2 
         WHEN f.controller IS NULL OR f.controller = '' OR f.controller = 'Unknown' THEN 1 
         ELSE 0 
       END, f.name`,
      params
    );

    // Load port_areas for area resolution
    const [portAreas] = await db.query('SELECT location_name, area FROM port_areas');
    const areaMap = {};
    portAreas.forEach(r => { areaMap[r.location_name.toLowerCase().trim()] = r.area; });

    // Resolve area + AIS location + auto-position for each vessel
    vessels.forEach(v => {
      const install = (v.next_dest_installation || '').trim();
      const zone = (v.next_dest_zone || '').trim();
      v._aisLocation = install || zone || '';
      v._area = areaMap[install.toLowerCase()] || areaMap[zone.toLowerCase()] || '';
      if (!v._aisLocation) {
        // No AIS: use enriched data from kpler_vessel_details
        const epz = (v.enriched_port_zone || v.enriched_port_install || '').trim();
        if (epz) {
          v._aisLocation = epz;
          v._area = areaMap[epz.toLowerCase()] || 'No AIS';
          // Use enriched departure date if no next_dest_eta
          if (!v.next_dest_eta && v.enriched_departure) v._enrichedDate = v.enriched_departure;
          if (v.enriched_availability) v._availability = v.enriched_availability;
        } else {
          v._area = 'No AIS';
        }
        // Use enriched speed if fleet speed is null
        if (!v.speed && v.enriched_snapshot) {
          try {
            const snap = typeof v.enriched_snapshot === 'string' ? JSON.parse(v.enriched_snapshot) : v.enriched_snapshot;
            if (snap?.speed) v._enrichedSpeed = snap.speed;
          } catch(e) {}
        }
      }
      v._enriched = !!v.enriched_at;
      // Auto-resolve position if not manually set
      v._autoPosition = resolvePosition(v._area, v.state);
      v._position = v.position || v._autoPosition || '';
    });

    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(status='Active' AND lat IS NULL AND speed IS NULL) as no_ais,
        SUM(state='ballast') as ballast,
        SUM(state='loaded') as loaded,
        SUM(status='Active') as active,
        SUM(status='Under Construction') as under_construction,
        SUM(is_floating_storage=1) as floating_storage
      FROM kpler_fleet
    `);

    const states = [...new Set(vessels.map(v => v.state).filter(Boolean))].sort();
    const statuses = [...new Set(vessels.map(v => v.status).filter(Boolean))].sort();

    res.render('kpler-vessels/index', {
      vessels, stats: stats[0], states, statuses,
      filter: { q, state, status, ais },
      positionOptions: POSITION_OPTIONS
    });
  } catch (err) {
    console.error('Kpler vessels error:', err);
    req.flash('error', 'Failed to load vessels');
    res.redirect('/dashboard');
  }
});

// POST sync fleet from Kpler API
router.post('/api/sync-fleet', isAuthenticated, async (req, res) => {
  try {
    const results = await kplerApi.syncFleet();
    res.json(results);
  } catch (err) {
    console.error('Fleet sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST fetch vessel detail from Kpler API
router.post('/api/fetch-detail/:kplerId', isAuthenticated, async (req, res) => {
  try {
    const data = await kplerApi.fetchVesselDetail(parseInt(req.params.kplerId));
    res.json({ ok: true, name: data.name });
  } catch (err) {
    console.error('Detail fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET enrich all vessels via SSE (stream progress)
router.get('/api/enrich-all', isAuthenticated, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const [fleet] = await db.query(`
      SELECT f.kpler_id, f.name, d.fetched_at
      FROM kpler_fleet f
      LEFT JOIN kpler_vessel_details d ON f.kpler_id = d.kpler_id
      WHERE f.status = 'Active' ORDER BY f.name
    `);
    const total = fleet.length;
    let enriched = 0, failed = 0, skipped = 0;
    const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000);

    res.write(`data: ${JSON.stringify({ type: 'start', total })}\n\n`);

    for (const v of fleet) {
      // Skip if enriched less than 12 hours ago
      if (v.fetched_at && new Date(v.fetched_at).getTime() > twelveHoursAgo) {
        skipped++;
        res.write(`data: ${JSON.stringify({ type: 'progress', name: v.name, enriched, failed, skipped, total, skip: true })}\n\n`);
        continue;
      }
      try {
        await kplerApi.fetchVesselDetail(v.kpler_id);
        enriched++;
        res.write(`data: ${JSON.stringify({ type: 'progress', name: v.name, enriched, failed, skipped, total })}\n\n`);
      } catch (e) {
        failed++;
        res.write(`data: ${JSON.stringify({ type: 'progress', name: v.name, enriched, failed, skipped, total, error: e.message?.substring(0, 60) })}\n\n`);
      }
      await new Promise(r => setTimeout(r, 200));
    }

    res.write(`data: ${JSON.stringify({ type: 'done', enriched, failed, skipped, total })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
  }
  res.end();
});

// POST toggle tracked
router.post('/api/toggle-tracked/:id', isAuthenticated, async (req, res) => {
  const [row] = await db.query('SELECT tracked FROM kpler_fleet WHERE id = ?', [req.params.id]);
  if (!row.length) return res.status(404).json({ error: 'Not found' });
  const newVal = row[0].tracked ? 0 : 1;
  await db.query('UPDATE kpler_fleet SET tracked = ? WHERE id = ?', [newVal, req.params.id]);
  res.json({ tracked: newVal });
});

// POST save position (manual override)
router.post('/api/save-position/:id', isAuthenticated, async (req, res) => {
  const { position } = req.body;
  await db.query('UPDATE kpler_fleet SET position = ? WHERE id = ?', [position || null, req.params.id]);
  res.json({ ok: true, position });
});

// Save position by kpler_id (used by availability page)
router.post('/api/save-position-by-kpler/:kplerId', isAuthenticated, async (req, res) => {
  const { position } = req.body;
  await db.query('UPDATE kpler_fleet SET position = ? WHERE kpler_id = ?', [position || null, req.params.kplerId]);
  res.json({ ok: true, position });
});

// POST bulk toggle tracked
router.post('/api/bulk-track', isAuthenticated, async (req, res) => {
  const { ids, tracked } = req.body;
  if (!ids || !ids.length) return res.json({ ok: false });
  await db.query('UPDATE kpler_fleet SET tracked = ? WHERE id IN (?)', [tracked ? 1 : 0, ids]);
  res.json({ ok: true, count: ids.length, tracked: !!tracked });
});

// GET vessel detail page (same as vessel-intel)
router.get('/:kplerId', isAuthenticated, async (req, res) => {
  const kplerId = parseInt(req.params.kplerId);
  const analysisController = require('../controllers/vesselAnalysisController');
  // Reuse vessel-intel logic
  req.params.kpler_id = kplerId;
  return analysisController.show(req, res);
});

module.exports = router;
