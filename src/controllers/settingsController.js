const Setting = require('../models/Setting');
const User = require('../models/User');
const db = require('../config/database');

module.exports = {
  async index(req, res) {
    try {
      const settings = await Setting.getAll();
      const users = await User.getAll();
      const [excludedControllers] = await db.query('SELECT * FROM excluded_controllers ORDER BY controller_name');
      res.render('settings/index', { settings, users, excludedControllers });
    } catch (err) {
      res.render('settings/index', { settings: [], users: [], excludedControllers: [] });
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
  },

  async addExcludedController(req, res) {
    try {
      const { controller_name, reason } = req.body;
      if (!controller_name) throw new Error('Controller name required');
      await db.query(
        'INSERT IGNORE INTO excluded_controllers (controller_name, reason) VALUES (?, ?)',
        [controller_name.trim(), reason || 'Sanctioned']
      );
      req.flash('success', `Excluded: ${controller_name}`);
      res.redirect('/settings');
    } catch (err) {
      req.flash('error', 'Failed: ' + err.message);
      res.redirect('/settings');
    }
  },

  async removeExcludedController(req, res) {
    try {
      await db.query('DELETE FROM excluded_controllers WHERE id = ?', [req.params.id]);
      req.flash('success', 'Removed');
      res.redirect('/settings');
    } catch (err) {
      req.flash('error', 'Failed');
      res.redirect('/settings');
    }
  }
};
