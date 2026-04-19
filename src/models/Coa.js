const db = require('../config/database');

const Coa = {
  async getAll() {
    const [rows] = await db.query('SELECT * FROM coas ORDER BY pool');
    return rows;
  },

  async create(data) {
    const [result] = await db.query(
      'INSERT INTO coas (pool, charterer, route, frequency, rate_notes, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [data.pool, data.charterer, data.route, data.frequency, data.rate_notes, data.notes]
    );
    return result.insertId;
  },

  async update(id, data) {
    await db.query(
      'UPDATE coas SET pool=?, charterer=?, route=?, frequency=?, rate_notes=?, notes=? WHERE id=?',
      [data.pool, data.charterer, data.route, data.frequency, data.rate_notes, data.notes, id]
    );
  },

  async delete(id) {
    await db.query('DELETE FROM coas WHERE id = ?', [id]);
  }
};

module.exports = Coa;
