const db = require('../config/database');

const AgFixture = {
  async getAll(year) {
    const q = year ? 'SELECT * FROM ag_fixtures WHERE year = ? ORDER BY laycan DESC' : 'SELECT * FROM ag_fixtures ORDER BY laycan DESC';
    const [rows] = await db.query(q, year ? [year] : []);
    return rows;
  },

  async getByRegion(region, year) {
    const [rows] = await db.query(
      'SELECT * FROM ag_fixtures WHERE region = ? AND year = ? ORDER BY laycan DESC', [region, year]
    );
    return rows;
  },

  async create(data) {
    const [result] = await db.query(
      'INSERT INTO ag_fixtures (laycan, charterer, port, vessel, rate, region, year) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.laycan, data.charterer, data.port, data.vessel, data.rate, data.region, data.year || new Date().getFullYear()]
    );
    return result.insertId;
  },

  async update(id, data) {
    await db.query(
      'UPDATE ag_fixtures SET laycan=?, charterer=?, port=?, vessel=?, rate=?, region=?, year=? WHERE id=?',
      [data.laycan, data.charterer, data.port, data.vessel, data.rate, data.region, data.year, id]
    );
  },

  async delete(id) {
    await db.query('DELETE FROM ag_fixtures WHERE id = ?', [id]);
  }
};

module.exports = AgFixture;
