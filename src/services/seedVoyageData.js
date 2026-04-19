const XLSX = require('xlsx');
const path = require('path');
const db = require('../config/database');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const EXCEL_PATH = path.join(__dirname, '..', '..', 'excel formula', 'Copy of VLGC Sorter.xlsx');

const DESTINATIONS = [
  { key: 'AG', label: 'AG (Ras Tanura)', short: 'AG', sort: 1 },
  { key: 'USG_PANAMA', label: 'USG via Panama', short: 'USG (P)', sort: 2 },
  { key: 'USG_CAPE', label: 'USG via Cape', short: 'USG (C)', sort: 3 },
  { key: 'WAF', label: 'WAF (Bonny)', short: 'WAF', sort: 4 },
  { key: 'BETHIOUA', label: 'Bethioua', short: 'Bethioua', sort: 5 },
  { key: 'SINGAPORE', label: 'Singapore', short: "S'pore", sort: 6 },
  { key: 'WESTERNPORT', label: 'Westernport', short: "West'port", sort: 7 },
  { key: 'DARWIN', label: 'Darwin', short: 'Darwin', sort: 8 },
  { key: 'PRINCE_RUPERT', label: 'Prince Rupert', short: 'P.Rupert', sort: 9 },
  { key: 'BONYTHON', label: 'Bonython', short: 'Bonython', sort: 10 },
  { key: 'YANBU', label: 'Yanbu', short: 'Yanbu', sort: 11 },
];

// Voyage days sheet row ranges for each destination (Col F-H)
const SECTIONS = [
  { destKey: 'AG', ranges: [[38, 89]] },
  { destKey: 'USG_PANAMA', ranges: [[94, 193]] },
  { destKey: 'USG_CAPE', ranges: [[203, 256]] },
  { destKey: 'WAF', ranges: [[294, 377]] },
  { destKey: 'BETHIOUA', ranges: [[382, 446]] },
  { destKey: 'SINGAPORE', ranges: [[448, 479]] },
  { destKey: 'WESTERNPORT', ranges: [[483, 538]] },
  { destKey: 'DARWIN', ranges: [[540, 613]] },
  { destKey: 'PRINCE_RUPERT', ranges: [[620, 646]] },
  { destKey: 'BONYTHON', ranges: [[702, 727]] },
  { destKey: 'YANBU', ranges: [[807, 878]] },
];

async function seed() {
  console.log('Reading Excel...');
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets['Voyage days'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // 1. Seed destinations
  await db.query('DELETE FROM transit_times');
  await db.query('DELETE FROM destinations');
  const destMap = {};
  for (const d of DESTINATIONS) {
    const [r] = await db.query(
      'INSERT INTO destinations (`key`, label, short_label, sort_order) VALUES (?,?,?,?)',
      [d.key, d.label, d.short, d.sort]
    );
    destMap[d.key] = r.insertId;
  }
  console.log(`✅ ${DESTINATIONS.length} destinations`);

  // 2. Seed transit times from Col F-H
  let transitCount = 0;
  for (const section of SECTIONS) {
    const destId = destMap[section.destKey];
    for (const [startRow, endRow] of section.ranges) {
      for (let r = startRow - 1; r < Math.min(endRow, data.length); r++) {
        const row = data[r];
        const fromPort = String(row[5] || '').trim();
        const alias = String(row[6] || '').trim();
        const days = parseFloat(row[7]);
        const notes = String(row[8] || '').trim() || null;
        if (!fromPort || isNaN(days)) continue;

        try {
          await db.query(
            'INSERT INTO transit_times (from_position, destination_id, transit_days, notes) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE transit_days=VALUES(transit_days)',
            [fromPort, destId, days, notes]
          );
          transitCount++;

          // Also insert alias as a port_alias if it exists
          if (alias && alias !== '-') {
            for (const a of alias.split('/').map(s => s.trim()).filter(Boolean)) {
              try {
                await db.query(
                  'INSERT INTO port_aliases (alias_name, canonical_name, notes) VALUES (?,?,?) ON DUPLICATE KEY UPDATE canonical_name=VALUES(canonical_name)',
                  [a, fromPort, `Alias for ${fromPort} → ${section.destKey}`]
                );
              } catch (e) { /* skip */ }
            }
          }
        } catch (e) { /* skip dups */ }
      }
    }
    console.log(`  ${section.destKey}: seeded`);
  }
  console.log(`✅ ${transitCount} transit time records`);

  // 3. Seed port_areas from Col A-B
  await db.query('DELETE FROM port_areas');
  let areaCount = 0;
  for (let r = 2; r < data.length; r++) {
    const locName = String(data[r][0] || '').trim();
    const area = String(data[r][1] || '').trim();
    if (!locName || !area) continue;

    try {
      await db.query(
        'INSERT INTO port_areas (location_name, area) VALUES (?,?) ON DUPLICATE KEY UPDATE area=VALUES(area)',
        [locName, area]
      );
      areaCount++;
    } catch (e) { /* skip */ }
  }
  console.log(`✅ ${areaCount} port area mappings`);

  // 4. Count aliases
  const [aliasRows] = await db.query('SELECT COUNT(*) as c FROM port_aliases');
  console.log(`✅ ${aliasRows[0].c} port aliases`);

  console.log('\n✅ Voyage data reorganized!');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
