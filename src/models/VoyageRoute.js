const db = require('../config/database');

const VoyageRoute = {
  async getAll() {
    const [rows] = await db.query('SELECT * FROM voyage_routes ORDER BY destination, sort_order, from_port');
    return rows;
  },

  async getByDestination(destination) {
    const [rows] = await db.query('SELECT * FROM voyage_routes WHERE destination = ? ORDER BY sort_order, from_port', [destination]);
    return rows;
  },

  async getDestinations() {
    const [rows] = await db.query('SELECT DISTINCT destination FROM voyage_routes ORDER BY destination');
    return rows.map(r => r.destination);
  },

  async findTransitDays(fromPort, destination) {
    // Try exact match first
    const [rows] = await db.query(
      'SELECT transit_days FROM voyage_routes WHERE LOWER(TRIM(from_port)) = LOWER(TRIM(?)) AND destination = ? LIMIT 1',
      [fromPort, destination]
    );
    if (rows.length) return rows[0].transit_days;

    // Try alias match
    const [aliasRows] = await db.query(
      'SELECT transit_days FROM voyage_routes WHERE LOWER(TRIM(from_alias)) LIKE LOWER(CONCAT(\'%\', TRIM(?), \'%\')) AND destination = ? LIMIT 1',
      [fromPort, destination]
    );
    return aliasRows.length ? aliasRows[0].transit_days : null;
  },

  async create(data) {
    const [result] = await db.query(
      'INSERT INTO voyage_routes (from_port, from_alias, destination, transit_days, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [data.from_port, data.from_alias, data.destination, data.transit_days, data.notes, data.sort_order || 0]
    );
    return result.insertId;
  },

  async update(id, data) {
    await db.query(
      'UPDATE voyage_routes SET from_port=?, from_alias=?, destination=?, transit_days=?, notes=?, sort_order=? WHERE id=?',
      [data.from_port, data.from_alias, data.destination, data.transit_days, data.notes, data.sort_order || 0, id]
    );
  },

  async delete(id) {
    await db.query('DELETE FROM voyage_routes WHERE id = ?', [id]);
  },

  async count() {
    const [rows] = await db.query('SELECT COUNT(*) as count FROM voyage_routes');
    return rows[0].count;
  },

  async bulkInsert(records) {
    if (!records.length) return 0;
    const values = records.map(r => [r.from_port, r.from_alias, r.destination, r.transit_days, r.notes, r.sort_order || 0]);
    const [result] = await db.query(
      'INSERT INTO voyage_routes (from_port, from_alias, destination, transit_days, notes, sort_order) VALUES ?',
      [values]
    );
    return result.affectedRows;
  }
};

module.exports = VoyageRoute;
