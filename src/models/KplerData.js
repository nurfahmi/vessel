const db = require('../config/database');

const KplerData = {
  async getLatestBatch() {
    const [rows] = await db.query(
      'SELECT * FROM kpler_data WHERE import_batch = (SELECT import_batch FROM kpler_data ORDER BY imported_at DESC LIMIT 1) ORDER BY vessel_name'
    );
    return rows;
  },

  async getByBatch(batch) {
    const [rows] = await db.query('SELECT * FROM kpler_data WHERE import_batch = ? ORDER BY vessel_name', [batch]);
    return rows;
  },

  async getBatches() {
    const [rows] = await db.query(
      'SELECT import_batch, MIN(imported_at) as imported_at, COUNT(*) as vessel_count FROM kpler_data GROUP BY import_batch ORDER BY imported_at DESC'
    );
    return rows;
  },

  async bulkInsert(records, batch) {
    if (!records.length) return 0;
    const values = records.map(r => [
      r.vessel_name, r.capacity_m3, r.deadweight, r.state, r.status,
      r.mmsi, r.imo, r.next_destination, r.next_destination_eta, r.is_loaded, batch
    ]);
    const [result] = await db.query(
      `INSERT INTO kpler_data (vessel_name, capacity_m3, deadweight, state, status, mmsi, imo, next_destination, next_destination_eta, is_loaded, import_batch) 
       VALUES ?`,
      [values]
    );
    return result.affectedRows;
  },

  async getVesselData(vesselName) {
    const [rows] = await db.query(
      `SELECT * FROM kpler_data WHERE vessel_name = ? AND import_batch = (SELECT import_batch FROM kpler_data ORDER BY imported_at DESC LIMIT 1) LIMIT 1`,
      [vesselName]
    );
    return rows[0];
  },

  async getActiveCount() {
    const [rows] = await db.query(
      `SELECT COUNT(*) as count FROM kpler_data WHERE status = 'Active' AND import_batch = (SELECT import_batch FROM kpler_data ORDER BY imported_at DESC LIMIT 1)`
    );
    return rows[0].count;
  },

  async getUnderConstructionCount() {
    const [rows] = await db.query(
      `SELECT COUNT(*) as count FROM kpler_data WHERE status = 'Under Construction' AND import_batch = (SELECT import_batch FROM kpler_data ORDER BY imported_at DESC LIMIT 1)`
    );
    return rows[0].count;
  },

  async deleteBatch(batch) {
    await db.query('DELETE FROM kpler_data WHERE import_batch = ?', [batch]);
  }
};

module.exports = KplerData;
