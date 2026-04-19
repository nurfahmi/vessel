const DrydockSchedule = require('../models/DrydockSchedule');

module.exports = {
  async index(req, res) {
    try {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const entries = await DrydockSchedule.getByYear(year);

      // Group by quarter for display
      const quarters = {};
      entries.forEach(e => {
        const q = e.quarter || 'Unassigned';
        if (!quarters[q]) quarters[q] = [];
        quarters[q].push(e);
      });

      res.render('drydock/index', { entries, quarters, year });
    } catch (err) {
      console.error(err);
      res.render('drydock/index', { entries: [], quarters: {}, year: new Date().getFullYear() });
    }
  },

  async create(req, res) {
    try {
      const { vessel_name, scheduled_date, end_date, quarter, notes } = req.body;
      await DrydockSchedule.create({ vessel_name, scheduled_date, end_date: end_date || null, quarter, notes });
      req.flash('success', 'Drydock entry added');
      res.redirect('/drydock');
    } catch (err) {
      req.flash('error', 'Failed');
      res.redirect('/drydock');
    }
  },

  async delete(req, res) {
    try {
      await DrydockSchedule.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};
