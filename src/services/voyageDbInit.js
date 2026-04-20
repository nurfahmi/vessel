const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function initVoyageTables() {
  try {
    // Create tables if not exist — schema matches VoyageData.js models
    await db.query(`
      CREATE TABLE IF NOT EXISTS destinations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        \`key\` VARCHAR(255) UNIQUE,
        label VARCHAR(255),
        short_label VARCHAR(100),
        sort_order INT DEFAULT 0
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS transit_times (
        id INT AUTO_INCREMENT PRIMARY KEY,
        from_position VARCHAR(255),
        destination_id INT,
        transit_days DECIMAL(8,3),
        notes TEXT,
        UNIQUE KEY uq_route (from_position, destination_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS port_areas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        location_name VARCHAR(255),
        area VARCHAR(255),
        region VARCHAR(255),
        UNIQUE KEY uq_loc (location_name)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS port_aliases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        alias_name VARCHAR(255) UNIQUE,
        canonical_name VARCHAR(255),
        notes TEXT
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS discharge_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        area_name VARCHAR(255) UNIQUE,
        discharge_days INT DEFAULT 4
      )
    `);

    // Patch columns for existing tables that may have old schema
    const patches = [
      "ALTER TABLE destinations ADD COLUMN label VARCHAR(255)",
      "ALTER TABLE destinations ADD COLUMN short_label VARCHAR(100)",
      "ALTER TABLE transit_times ADD COLUMN destination_id INT",
      "ALTER TABLE transit_times ADD COLUMN transit_days INT",
      "ALTER TABLE transit_times ADD COLUMN notes TEXT",
      "ALTER TABLE port_aliases ADD COLUMN notes TEXT",
    ];
    for (const p of patches) {
      try { await db.query(p); } catch(e) {}
    }

    // Check if tables need seeding
    const [transitCount] = await db.query('SELECT COUNT(*) as c FROM transit_times');
    const [areaCount] = await db.query('SELECT COUNT(*) as c FROM port_areas');

    if (transitCount[0].c === 0 || areaCount[0].c === 0) {
      // Seed from SQL file
      const sqlPath = path.join(__dirname, '..', '..', 'sql', 'voyage_data.sql');
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        // Split by semicolons and run each statement
        const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'));
        for (const stmt of statements) {
          try {
            await db.query(stmt);
          } catch (e) {
            // Skip errors (table already exists, duplicate keys, etc.)
          }
        }
        console.log('[Voyage] ✓ Tables created and seeded from voyage_data.sql');
      } else {
        console.log('[Voyage] ⚠ No seed file found at sql/voyage_data.sql');
      }
    } else {
      console.log('[Voyage] ✓ Tables OK (transit:', transitCount[0].c, '| areas:', areaCount[0].c + ')');
    }
  } catch (err) {
    console.error('[Voyage] DB init error:', err.message);
  }
}

module.exports = { initVoyageTables };
