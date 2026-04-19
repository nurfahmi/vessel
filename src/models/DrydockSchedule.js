const db = require('../config/database');

const DrydockSchedule = {
  async getAll() {
    const [rows] = await db.query('SELECT * FROM drydock_schedule ORDER BY scheduled_date');
    return rows;
  },

  async getByYear(year) {
    const [rows] = await db.query(
      'SELECT * FROM drydock_schedule WHERE YEAR(scheduled_date) = ? ORDER BY scheduled_date',
      [year]
    );
    return rows;
  },

  async create(data) {
    const [result] = await db.query(
      'INSERT INTO drydock_schedule (vessel_name, scheduled_date, end_date, quarter, notes) VALUES (?, ?, ?, ?, ?)',
      [data.vessel_name, data.scheduled_date, data.end_date, data.quarter, data.notes]
    );
    return result.insertId;
  },

  async update(id, data) {
    await db.query(
      'UPDATE drydock_schedule SET vessel_name=?, scheduled_date=?, end_date=?, quarter=?, notes=? WHERE id=?',
      [data.vessel_name, data.scheduled_date, data.end_date, data.quarter, data.notes, id]
    );
  },

  async delete(id) {
    await db.query('DELETE FROM drydock_schedule WHERE id = ?', [id]);
  }
};

module.exports = DrydockSchedule;
