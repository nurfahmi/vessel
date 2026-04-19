const Vessel = require('../models/Vessel');

const vesselController = {
  async index(req, res) {
    try {
      let vessels;
      if (req.query.q) {
        vessels = await Vessel.search(req.query.q);
      } else {
        vessels = await Vessel.getAll();
      }
      res.render('vessel/index', { vessels, q: req.query.q || '' });
    } catch (err) {
      console.error('Vessel index error:', err);
      res.render('vessel/index', { vessels: [], q: '' });
    }
  },

  async create(req, res) {
    try {
      const { name, built, cbm, us_trade, chinese_built, panamax, deck_tank, scrubber_df, controller, head_owner, imo, mmsi } = req.body;
      await Vessel.create({
        name, built, cbm: parseFloat(cbm) || null,
        us_trade: !!us_trade, chinese_built: !!chinese_built, panamax: !!panamax, deck_tank: !!deck_tank,
        scrubber_df: scrubber_df || 'none', controller, head_owner, imo, mmsi
      });
      req.flash('success', 'Vessel created');
      res.redirect('/vessels');
    } catch (err) {
      req.flash('error', 'Failed: ' + err.message);
      res.redirect('/vessels');
    }
  },

  async update(req, res) {
    try {
      const { name, built, cbm, us_trade, chinese_built, panamax, deck_tank, scrubber_df, controller, head_owner, imo, mmsi } = req.body;
      await Vessel.update(req.params.id, {
        name, built, cbm: parseFloat(cbm) || null,
        us_trade: !!us_trade, chinese_built: !!chinese_built, panamax: !!panamax, deck_tank: !!deck_tank,
        scrubber_df: scrubber_df || 'none', controller, head_owner, imo, mmsi
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async delete(req, res) {
    try {
      await Vessel.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // API: search vessels for dropdowns
  async search(req, res) {
    try {
      const vessels = await Vessel.search(req.query.q || '');
      res.json(vessels);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

module.exports = vesselController;
