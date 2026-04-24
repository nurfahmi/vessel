const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const db = require('../config/database');

router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Get excluded controllers (graceful if table not yet migrated)
    let excludedSet = new Set();
    try {
      const [excludedRows] = await db.query('SELECT controller_name FROM excluded_controllers');
      excludedSet = new Set(excludedRows.map(r => r.controller_name.toLowerCase().trim()));
    } catch(e) { /* table may not exist yet */ }

    // Pull ALL active vessels from kpler_fleet (primary synced data)
    const [entries] = await db.query(`
      SELECT f.kpler_id, f.name, f.capacity_cbm as cbm, f.build_year as built_year, 
             f.state, f.flag_name as flag,
             f.is_ethylene_capable, f.is_floating_storage,
             f.controller, f.manual_operator, f.tracked,
             d.vessel_availability,
             d.operators as detail_operators,
             f.next_dest_installation as next_dest_name, f.next_dest_zone, f.next_dest_eta, 
             f.ais_destination, f.ais_eta,
             f.cargo_products, f.cargo_volume as current_volume,
             d.last_port_zone AS charter_charterer,
             COALESCE(NULLIF(f.last_port,''), d.last_port_install) as last_port, 
             COALESCE(f.last_port_country, d.last_port_zone) as last_port_country,
             f.position_time,
             f.loaded, f.lat, f.lon, f.speed, f.draught,
             d.last_port_departure AS position_zones,
             f.position as fleet_position, f.auto_position,
             f.avail_notes, f.avail_status, f.avail_voyage,
             f.manual_open_from, f.manual_open_to,
             d.beam,
             v.us_trade, v.chinese_built, v.panamax, v.scrubber_df, v.deck_tank,
             v.kpler_vessel_id
      FROM kpler_fleet f
      LEFT JOIN kpler_vessel_details d ON f.kpler_id = d.kpler_id
      LEFT JOIN vessels v ON v.kpler_vessel_id = f.kpler_id
      WHERE f.status = 'Active'${req.query.all !== '1' ? ' AND f.tracked = 1' : ''}
      ORDER BY f.name
    `);

    // Use the same ETA formula as the tracker
    const { buildLookupMap, resolveTransitDays } = require('../services/etaCalculatorService');
    const lookup = await buildLookupMap();
    const destinations = lookup.destinations;

    // Discharge settings
    const [dischargeRows] = await db.query('SELECT area_name, discharge_days FROM discharge_settings');
    const dischargeMap = {};
    dischargeRows.forEach(r => { dischargeMap[r.area_name.toLowerCase().trim()] = r.discharge_days; });

    // Load destination aliases for AIS code mapping
    let destAliasMap = {};
    try {
      const [aliasRows] = await db.query('SELECT ais_code, display_name FROM destination_aliases');
      aliasRows.forEach(r => { destAliasMap[r.ais_code.toUpperCase().trim()] = r.display_name; });
    } catch(e) { /* table may not exist yet */ }

    // Calculate open_from/to and ETAs for each vessel
    const vessels = entries
      .filter(e => {
        // Filter out excluded/sanctioned controllers
        const ctrl = (e.controller || '').toLowerCase().trim();
        return !excludedSet.has(ctrl);
      })
      .map(e => {
      const eta = e.next_dest_eta || e.ais_eta;

      // Use manual position from fleet page, or auto-resolved from fleet page
      const pos = (e.fleet_position || e.auto_position || '').trim();

      // Use manual dates if set, otherwise auto-calculate
      if (e.manual_open_from) {
        e.open_from = new Date(e.manual_open_from);
        e.open_to = e.manual_open_to ? new Date(e.manual_open_to) : new Date(e.open_from.getTime() + 86400000);
      } else if (eta && pos) {
        const dDays = dischargeMap[pos.toLowerCase()] || 0;
        if (e.state === 'loaded') {
          e.open_from = new Date(new Date(eta).getTime() + dDays * 86400000);
          e.open_to = new Date(e.open_from.getTime() + 86400000);
        } else {
          e.open_from = new Date(new Date(eta).getTime());
          e.open_to = new Date(e.open_from.getTime() + 86400000);
        }
      }

      // Calculate ETAs using tracker's formula
      const etas = {};
      destinations.forEach(d => {
        const days = resolveTransitDays(pos, d.key, lookup);
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
      e._notes = e.avail_notes || availNotes || '';

      // Auto-set status if not manually set
      if (!e.avail_status && availStatus === 'Potentially Open') {
        e.avail_status = 'Open';
      }

      // Resolve operator: manual_operator → detail_operators JSON → controller
      let operator = e.manual_operator || null;
      if (!operator && e.detail_operators) {
        try {
          const ops = typeof e.detail_operators === 'string' ? JSON.parse(e.detail_operators) : e.detail_operators;
          if (Array.isArray(ops) && ops.length > 0) operator = ops[0].name;
        } catch(ex) {}
      }
      if (!operator) operator = e.controller || '';

      // Resolve AIS destination display name
      const aisRaw = (e.ais_destination || '').trim().toUpperCase();
      const destDisplay = destAliasMap[aisRaw] || null;

      // Discharge days for this vessel's open position
      const dDays = pos ? (dischargeMap[pos.toLowerCase()] || 0) : 0;

      return {
        ...e, etas, position: pos,
        _isManualPos: !!e.fleet_position,
        _dischargeDays: dDays || null,
        _open_position: pos,
        _operator: operator,
        _isManualOperator: !!e.manual_operator,
        _destDisplay: destDisplay,
      };
    });

    // Filter options
    const controllers = [...new Set(entries.map(e => e.controller).filter(Boolean))].sort();

    // Same position options as kpler-vessels
    const positionOptions = [
      'AG','Balboa','Cape ballast','Cape laden','Caribs','Cayman','ECI','East China',
      'East Med','Eu','Far East','Galle','Gibraltar','Honolulu','Indo','Japan','Korea',
      'Malaysia laden','Mexico','Mohammedia','Monteverde','North China','Ocoa',
      'Philippines','Port Louis ballast','Port Louis laden','Richards Bay',
      'Singapore ballast','Singapore laden','South China','Suape','Suez','Taiwan',
      'Tanzania','Thailand','Turkey','USG','Vietnam','WAF','WCI',
      'loads AG','loads MH','loads USG','loads WAF'
    ];

    // Build transit lookup JSON for client-side ETA recalc
    const transitLookup = {};
    for (const d of destinations) {
      for (const pos of positionOptions) {
        const days = resolveTransitDays(pos, d.key, lookup);
        if (days !== null) {
          transitLookup[`${pos}|${d.key}`] = days;
        }
      }
    }

    const fullScreen = req.query.full === '1';
    const renderOpts = { vessels, destinations, controllers, positionOptions, dischargeMap, transitLookup: JSON.stringify(transitLookup), filter: req.query.controller || '', showAll: req.query.all === '1', fullScreen };
    if (fullScreen) renderOpts.layout = 'layout/fullscreen';
    res.render('availability/index', renderOpts);
  } catch (err) {
    console.error('Availability error:', err);
    req.flash('error', 'Failed to load availability');
    res.redirect('/dashboard');
  }
});

// Full-screen standalone table (no dashboard layout)
router.get('/full', isAuthenticated, async (req, res) => {
  // Forward all query params and re-run main logic
  req.query._layout = 'fullscreen';
  // Call the main handler by redirecting internally
  res.redirect('/availability?full=1' + (req.query.all === '1' ? '&all=1' : ''));
});

// Save availability notes inline
router.post('/api/save-avail-field', isAuthenticated, async (req, res) => {
  const { kpler_id, field, value } = req.body;
  const allowed = ['avail_notes', 'avail_status', 'avail_voyage', 'manual_open_from', 'manual_open_to', 'manual_operator'];
  if (!allowed.includes(field)) return res.status(400).json({ error: 'Invalid field' });
  await db.query(`UPDATE kpler_fleet SET ${field} = ? WHERE kpler_id = ?`, [value || null, kpler_id]);
  res.json({ ok: true });
});

// Save discharge days inline
router.post('/api/save-discharge', isAuthenticated, async (req, res) => {
  const { area, days } = req.body;
  await db.query('INSERT INTO discharge_settings (area_name, discharge_days) VALUES (?, ?) ON DUPLICATE KEY UPDATE discharge_days = ?', [area, days, days]);
  res.json({ ok: true, area, days: parseInt(days) });
});

// Save notes inline (legacy - kept for compat)
router.post('/api/save-notes', isAuthenticated, async (req, res) => {
  res.json({ ok: true });
});

// Excel export
router.get('/export', isAuthenticated, async (req, res) => {
  try {
    const XLSX = require('xlsx');

    const [entries] = await db.query(`
      SELECT f.kpler_id, f.name, f.capacity_cbm as cbm, f.build_year as built_year, 
             f.state, f.flag_name as flag,
             f.is_ethylene_capable, f.controller, f.manual_operator, f.ais_destination, f.ais_eta,
             d.vessel_availability, d.operators as detail_operators,
             f.next_dest_installation as next_dest_name,
             f.avail_notes, f.avail_status, f.avail_voyage,
             v.us_trade, v.chinese_built, v.panamax, v.scrubber_df, v.deck_tank
      FROM kpler_fleet f
      LEFT JOIN kpler_vessel_details d ON f.kpler_id = d.kpler_id
      LEFT JOIN vessels v ON v.kpler_vessel_id = f.kpler_id
      WHERE f.status = 'Active'
      ORDER BY f.name
    `);

    // Resolve operator for each entry
    entries.forEach(e => {
      let op = e.manual_operator || null;
      if (!op && e.detail_operators) {
        try {
          const ops = typeof e.detail_operators === 'string' ? JSON.parse(e.detail_operators) : e.detail_operators;
          if (Array.isArray(ops) && ops.length > 0) op = ops[0].name;
        } catch(ex) {}
      }
      e._operator = op || e.controller || '';
    });

    const [destinations] = await db.query('SELECT * FROM destinations ORDER BY sort_order');
    const [transitRows] = await db.query(
      `SELECT t.from_position, d.\`key\` as dest_key, d.short_label, t.transit_days 
       FROM transit_times t JOIN destinations d ON t.destination_id = d.id`
    );
    const transitMap = {};
    transitRows.forEach(r => {
      transitMap[`${r.from_position.toLowerCase().trim()}|${r.dest_key}`] = parseFloat(r.transit_days);
    });

    const header = ['#', 'Vessel', 'Operator', 'CBM', 'BLT', 'US', 'CN', 'PMAX', 'Scrubber/DF', 'DeckTank',
                    'State', 'Status', 'Open From', 'Open To', 'Notes', 'Voyage',
                    ...destinations.map(d => `ETA ${d.short_label}`)];

    const rows = entries.map((e, i) => {
      const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'}) : '';

      return [
        i + 1, e.name, e._operator, e.cbm || '', e.built_year || '',
        e.us_trade ? 'Y' : '', e.chinese_built ? 'Y' : '', e.panamax ? 'Y' : '',
        e.scrubber_df || '', e.deck_tank ? 'Y' : '',
        e.state || '', e.avail_status || '',
        fmtDate(e.open_from), fmtDate(e.open_to),
        e.avail_notes || '', e.avail_voyage || '',
        ...destinations.map(() => '')
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [
      {wch:4}, {wch:22}, {wch:18}, {wch:8}, {wch:5}, {wch:3}, {wch:3}, {wch:5}, {wch:10}, {wch:5},
      {wch:8}, {wch:10}, {wch:12}, {wch:12}, {wch:20}, {wch:15},
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
