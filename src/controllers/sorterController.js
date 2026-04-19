const TrackerEntry = require('../models/TrackerEntry');
const HighlighterVessel = require('../models/HighlighterVessel');
const { batchCalculateETAs, getDestinations } = require('../services/etaCalculatorService');

// Conditional formatting rules from Excel
const OWNER_HIGHLIGHT_BLUE = ['BW', 'Raffles', 'Helios', 'Neptune', 'Sinogas'];
const POSITION_HIGHLIGHT_GRAY = ['loads USG', 'loads WAF', 'loads Bethioua', 'loads AG', 'loads MH'];

const sorterController = {
  // GET /sorter
  async index(req, res) {
    try {
      const entries = await TrackerEntry.getWithKpler();
      const entriesWithETAs = await batchCalculateETAs(entries);

      // Get highlighter lists
      const highlighters = await HighlighterVessel.getAllGrouped();

      // Sort by open_from date (ascending) — the core purpose of The Sorter
      entriesWithETAs.sort((a, b) => {
        if (!a.open_from && !b.open_from) return 0;
        if (!a.open_from) return 1;
        if (!b.open_from) return -1;
        return new Date(a.open_from) - new Date(b.open_from);
      });

      // Apply highlight classes
      entriesWithETAs.forEach(e => {
        e.highlights = {};
        if (e.controller && OWNER_HIGHLIGHT_BLUE.some(o => e.controller.toLowerCase().includes(o.toLowerCase()))) {
          e.highlights.owner = 'bg-blue-900/30 text-blue-300';
        }
        if (e.position && POSITION_HIGHLIGHT_GRAY.some(p => e.position.toLowerCase() === p.toLowerCase())) {
          e.highlights.position = 'bg-slate-700/50';
        }
        if (e.built) {
          const yr = parseInt(e.built);
          if (yr && yr < 1998) e.highlights.built = 'text-red-400 font-bold';
        }
        if (highlighters.panamax && highlighters.panamax.some(v => v.toLowerCase() === (e.vessel_name || '').toLowerCase())) {
          e.highlights.panamax = true;
        }
        if (highlighters.deck_tank && highlighters.deck_tank.some(v => v.toLowerCase() === (e.vessel_name || '').toLowerCase())) {
          e.highlights.deck_tank = true;
        }
      });

      // ─── FILTERS ────────────────────────────
      let filtered = entriesWithETAs;

      // Date range filter
      if (req.query.from && req.query.to) {
        const from = new Date(req.query.from);
        const to = new Date(req.query.to);
        filtered = filtered.filter(e => {
          if (!e.open_from) return false;
          const d = new Date(e.open_from);
          return d >= from && d <= to;
        });
      }

      // Controller filter
      if (req.query.controller) {
        filtered = filtered.filter(e => e.controller && e.controller.toLowerCase().includes(req.query.controller.toLowerCase()));
      }

      // State filter (ballast/loaded)
      if (req.query.state) {
        filtered = filtered.filter(e => e.kpler_state === req.query.state);
      }

      // Flag filter
      if (req.query.flag) {
        filtered = filtered.filter(e => e.kpler_flag && e.kpler_flag.toLowerCase().includes(req.query.flag.toLowerCase()));
      }

      // CBM range filter
      if (req.query.cbm_min) {
        filtered = filtered.filter(e => (e.kpler_cbm || e.cbm || 0) >= parseInt(req.query.cbm_min));
      }
      if (req.query.cbm_max) {
        filtered = filtered.filter(e => (e.kpler_cbm || e.cbm || 999999) <= parseInt(req.query.cbm_max));
      }

      // Region/position filter
      if (req.query.region) {
        const region = req.query.region.toLowerCase();
        filtered = filtered.filter(e => {
          const pos = (e.position || '').toLowerCase();
          const zonePrt = (e.zone_port || '').toLowerCase();
          const zoneCtry = (e.zone_country || '').toLowerCase();
          return pos.includes(region) || zonePrt.includes(region) || zoneCtry.includes(region);
        });
      }

      // Open vessels only
      if (req.query.open_only === '1') {
        filtered = filtered.filter(e => e.kpler_state === 'ballast' || e.kpler_is_open);
      }

      // Exclude Chinese built
      if (req.query.no_chinese === '1') {
        filtered = filtered.filter(e => !e.chinese_built);
      }

      // US trade only
      if (req.query.us_trade === '1') {
        filtered = filtered.filter(e => e.us_trade);
      }

      // Build unique filter options
      const controllers = [...new Set(entriesWithETAs.map(e => e.controller).filter(Boolean))].sort();
      const flags = [...new Set(entriesWithETAs.map(e => e.kpler_flag).filter(Boolean))].sort();
      const states = [...new Set(entriesWithETAs.map(e => e.kpler_state).filter(Boolean))].sort();

      const destinations = await getDestinations();

      res.render('sorter/index', {
        entries: filtered,
        totalCount: entriesWithETAs.length,
        controllers,
        flags,
        states,
        destinations,
        filter: {
          controller: req.query.controller || '',
          from: req.query.from || '',
          to: req.query.to || '',
          state: req.query.state || '',
          flag: req.query.flag || '',
          cbm_min: req.query.cbm_min || '',
          cbm_max: req.query.cbm_max || '',
          region: req.query.region || '',
          open_only: req.query.open_only || '',
          no_chinese: req.query.no_chinese || '',
          us_trade: req.query.us_trade || ''
        }
      });
    } catch (err) {
      console.error('Sorter error:', err);
      req.flash('error', 'Failed to load sorter');
      res.render('sorter/index', { entries: [], totalCount: 0, controllers: [], flags: [], states: [], destinations: [], filter: {} });
    }
  }
};

module.exports = sorterController;
