const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const db = require('../config/database');
const etaCalc = require('../services/etaCalculatorService');

router.get('/', isAuthenticated, async (req, res) => {
  try {
    const [entries] = await db.query(`
      SELECT t.id, v.name, v.kpler_vessel_id,
             v.us_trade, v.chinese_built, v.panamax, v.scrubber_df, v.deck_tank,
             kv.cbm, kv.built_year, kv.state, kv.flag, kv.is_ethylene_capable,
             kv.controller, kv.vessel_availability,
             kv.next_dest_name, kv.next_dest_zone, kv.next_dest_eta, kv.ais_destination, kv.ais_eta,
             kv.cargo_products, kv.current_volume, kv.beam,
             kv.charter_charterer, kv.last_port, kv.last_port_country,
             kv.is_floating_storage, kv.position_time,
             kv.next_forecast_load, kv.next_forecast_load_zone,
             t.position,
             COALESCE(t.open_from, kv.open_from) as open_from,
             COALESCE(t.open_to, kv.next_forecast_load, kv.open_to) as open_to,
             t.notes, t.next_loading, t.current_voyage
      FROM tracker_entries t
      JOIN vessels v ON t.vessel_id = v.id
      LEFT JOIN kpler_vessels kv ON v.kpler_vessel_id = kv.kpler_id
      ORDER BY COALESCE(t.open_from, kv.open_from) ASC
    `);

    // Get destinations for ETA columns
    const [destinations] = await db.query('SELECT * FROM destinations ORDER BY sort_order');

    // Build transit lookup
    const [transitRows] = await db.query(
      `SELECT t.from_position, d.\`key\` as dest_key, d.short_label, t.transit_days 
       FROM transit_times t JOIN destinations d ON t.destination_id = d.id`
    );
    const transitMap = {};
    const loadPortTransit = {}; // "loads X" → [{dest, days}]
    transitRows.forEach(r => {
      transitMap[`${r.from_position.toLowerCase().trim()}|${r.dest_key}`] = parseFloat(r.transit_days);
      // Build load port transit map
      if (r.from_position.startsWith('loads ')) {
        const loadKey = r.from_position.toLowerCase().trim();
        if (!loadPortTransit[loadKey]) loadPortTransit[loadKey] = [];
        if (parseFloat(r.transit_days) > 0) {
          loadPortTransit[loadKey].push({ dest: r.short_label, days: parseFloat(r.transit_days) });
        }
      }
    });

    // Load discharge settings from DB
    const [dischargeRows] = await db.query('SELECT area_name, discharge_days FROM discharge_settings');
    const dischargeMap = {};
    dischargeRows.forEach(r => {
      dischargeMap[r.area_name.toLowerCase().trim()] = r.discharge_days;
    });
    const dischargeDays = (zone) => {
      if (!zone) return 4;
      const z = zone.toLowerCase().trim();
      if (dischargeMap[z] !== undefined) return dischargeMap[z];
      // Fuzzy: check if zone contains any key
      for (const [k, v] of Object.entries(dischargeMap)) {
        if (z.includes(k) || k.includes(z)) return v;
      }
      return 4; // default
    };

    // Load port_areas mapping (broker's data from /voyage)
    const [portAreas] = await db.query('SELECT location_name, area FROM port_areas');
    const portAreaMap = {};
    portAreas.forEach(pa => {
      portAreaMap[pa.location_name.toLowerCase().trim()] = pa.area;
    });

    // Load port_aliases
    const [portAliases] = await db.query('SELECT alias_name, canonical_name FROM port_aliases');
    const aliasMap = {};
    portAliases.forEach(a => {
      aliasMap[a.alias_name.toLowerCase().trim()] = a.canonical_name;
    });

    // Parse area string → { position, extraDays }
    const parseArea = (area) => {
      if (!area) return { position: null, extraDays: 0 };
      // "Korea+3" or "Japan + 6" or "Indo + 4" (position+days format)
      const m2 = area.match(/^([A-Za-z][A-Za-z ]*?)\s*\+\s*(\d+)/);
      if (m2) return { position: m2[1].trim(), extraDays: parseInt(m2[2]) };
      // "+14 days to/open Far East" (days+position format)
      const m1 = area.match(/^\+(\d+)\s*(?:days?)?\s*(?:to|open)?\s+(.+)/i);
      if (m1) return { position: m1[2].trim(), extraDays: parseInt(m1[1]) };
      // "loads AG", "loads USG" etc
      if (area.startsWith('loads ')) return { position: area, extraDays: 0 };
      // Plain area: "Far East", "Japan", "AG"
      return { position: area, extraDays: 0 };
    };

    // Resolve next_dest → area using port_areas + aliases
    const resolveArea = (nextDest) => {
      const key = nextDest.toLowerCase().trim();
      // 1. Direct port_areas match
      if (portAreaMap[key]) return portAreaMap[key];
      // 2. Alias → canonical → port_areas
      const canonical = aliasMap[key];
      if (canonical && portAreaMap[canonical.toLowerCase().trim()]) {
        return portAreaMap[canonical.toLowerCase().trim()];
      }
      return null;
    };

    // Calculate open_from/to and ETAs for each vessel
    // Transit zones: these are waypoints, not final destinations
    const transitZones = new Set(['panama', 'suez', 'gibraltar', 'cape', 'singapore']);

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

        if (isTransit && aisDest) {
          // Transit zone — AIS destination tells us the real target
          area = resolveArea(aisDest);
          usedDest = aisDest;
          e._destSource = 'smart'; // zone was transit, used AIS to determine real position
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

      // Use auto-resolved position from port_areas (fallback to tracker manual position)
      const resolvedPos = (e._open_position || e.position || '').toLowerCase().trim();

      const etas = {};
      destinations.forEach(d => {
        const key = `${resolvedPos}|${d.key}`;
        const days = transitMap[key];
        if (days !== undefined && e.open_from) {
          const from = new Date(e.open_from);
          const to = e.open_to ? new Date(e.open_to) : from;
          const eta1 = new Date(from.getTime() + days * 86400000);
          const eta2 = new Date(to.getTime() + days * 86400000);
          etas[d.key] = { eta1, eta2, days };
        }
      });
      return { ...e, etas };
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

// Update position for a vessel (saves to tracker_entries)
router.put('/position/:trackerId', isAuthenticated, async (req, res) => {
  try {
    const { position } = req.body;
    await db.query('UPDATE tracker_entries SET position = ? WHERE id = ?', [position, req.params.trackerId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update discharge days for an area (affects all vessels in that area)
router.put('/discharge/:area', isAuthenticated, async (req, res) => {
  try {
    const { days } = req.body;
    const area = decodeURIComponent(req.params.area);
    await db.query('INSERT INTO discharge_settings (area_name, discharge_days) VALUES (?, ?) ON DUPLICATE KEY UPDATE discharge_days = ?',
      [area, parseInt(days), parseInt(days)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Excel export
router.get('/export', isAuthenticated, async (req, res) => {
  try {
    const XLSX = require('xlsx');

    const [entries] = await db.query(`
      SELECT t.id, v.name, v.kpler_vessel_id,
             v.us_trade, v.chinese_built, v.panamax, v.scrubber_df, v.deck_tank,
             kv.cbm, kv.built_year, kv.state, kv.flag, kv.is_ethylene_capable,
             kv.controller, kv.ais_destination, kv.ais_eta,
             kv.vessel_availability, kv.next_dest_name, kv.beam,
             t.position, t.open_from, t.open_to, t.notes, t.laden_v_cape,
             t.next_loading, t.current_voyage
      FROM tracker_entries t
      JOIN vessels v ON t.vessel_id = v.id
      LEFT JOIN kpler_vessels kv ON v.kpler_vessel_id = kv.kpler_id
      WHERE t.position IS NOT NULL AND t.position != ''
      ORDER BY t.open_from ASC
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

    // Build rows
    const header = ['#', 'Vessel', 'CBM', 'BLT', 'US', 'CN', 'PMAX',
                    'Controller', 'Charterer', 'State', 'Cargo', 'Position', 'Next Dest',
                    'Status', 'Open From', 'Open To',
                    ...destinations.map(d => `ETA ${d.short_label}`), 'Notes'];

    const rows = entries.map((e, i) => {
      const etas = {};
      destinations.forEach(d => {
        const key = `${(e.position || '').toLowerCase().trim()}|${d.key}`;
        const days = transitMap[key];
        if (days !== undefined && e.open_from) {
          const from = new Date(e.open_from);
          const to = e.open_to ? new Date(e.open_to) : from;
          const eta1 = new Date(from.getTime() + days * 86400000);
          const eta2 = new Date(to.getTime() + days * 86400000);
          const d1 = eta1.getDate().toString().padStart(2, '0');
          const d2 = eta2.getDate().toString().padStart(2, '0');
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const mon = months[eta2.getMonth()];
          etas[d.key] = d1 === d2 ? `${d1} ${mon}` : `${d1}-${d2} ${mon}`;
        }
      });

      const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'}) : '';

      return [
        i + 1, e.name, e.cbm || '', e.built_year || '',
        e.us_trade ? 'Y' : '', e.chinese_built ? 'Y' : '', e.panamax ? 'Y' : '',
        e.controller || '', e.charter_charterer || '',
        e.state || '', e.cargo_products || '', e.position || '', e.next_dest_name || '',
        e.vessel_availability || '',
        fmtDate(e.open_from), fmtDate(e.open_to),
        ...destinations.map(d => etas[d.key] || ''),
        e.notes || e.current_voyage || ''
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

    // Column widths
    ws['!cols'] = [
      {wch:4}, {wch:22}, {wch:8}, {wch:5}, {wch:3}, {wch:3}, {wch:5}, {wch:10}, {wch:5},
      {wch:18}, {wch:8}, {wch:20}, {wch:8}, {wch:12}, {wch:12},
      ...destinations.map(() => ({wch:10})), {wch:30}
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
