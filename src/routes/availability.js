const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const db = require('../config/database');
const etaCalc = require('../services/etaCalculatorService');

router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Get all tracker entries with position + open dates
    const [entries] = await db.query(`
      SELECT t.id, v.name, v.kpler_vessel_id,
             v.us_trade, v.chinese_built, v.panamax, v.scrubber_df, v.deck_tank,
             kv.cbm, kv.built_year, kv.state, kv.flag, kv.is_ethylene_capable,
             kv.controller, kv.ais_destination, kv.ais_eta,
             kv.lat, kv.lon, kv.speed, kv.draught,
             kv.vessel_availability, kv.next_dest_name,
             kv.cargo_products, kv.current_volume, kv.beam,
             t.position, t.open_from, t.open_to, t.notes, t.laden_v_cape,
             t.next_loading, t.current_voyage
      FROM tracker_entries t
      JOIN vessels v ON t.vessel_id = v.id
      LEFT JOIN kpler_vessels kv ON v.kpler_vessel_id = kv.kpler_id
      WHERE t.position IS NOT NULL AND t.position != ''
      ORDER BY t.open_from ASC
    `);

    // Get destinations for ETA columns
    const [destinations] = await db.query('SELECT * FROM destinations ORDER BY sort_order');

    // Build transit lookup
    const [transitRows] = await db.query(
      `SELECT t.from_position, d.\`key\` as dest_key, d.short_label, t.transit_days 
       FROM transit_times t JOIN destinations d ON t.destination_id = d.id`
    );
    const transitMap = {};
    transitRows.forEach(r => {
      transitMap[`${r.from_position.toLowerCase().trim()}|${r.dest_key}`] = parseFloat(r.transit_days);
    });

    // Calculate ETAs for each vessel
    const vessels = entries.map(e => {
      const etas = {};
      destinations.forEach(d => {
        const key = `${(e.position || '').toLowerCase().trim()}|${d.key}`;
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

    res.render('availability/index', { vessels, destinations, controllers, filter: req.query.controller || '' });
  } catch (err) {
    console.error('Availability error:', err);
    req.flash('error', 'Failed to load availability');
    res.redirect('/dashboard');
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
    const header = ['#', 'Vessel', 'CBM', 'BLT', 'US', 'CN', 'PMAX', 'Scrubber/DF', 'DeckTank',
                    'Controller', 'State', 'Position', 'v Cape', 'Open From', 'Open To',
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
        e.scrubber_df || '', e.deck_tank ? 'Y' : '',
        e.controller || '', e.state || '', e.position || '', e.laden_v_cape || '',
        fmtDate(e.open_from), fmtDate(e.open_to),
        ...destinations.map(d => etas[d.key] || ''),
        e.notes || ''
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
