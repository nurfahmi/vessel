const Setting = require('../models/Setting');
const User = require('../models/User');

module.exports = {
  async index(req, res) {
    try {
      const settings = await Setting.getAll();
      const users = await User.getAll();
      res.render('settings/index', { settings, users });
    } catch (err) {
      res.render('settings/index', { settings: [], users: [] });
    }
  },

  async updateSettings(req, res) {
    try {
      for (const [key, value] of Object.entries(req.body)) {
        await Setting.set(key, value);
      }
      req.flash('success', 'Settings updated');
      res.redirect('/settings');
    } catch (err) {
      req.flash('error', 'Failed');
      res.redirect('/settings');
    }
  },

  async createUser(req, res) {
    try {
      const { username, password, display_name, initials, role } = req.body;
      await User.create({ username, password, display_name, initials, role });
      req.flash('success', 'User created');
      res.redirect('/settings');
    } catch (err) {
      req.flash('error', 'Failed: ' + err.message);
      res.redirect('/settings');
    }
  }
};
