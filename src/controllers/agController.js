const AgFixture = require('../models/AgFixture');

const REGIONS = [
  { key: 'unsorted', label: 'Unsorted AG' },
  { key: 'qatar', label: 'Qatar (Ras Laffan/Mesaieed)' },
  { key: 'kpc', label: 'KPC (Mina Al-Ahmadi/Mina Saqr)' },
  { key: 'adnoc', label: 'ADNOC (Ruwais, Das Island)' },
  { key: 'saudi', label: 'Saudi Aramco (Ras Tanura, Juaymah, Yanbu)' },
];

module.exports = {
  async index(req, res) {
    try {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const fixtures = await AgFixture.getAll(year);
      const grouped = {};
      REGIONS.forEach(r => grouped[r.key] = []);
      fixtures.forEach(f => {
        const key = f.region || 'unsorted';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(f);
      });
      res.render('ag/index', { fixtures, grouped, regions: REGIONS, year });
    } catch (err) {
      console.error(err);
      res.render('ag/index', { fixtures: [], grouped: {}, regions: REGIONS, year: new Date().getFullYear() });
    }
  },

  async create(req, res) {
    try {
      await AgFixture.create(req.body);
      req.flash('success', 'Fixture added');
      res.redirect(`/ag?year=${req.body.year || new Date().getFullYear()}`);
    } catch (err) {
      req.flash('error', 'Failed');
      res.redirect('/ag');
    }
  },

  async update(req, res) {
    try {
      await AgFixture.update(req.params.id, req.body);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async delete(req, res) {
    try {
      await AgFixture.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};
