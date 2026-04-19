const db = require('../config/database');

const Setting = {
  async get(key) {
    const [rows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);
    return rows.length ? rows[0].setting_value : null;
  },

  async set(key, value, description) {
    await db.query(
      'INSERT INTO settings (setting_key, setting_value, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
      [key, value, description, value]
    );
  },

  async getAll() {
    const [rows] = await db.query('SELECT * FROM settings ORDER BY setting_key');
    return rows;
  }
};

module.exports = Setting;
