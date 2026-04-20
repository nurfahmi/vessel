const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const db = require('../config/database');

router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Pull ALL active vessels from kpler_fleet (primary synced data)
    const [entries] = await db.query(`
      SELECT f.kpler_id, f.name, f.capacity_cbm as cbm, f.build_year as built_year, 
             f.state, f.flag_name as flag,
             f.is_ethylene_capable, f.is_floating_storage,
             f.controller, 
             d.vessel_availability,
             f.next_dest_installation as next_dest_name, f.next_dest_zone, f.next_dest_eta, 
             f.ais_destination, f.ais_eta,
             f.cargo_products, f.cargo_volume as current_volume,
             d.last_port_zone as charter_charterer,
             f.last_port, f.last_port_country,
             f.position_time,
             f.loaded, f.lat, f.lon, f.speed, f.draught,
             d.last_port_departure as position_zones,
             v.us_trade, v.chinese_built, v.panamax, v.scrubber_df, v.deck_tank,
             v.kpler_vessel_id
      FROM kpler_fleet f
      LEFT JOIN kpler_vessel_details d ON f.kpler_id = d.kpler_id
      LEFT JOIN vessels v ON v.kpler_vessel_id = f.kpler_id
      WHERE f.status = 'Active'
      ORDER BY f.name
    `);

    // Use the same ETA formula as the tracker
    const { buildLookupMap, resolveTransitDays } = require('../services/etaCalculatorService');
    const lookup = await buildLookupMap();
    const destinations = lookup.destinations;

    // Port areas + aliases for resolving AIS destinations
    const [portAreas] = await db.query('SELECT location_name, area FROM port_areas');
    let portAliases = [];
    try { [portAliases] = await db.query('SELECT alias_name, canonical_name FROM port_aliases'); } catch(e) {}
    const areaMap = {};
    portAreas.forEach(r => { areaMap[r.location_name.toLowerCase().trim()] = r.area; });
    portAliases.forEach(r => { areaMap[r.alias_name.toLowerCase().trim()] = r.canonical_name; });

    // Discharge settings
    const [dischargeRows] = await db.query('SELECT area_name, discharge_days FROM discharge_settings');
    const dischargeMap = {};
    dischargeRows.forEach(r => { dischargeMap[r.area_name.toLowerCase().trim()] = r.discharge_days; });

    const resolveArea = (dest) => {
      if (!dest) return null;
      const key = dest.toLowerCase().trim();
      return areaMap[key] || null;
    };

    const parseArea = (area) => {
      if (!area) return { position: null, extraDays: 0 };
      const m1 = area.match(/^(.+?)\+(\d+)/);
      if (m1) return { position: m1[1].trim(), extraDays: parseInt(m1[2]) };
      const m2 = area.match(/^\+(\d+).*?(?:open|to)\s+(.+)/i);
      if (m2) return { position: m2[2].trim(), extraDays: parseInt(m2[1]) };
      return { position: area, extraDays: 0 };
    };

    const dischargeDays = (area) => {
      if (!area) return 0;
      return dischargeMap[area.toLowerCase().trim()] || 0;
    };

    // Transit zones: waypoints, not final destinations
    const transitZones = new Set(['panama', 'suez', 'gibraltar', 'cape', 'singapore']);

    // Calculate open_from/to and ETAs for each vessel
    const vessels = entries.map(e => {
      const zoneDest = (e.next_dest_zone || '').trim();
      const aisDest = (e.ais_destination || '').trim();
      const nextDestName = (e.next_dest_name || '').trim();

      // Smart resolution: zone → check if transit → use AIS for real target
      let area = null;
      let usedDest = '';

      if (zoneDest) {
        const zoneArea = resolveArea(zoneDest);
        const isTransit = transitZones.has((zoneArea || zoneDest).toLowerCase());

        if (isTransit && aisDest && e.state === 'ballast') {
          area = resolveArea(aisDest);
          usedDest = aisDest;
          e._destSource = 'smart';
        } else {
          area = zoneArea;
          usedDest = zoneDest;
          e._destSource = 'zone';
        }
      }

      if (!area && aisDest) { area = resolveArea(aisDest); usedDest = aisDest; e._destSource = 'ais'; }
      if (!area && nextDestName) { area = resolveArea(nextDestName); usedDest = nextDestName; e._destSource = 'kpler'; }
      if (!e._destSource) e._destSource = null;

      e._usedDest = usedDest;
      const eta = e.next_dest_eta || e.ais_eta;

      if (eta && area) {
        const { position, extraDays } = parseArea(area);
        const dDays = dischargeDays(position || area);
        e._resolvedArea = area;
        e._transitDays = extraDays;
        e._dischargeDays = dDays;

        if (e.state === 'loaded') {
          e.open_from = new Date(new Date(eta).getTime() + dDays * 86400000);
          e.open_to = new Date(e.open_from.getTime() + 86400000);
          if (position) e._open_position = position;
        } else if (e.state === 'ballast' && extraDays > 0) {
          e.open_from = new Date(new Date(eta).getTime() + (extraDays + dDays) * 86400000);
          e.open_to = new Date(e.open_from.getTime() + 86400000);
          if (position) e._open_position = position;
        } else if (e.state === 'ballast' && position) {
          e.open_from = new Date(new Date(eta).getTime() + dDays * 86400000);
          e.open_to = new Date(e.open_from.getTime() + 86400000);
          e._open_position = position;
        }
      }

      // Use auto-resolved position from port_areas
      const resolvedPos = e._open_position || '';

      const etas = {};
      destinations.forEach(d => {
        // Use the same resolveTransitDays as tracker (handles aliases, +N, area chain)
        const days = resolveTransitDays(resolvedPos, d.key, lookup);
        if (days !== null && e.open_from) {
          const from = new Date(e.open_from);
          const to = e.open_to ? new Date(e.open_to) : from;
          const eta1 = new Date(from); eta1.setDate(eta1.getDate() + Math.ceil(days));
          const eta2 = new Date(to); eta2.setDate(eta2.getDate() + Math.ceil(days));
          etas[d.key] = { eta1, eta2, days };
        }
      });
      // Parse vessel_availability from JSON
      let availStatus = '';
      let availNotes = '';
      try {
        let avail = e.vessel_availability;
        if (typeof avail === 'string' && avail.startsWith('[')) {
          const arr = JSON.parse(avail);
          if (arr.length > 0) {
            const first = arr.find(a => a.active) || arr[0];
            availNotes = first.comment || '';
            if (first.open) {
              const openDate = new Date(first.open);
              if (openDate <= new Date()) {
                availStatus = 'Potentially Open';
              } else {
                availStatus = 'Open ' + openDate.toLocaleDateString('en-GB', {day:'2-digit', month:'short'});
              }
            }
          }
        } else if (avail && typeof avail === 'string') {
          availStatus = avail;
        }
      } catch(ex) { availStatus = ''; }

      e.vessel_availability = availStatus;
      e._notes = availNotes;

      return { ...e, etas, position: e._open_position || '' };
    });

    // Filter options
    const controllers = [...new Set(entries.map(e => e.controller).filter(Boolean))].sort();

    // Unique positions: from transit_times + port_areas areas
    const [posRows] = await db.query('SELECT DISTINCT from_position as pos FROM transit_times UNION SELECT DISTINCT area as pos FROM port_areas ORDER BY pos');
    const positions = posRows.map(r => r.pos);

    res.render('availability/index', { vessels, destinations, controllers, positions, dischargeMap, filter: req.query.controller || '' });
  } catch (err) {
    console.error('Availability error:', err);
    req.flash('error', 'Failed to load availability');
    res.redirect('/dashboard');
  }
});

// Save discharge days inline
router.post('/api/save-discharge', isAuthenticated, async (req, res) => {
  const { area, days } = req.body;
  await db.query('INSERT INTO discharge_settings (area_name, discharge_days) VALUES (?, ?) ON DUPLICATE KEY UPDATE discharge_days = ?', [area, days, days]);
  res.json({ ok: true });
});

// Save notes inline (now saves to kpler_vessels)
router.post('/api/save-notes', isAuthenticated, async (req, res) => {
  // Notes are view-only for now from kpler data
  res.json({ ok: true });
});

// Excel export
router.get('/export', isAuthenticated, async (req, res) => {
  try {
    const XLSX = require('xlsx');

    const [entries] = await db.query(`
      SELECT f.kpler_id, f.name, f.capacity_cbm as cbm, f.build_year as built_year, 
             f.state, f.flag_name as flag,
             f.is_ethylene_capable, f.controller, f.ais_destination, f.ais_eta,
             d.vessel_availability, f.next_dest_installation as next_dest_name,
             v.us_trade, v.chinese_built, v.panamax, v.scrubber_df, v.deck_tank
      FROM kpler_fleet f
      LEFT JOIN kpler_vessel_details d ON f.kpler_id = d.kpler_id
      LEFT JOIN vessels v ON v.kpler_vessel_id = f.kpler_id
      WHERE f.status = 'Active'
      ORDER BY f.name
    `);

    const [destinations] = await db.query('SELECT * FROM destinations ORDER BY sort_order');
    const [transitRows] = await db.query(
      `SELECT t.from_position, d.\`key\` as dest_key, d.short_label, t.transit_days 
       FROM transit_times t JOIN destinations d ON t.destination_id = d.id`
    );
    const transitMap = {};
    transitRows.forEach(r => {
      transitMap[`${r.from_position.toLowerCase().trim()}|${r.dest_key}`] = parseFloat(r.transit_days);
    });

    const header = ['#', 'Vessel', 'CBM', 'BLT', 'US', 'CN', 'PMAX', 'Scrubber/DF', 'DeckTank',
                    'Controller', 'State', 'Open From', 'Open To',
                    ...destinations.map(d => `ETA ${d.short_label}`)];

    const rows = entries.map((e, i) => {
      const etas = {};
      destinations.forEach(d => {
        // Simple export — no position-based ETA for now
      });

      const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'}) : '';

      return [
        i + 1, e.name, e.cbm || '', e.built_year || '',
        e.us_trade ? 'Y' : '', e.chinese_built ? 'Y' : '', e.panamax ? 'Y' : '',
        e.scrubber_df || '', e.deck_tank ? 'Y' : '',
        e.controller || '', e.state || '',
        fmtDate(e.open_from), fmtDate(e.open_to),
        ...destinations.map(d => etas[d.key] || '')
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [
      {wch:4}, {wch:22}, {wch:8}, {wch:5}, {wch:3}, {wch:3}, {wch:5}, {wch:10}, {wch:5},
      {wch:18}, {wch:8}, {wch:12}, {wch:12},
      ...destinations.map(() => ({wch:10}))
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Availability');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="VLGC_Availability_${date}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('Excel export error:', err);
    req.flash('error', 'Failed to export');
    res.redirect('/availability');
  }
});

module.exports = router;
