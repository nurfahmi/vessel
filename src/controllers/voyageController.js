const { Destination, TransitTime, PortArea, PortAlias, DischargeSetting } = require('../models/VoyageData');

module.exports = {
  // ─── MAIN VIEW ─────────────────────────────────
  async index(req, res) {
    const tab = req.query.tab || 'transit';
    const destId = req.query.dest || null;
    const area = req.query.area || null;
    const q = req.query.q || '';

    const destinations = await TransitTime.countByDestination();
    const areas = await PortArea.getAreas();
    
    let transitTimes = [];
    let portAreas = [];
    let aliases = [];
    let selectedDest = null;

    if (tab === 'transit') {
      if (q) {
        transitTimes = await TransitTime.search(q);
      } else if (destId) {
        transitTimes = await TransitTime.getByDestination(destId);
        selectedDest = destinations.find(d => d.id == destId);
      } else if (destinations.length) {
        selectedDest = destinations[0];
        transitTimes = await TransitTime.getByDestination(selectedDest.id);
      }
    } else if (tab === 'areas') {
      if (q) {
        portAreas = await PortArea.search(q);
      } else if (area) {
        portAreas = await PortArea.getByArea(area);
      } else {
        portAreas = await PortArea.getAll();
      }
    } else if (tab === 'aliases') {
      aliases = await PortAlias.getAll();
    } else if (tab === 'destinations') {
      // show destinations management
    }

    const areaCount = await PortArea.count();
    const dischargeSettings = await DischargeSetting.getAll();

    res.render('voyage/index', {
      tab, destinations, transitTimes, portAreas, aliases, areas,
      selectedDest, areaCount, dischargeSettings,
      selectedArea: area, q,
      layout: 'layout/main'
    });
  },

  // ─── DESTINATIONS CRUD ────────────────────────
  async createDestination(req, res) {
    const { key, label, short_label, sort_order } = req.body;
    await Destination.create({ key: key.toUpperCase().replace(/\s+/g, '_'), label, short_label, sort_order: parseInt(sort_order) || 0 });
    req.flash('success', 'Destination created');
    res.redirect('/voyage?tab=destinations');
  },

  async updateDestination(req, res) {
    const { key, label, short_label, sort_order } = req.body;
    await Destination.update(req.params.id, { key, label, short_label, sort_order: parseInt(sort_order) || 0 });
    res.json({ ok: true });
  },

  async deleteDestination(req, res) {
    await Destination.delete(req.params.id);
    res.json({ ok: true });
  },

  // ─── TRANSIT TIMES CRUD ───────────────────────
  async createTransit(req, res) {
    const { from_position, destination_id, transit_days, notes } = req.body;
    await TransitTime.create({ from_position, destination_id: parseInt(destination_id), transit_days: parseFloat(transit_days), notes });
    req.flash('success', 'Transit route added');
    res.redirect(`/voyage?tab=transit&dest=${destination_id}`);
  },

  async updateTransit(req, res) {
    const { from_position, destination_id, transit_days, notes } = req.body;
    await TransitTime.update(req.params.id, { from_position, destination_id: parseInt(destination_id), transit_days: parseFloat(transit_days), notes });
    res.json({ ok: true });
  },

  async deleteTransit(req, res) {
    await TransitTime.delete(req.params.id);
    res.json({ ok: true });
  },

  // ─── PORT AREAS CRUD ──────────────────────────
  async createArea(req, res) {
    const { location_name, area, region } = req.body;
    await PortArea.create({ location_name, area, region });
    req.flash('success', 'Port area added');
    res.redirect(`/voyage?tab=areas&area=${area}`);
  },

  async updateArea(req, res) {
    const { location_name, area, region } = req.body;
    await PortArea.update(req.params.id, { location_name, area, region });
    res.json({ ok: true });
  },

  async deleteArea(req, res) {
    await PortArea.delete(req.params.id);
    res.json({ ok: true });
  },

  // ─── ALIASES CRUD ─────────────────────────────
  async createAlias(req, res) {
    const { alias_name, canonical_name, notes } = req.body;
    await PortAlias.create({ alias_name, canonical_name, notes });
    req.flash('success', 'Alias added');
    res.redirect('/voyage?tab=aliases');
  },

  async updateAlias(req, res) {
    const { alias_name, canonical_name, notes } = req.body;
    await PortAlias.update(req.params.id, { alias_name, canonical_name, notes });
    res.json({ ok: true });
  },

  async deleteAlias(req, res) {
    await PortAlias.delete(req.params.id);
    res.json({ ok: true });
  },

  // ─── DISCHARGE SETTINGS CRUD ───────────────────
  async createDischarge(req, res) {
    const { area_name, discharge_days } = req.body;
    await DischargeSetting.create({ area_name, discharge_days: parseInt(discharge_days) || 4 });
    req.flash('success', 'Discharge setting added');
    res.redirect('/voyage?tab=discharge');
  },

  async updateDischarge(req, res) {
    const { discharge_days } = req.body;
    await DischargeSetting.update(req.params.id, parseInt(discharge_days) || 4);
    res.json({ ok: true });
  },

  async deleteDischarge(req, res) {
    await DischargeSetting.delete(req.params.id);
    res.json({ ok: true });
  },

  // ─── API: Test lookup ─────────────────────────
  async testLookup(req, res) {
    const position = req.query.position;
    if (!position) return res.json({ error: 'No position' });
    
    const destinations = await Destination.getAll();
    const results = [];
    for (const d of destinations) {
      const days = await TransitTime.findTransitDays(position, d.key);
      results.push({ destination: d.label, key: d.key, transit_days: days });
    }

    // Also check area resolution
    const area = await PortArea.resolve(position);
    const alias = await PortAlias.resolve(position);
    
    res.json({ position, resolved_area: area, resolved_alias: alias, results });
  }
};
