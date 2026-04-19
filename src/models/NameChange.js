const db = require('../config/database');

const NameChange = {
  async getAll() {
    const [rows] = await db.query('SELECT * FROM name_changes ORDER BY current_name');
    return rows;
  },

  async create(data) {
    const [result] = await db.query(
      `INSERT INTO name_changes (current_name, previous_name, change_date, built, imo, yard, yard_country, liq_cubic, commercial_owner, status, fuel_option) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.current_name, data.previous_name, data.change_date, data.built, data.imo, data.yard, data.yard_country, data.liq_cubic, data.commercial_owner, data.status, data.fuel_option]
    );
    return result.insertId;
  },

  async update(id, data) {
    await db.query(
      `UPDATE name_changes SET current_name=?, previous_name=?, change_date=?, built=?, imo=?, yard=?, yard_country=?, liq_cubic=?, commercial_owner=?, status=?, fuel_option=? WHERE id=?`,
      [data.current_name, data.previous_name, data.change_date, data.built, data.imo, data.yard, data.yard_country, data.liq_cubic, data.commercial_owner, data.status, data.fuel_option, id]
    );
  },

  async delete(id) {
    await db.query('DELETE FROM name_changes WHERE id = ?', [id]);
  },

  async findByCurrentName(name) {
    const [rows] = await db.query('SELECT * FROM name_changes WHERE LOWER(current_name) = LOWER(?)', [name]);
    return rows;
  }
};

module.exports = NameChange;
