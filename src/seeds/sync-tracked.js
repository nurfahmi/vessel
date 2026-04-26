/**
 * Sync tracked status and controller from vessels (Excel) to kpler_fleet
 * Usage: node src/seeds/sync-tracked.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const db = await mysql.createPool({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log('--- Sync Tracked & Controller: vessels → kpler_fleet ---\n');

  // Before counts
  const [before] = await db.query('SELECT COUNT(*) as total, SUM(tracked) as tracked FROM kpler_fleet WHERE status = "Active"');
  console.log('Before:', before[0]);

  // 1. Sync tracked status
  const [r1] = await db.query(`
    UPDATE kpler_fleet f 
    JOIN vessels v ON v.kpler_vessel_id = f.kpler_id 
    SET f.tracked = 1 
    WHERE v.tracked = 1
  `);
  console.log(`\n✓ Tracked: ${r1.affectedRows} vessels set to tracked=1`);

  // 2. Sync controller (manual_operator)
  const [r2] = await db.query(`
    UPDATE kpler_fleet f 
    JOIN vessels v ON v.kpler_vessel_id = f.kpler_id 
    SET f.manual_operator = v.controller 
    WHERE v.controller IS NOT NULL AND v.controller != ''
  `);
  console.log(`✓ Controller: ${r2.affectedRows} vessels updated with manual_operator`);

  // After counts
  const [after] = await db.query('SELECT COUNT(*) as total, SUM(tracked) as tracked FROM kpler_fleet WHERE status = "Active"');
  console.log('\nAfter:', after[0]);

  // Show sample
  const [sample] = await db.query('SELECT name, tracked, manual_operator FROM kpler_fleet WHERE tracked = 1 LIMIT 5');
  console.log('\nSample tracked vessels:');
  sample.forEach(s => console.log(`  ${s.name} — ${s.manual_operator || '(no controller)'}`));

  await db.end();
  console.log('\n✅ Done!');
})();
