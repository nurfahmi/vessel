const RestrictedShip = require('../models/RestrictedShip');

const CATEGORIES = [
  { key: 'india_flag', label: 'India Flags' },
  { key: 'old_vessel', label: 'Old Vessels' },
  { key: 'nederland', label: 'Nederland' },
  { key: 'freeport', label: 'Freeport' },
  { key: 'indian_discharge', label: 'Indian Discharge' },
  { key: 'soyo_not_approved', label: 'Soyo Not Approved' },
  { key: 'soyo_approved', label: 'Soyo Approved' },
];

module.exports = {
  async index(req, res) {
    try {
      const selectedCat = req.query.category || CATEGORIES[0].key;
      const ships = await RestrictedShip.getByCategory(selectedCat);
      res.render('restricted/index', { ships, categories: CATEGORIES, selectedCat });
    } catch (err) {
      console.error(err);
      res.render('restricted/index', { ships: [], categories: CATEGORIES, selectedCat: '' });
    }
  },

  async create(req, res) {
    try {
      await RestrictedShip.create(req.body);
      req.flash('success', 'Added');
      res.redirect(`/restricted?category=${req.body.category}`);
    } catch (err) {
      req.flash('error', 'Failed');
      res.redirect('/restricted');
    }
  },

  async delete(req, res) {
    try {
      await RestrictedShip.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};
