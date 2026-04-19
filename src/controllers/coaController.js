const Coa = require('../models/Coa');

module.exports = {
  async index(req, res) {
    try {
      const coas = await Coa.getAll();
      res.render('coa/index', { coas });
    } catch (err) {
      res.render('coa/index', { coas: [] });
    }
  },
  async create(req, res) {
    try {
      await Coa.create(req.body);
      req.flash('success', 'COA added');
      res.redirect('/coa');
    } catch (err) {
      req.flash('error', 'Failed');
      res.redirect('/coa');
    }
  },
  async update(req, res) {
    try {
      await Coa.update(req.params.id, req.body);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
  async delete(req, res) {
    try {
      await Coa.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};
