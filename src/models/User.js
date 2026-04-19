const db = require('../config/database');
const bcrypt = require('bcryptjs');

const User = {
  async findByUsername(username) {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0];
  },

  async findById(id) {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0];
  },

  async create({ username, password, display_name, initials, role = 'broker' }) {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (username, password, display_name, initials, role) VALUES (?, ?, ?, ?, ?)',
      [username, hash, display_name, initials, role]
    );
    return result.insertId;
  },

  async count() {
    const [rows] = await db.query('SELECT COUNT(*) as count FROM users');
    return rows[0].count;
  },

  async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  },

  async getAll() {
    const [rows] = await db.query('SELECT id, username, display_name, initials, role, created_at FROM users ORDER BY created_at');
    return rows;
  }
};

module.exports = User;
