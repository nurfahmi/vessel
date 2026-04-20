const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_NAME = process.env.DB_NAME || 'vlgc_sorter';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

module.exports = pool;
module.exports.DB_NAME = DB_NAME;
