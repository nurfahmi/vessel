const db = require('../config/database');

const IranFsVessel = {
  async getAll() {
    const [rows] = await db.query('SELECT * FROM iran_fs_vessels ORDER BY category, vessel_name');
    return rows;
  },

  async getByCategory(category) {
    const [rows] = await db.query('SELECT * FROM iran_fs_vessels WHERE category = ? ORDER BY vessel_name', [category]);
    return rows;
  },

  async create(data) {
    const [result] = await db.query(
      `INSERT INTO iran_fs_vessels (vessel_name, built, cbm, imo, disponent, operator, previous_name, 
       is_floating_storage, actual_control, area, tc_expiry, dd_date, panama_fitted, scrubber_df, position, open_from, notes, category) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.vessel_name, data.built, data.cbm, data.imo, data.disponent, data.operator, data.previous_name,
       data.is_floating_storage, data.actual_control, data.area, data.tc_expiry, data.dd_date, data.panama_fitted,
       data.scrubber_df, data.position, data.open_from, data.notes, data.category || 'india']
    );
    return result.insertId;
  },

  async update(id, data) {
    await db.query(
      `UPDATE iran_fs_vessels SET vessel_name=?, built=?, cbm=?, imo=?, disponent=?, operator=?, previous_name=?,
       is_floating_storage=?, actual_control=?, area=?, tc_expiry=?, dd_date=?, panama_fitted=?, scrubber_df=?, 
       position=?, open_from=?, notes=?, category=? WHERE id=?`,
      [data.vessel_name, data.built, data.cbm, data.imo, data.disponent, data.operator, data.previous_name,
       data.is_floating_storage, data.actual_control, data.area, data.tc_expiry, data.dd_date, data.panama_fitted,
       data.scrubber_df, data.position, data.open_from, data.notes, data.category, id]
    );
  },

  async delete(id) {
    await db.query('DELETE FROM iran_fs_vessels WHERE id = ?', [id]);
  }
};

module.exports = IranFsVessel;
