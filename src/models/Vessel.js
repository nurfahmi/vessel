const db = require('../config/database');

const Vessel = {
  async getAll() {
    const [rows] = await db.query('SELECT * FROM vessels ORDER BY name');
    return rows;
  },

  async findById(id) {
    const [rows] = await db.query('SELECT * FROM vessels WHERE id = ?', [id]);
    return rows[0];
  },

  async findByName(name) {
    const [rows] = await db.query('SELECT * FROM vessels WHERE name = ?', [name]);
    return rows[0];
  },

  async create(data) {
    const [result] = await db.query(
      `INSERT INTO vessels (name, built, cbm, us_trade, chinese_built, panamax, deck_tank, scrubber_df, controller, head_owner, imo, mmsi) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.built, data.cbm, data.us_trade || false, data.chinese_built || false, data.panamax || false, data.deck_tank || false, data.scrubber_df || 'none', data.controller, data.head_owner, data.imo, data.mmsi]
    );
    return result.insertId;
  },

  async update(id, data) {
    await db.query(
      `UPDATE vessels SET name=?, built=?, cbm=?, us_trade=?, chinese_built=?, panamax=?, deck_tank=?, scrubber_df=?, controller=?, head_owner=?, imo=?, mmsi=? WHERE id=?`,
      [data.name, data.built, data.cbm, data.us_trade || false, data.chinese_built || false, data.panamax || false, data.deck_tank || false, data.scrubber_df || 'none', data.controller, data.head_owner, data.imo, data.mmsi, id]
    );
  },

  async upsertByName(data) {
    const existing = await this.findByName(data.name);
    if (existing) {
      await this.update(existing.id, data);
      return existing.id;
    }
    return await this.create(data);
  },

  async delete(id) {
    await db.query('DELETE FROM vessels WHERE id = ?', [id]);
  },

  async count() {
    const [rows] = await db.query('SELECT COUNT(*) as count FROM vessels');
    return rows[0].count;
  },

  async search(query) {
    const [rows] = await db.query('SELECT * FROM vessels WHERE name LIKE ? OR controller LIKE ? ORDER BY name', [`%${query}%`, `%${query}%`]);
    return rows;
  },

  async getControllers() {
    const [rows] = await db.query('SELECT DISTINCT controller FROM vessels WHERE controller IS NOT NULL ORDER BY controller');
    return rows.map(r => r.controller);
  }
};

module.exports = Vessel;
