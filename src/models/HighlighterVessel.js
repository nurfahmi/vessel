const db = require('../config/database');

const HighlighterVessel = {
  async getAll() {
    const [rows] = await db.query('SELECT * FROM highlighter_vessels ORDER BY category, vessel_name');
    return rows;
  },

  async getByCategory(category) {
    const [rows] = await db.query('SELECT vessel_name FROM highlighter_vessels WHERE category = ?', [category]);
    return rows.map(r => r.vessel_name);
  },

  async getAllGrouped() {
    const [rows] = await db.query('SELECT * FROM highlighter_vessels ORDER BY category, vessel_name');
    const grouped = {};
    rows.forEach(r => {
      if (!grouped[r.category]) grouped[r.category] = [];
      grouped[r.category].push(r.vessel_name);
    });
    return grouped;
  },

  async create(data) {
    const [result] = await db.query(
      'INSERT INTO highlighter_vessels (vessel_name, category) VALUES (?, ?)',
      [data.vessel_name, data.category]
    );
    return result.insertId;
  },

  async delete(id) {
    await db.query('DELETE FROM highlighter_vessels WHERE id = ?', [id]);
  },

  async isInCategory(vesselName, category) {
    const [rows] = await db.query(
      'SELECT 1 FROM highlighter_vessels WHERE LOWER(vessel_name) = LOWER(?) AND category = ? LIMIT 1',
      [vesselName, category]
    );
    return rows.length > 0;
  }
};

module.exports = HighlighterVessel;
