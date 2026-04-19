const IranFsVessel = require('../models/IranFsVessel');

module.exports = {
  async index(req, res) {
    try {
      const category = req.query.category || 'india';
      const vessels = await IranFsVessel.getByCategory(category);
      res.render('iranfs/index', { vessels, category });
    } catch (err) {
      console.error(err);
      res.render('iranfs/index', { vessels: [], category: 'india' });
    }
  },

  async create(req, res) {
    try {
      await IranFsVessel.create(req.body);
      req.flash('success', 'Vessel added');
      res.redirect(`/iran-fs?category=${req.body.category || 'india'}`);
    } catch (err) {
      req.flash('error', 'Failed');
      res.redirect('/iran-fs');
    }
  },

  async update(req, res) {
    try {
      await IranFsVessel.update(req.params.id, req.body);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async delete(req, res) {
    try {
      await IranFsVessel.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};
