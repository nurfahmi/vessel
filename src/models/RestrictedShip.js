const db = require('../config/database');

const RestrictedShip = {
  async getAll() {
    const [rows] = await db.query('SELECT * FROM restricted_ships ORDER BY category, vessel_name');
    return rows;
  },

  async getByCategory(category) {
    const [rows] = await db.query('SELECT * FROM restricted_ships WHERE category = ? ORDER BY vessel_name', [category]);
    return rows;
  },

  async getCategories() {
    const [rows] = await db.query('SELECT DISTINCT category FROM restricted_ships ORDER BY category');
    return rows.map(r => r.category);
  },

  async create(data) {
    const [result] = await db.query(
      'INSERT INTO restricted_ships (vessel_name, category, notes, approved_date) VALUES (?, ?, ?, ?)',
      [data.vessel_name, data.category, data.notes, data.approved_date]
    );
    return result.insertId;
  },

  async update(id, data) {
    await db.query(
      'UPDATE restricted_ships SET vessel_name=?, category=?, notes=?, approved_date=? WHERE id=?',
      [data.vessel_name, data.category, data.notes, data.approved_date, id]
    );
  },

  async delete(id) {
    await db.query('DELETE FROM restricted_ships WHERE id = ?', [id]);
  },

  async isRestricted(vesselName, category) {
    const [rows] = await db.query(
      'SELECT * FROM restricted_ships WHERE LOWER(vessel_name) = LOWER(?) AND category = ?',
      [vesselName, category]
    );
    return rows.length > 0;
  }
};

module.exports = RestrictedShip;
