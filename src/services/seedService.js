const XLSX = require('xlsx');
const path = require('path');
const db = require('../config/database');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const EXCEL_PATH = path.join(__dirname, '..', '..', 'excel formula', 'Copy of VLGC Sorter.xlsx');

async function seed() {
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile(EXCEL_PATH);

  await seedVessels(workbook);
  await seedVoyageRoutes(workbook);
  await seedRestrictedShips(workbook);
  await seedNameChanges(workbook);
  await seedHighlighters(workbook);
  await seedDrydock(workbook);

  console.log('\n✅ Seeding complete!');
  process.exit(0);
}

// ─── VESSELS (Control List) ─────────────────────────────
async function seedVessels(wb) {
  const sheet = wb.Sheets['Control list'];
  if (!sheet) { console.log('⚠ Control list sheet not found'); return; }
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  let count = 0;
  for (let r = 2; r < data.length; r++) {
    const row = data[r];
    const name = String(row[0] || '').trim();
    if (!name) continue;

    const built = row[1] ? String(row[1]).substring(0, 20) : null;
    const cbm = parseFloat(row[2]) || null;
    const us = String(row[3] || '').trim().toUpperCase() === 'US';
    const chinese = String(row[4] || '').trim().toUpperCase() === 'C';
    const deckTank = !!row[6];
    const sdf = parseSDF(row[7]);
    const controller = String(row[8] || '').trim() || null;

    try {
      await db.query(
        `INSERT INTO vessels (name, built, cbm, us_trade, chinese_built, deck_tank, scrubber_df, controller) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE 
         built=VALUES(built), cbm=VALUES(cbm), us_trade=VALUES(us_trade), chinese_built=VALUES(chinese_built),
         deck_tank=VALUES(deck_tank), scrubber_df=VALUES(scrubber_df), controller=VALUES(controller)`,
        [name, built, cbm, us, chinese, deckTank, sdf, controller]
      );
      count++;
    } catch (e) {
      console.error(`  Error inserting vessel ${name}:`, e.message);
    }
  }
  console.log(`✅ Seeded ${count} vessels from Control List`);
}

// ─── VOYAGE ROUTES ─────────────────────────────────────
async function seedVoyageRoutes(wb) {
  const sheet = wb.Sheets['Voyage days'];
  if (!sheet) { console.log('⚠ Voyage days sheet not found'); return; }
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Clear existing routes
  await db.query('DELETE FROM voyage_routes');

  const sections = [
    { dest: 'AG', startRow: 38, endRow: 89 },
    { dest: 'USG_PANAMA', startRow: 94, endRow: 193 },
    { dest: 'USG_CAPE', startRow: 203, endRow: 256 },
    { dest: 'WAF', startRow: 294, endRow: 377 },
    { dest: 'BETHIOUA', startRow: 382, endRow: 446 },
    { dest: 'SINGAPORE', startRow: 448, endRow: 479 },
    { dest: 'WESTERNPORT', startRow: 483, endRow: 538 },
    { dest: 'DARWIN', startRow: 540, endRow: 613 },
    { dest: 'PRINCE_RUPERT', startRow: 620, endRow: 646 },
    { dest: 'BONYTHON', startRow: 702, endRow: 727 },
    { dest: 'YANBU', startRow: 807, endRow: 878 },
  ];

  let totalCount = 0;
  for (const section of sections) {
    let count = 0;
    for (let r = section.startRow - 1; r < Math.min(section.endRow, data.length); r++) {
      const row = data[r];
      const fromPort = String(row[5] || '').trim(); // Column F
      const alias = String(row[6] || '').trim() || null; // Column G
      const transitDays = parseFloat(row[7]); // Column H
      const notes = String(row[8] || '').trim() || null; // Column I

      if (!fromPort || isNaN(transitDays)) continue;

      try {
        await db.query(
          'INSERT INTO voyage_routes (from_port, from_alias, destination, transit_days, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          [fromPort, alias, section.dest, transitDays, notes, count]
        );
        count++;
      } catch (e) {
        console.error(`  Error inserting route ${fromPort} -> ${section.dest}:`, e.message);
      }
    }
    totalCount += count;
    console.log(`  ${section.dest}: ${count} routes`);
  }
  console.log(`✅ Seeded ${totalCount} voyage routes`);
}

// ─── RESTRICTED SHIPS ────────────────────────────────
async function seedRestrictedShips(wb) {
  const sheet = wb.Sheets['Restricted ships'];
  if (!sheet) { console.log('⚠ Restricted ships sheet not found'); return; }
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  await db.query('DELETE FROM restricted_ships');

  // Column mapping based on Excel headers
  const categories = [
    { col: 0, cat: 'india_flag', label: 'India flags' },
    { col: 2, cat: 'old_vessel', notesCol: 3 },
    { col: 5, cat: 'nederland', notesCol: 6 },
    { col: 9, cat: 'freeport' },
    { col: 11, cat: 'indian_discharge' },
    { col: 13, cat: 'soyo_not_approved' },
    { col: 15, cat: 'soyo_approved', notesCol: 16, dateCol: 17 },
  ];

  let count = 0;
  for (const catDef of categories) {
    for (let r = 1; r < data.length; r++) {
      const name = String(data[r][catDef.col] || '').trim();
      if (!name) continue;
      const notes = catDef.notesCol ? String(data[r][catDef.notesCol] || '').trim() || null : null;

      try {
        await db.query(
          'INSERT INTO restricted_ships (vessel_name, category, notes) VALUES (?, ?, ?)',
          [name, catDef.cat, notes]
        );
        count++;
      } catch (e) { /* skip */ }
    }
  }
  console.log(`✅ Seeded ${count} restricted ships`);
}

// ─── NAME CHANGES ────────────────────────────────────
async function seedNameChanges(wb) {
  // Use "Name changes" sheet (simple one)
  const sheet = wb.Sheets['Name changes'];
  if (!sheet) { console.log('⚠ Name changes sheet not found'); return; }
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  await db.query('DELETE FROM name_changes');

  let count = 0;
  for (let r = 2; r < data.length; r++) {
    const currentName = String(data[r][0] || '').trim();
    const previousName = String(data[r][1] || '').trim();
    if (!currentName || !previousName) continue;

    const changeDate = data[r][2] ? parseExcelDate(data[r][2]) : null;

    try {
      await db.query(
        'INSERT INTO name_changes (current_name, previous_name, change_date) VALUES (?, ?, ?)',
        [currentName, previousName, changeDate]
      );
      count++;
    } catch (e) { /* skip */ }
  }

  // Also seed from "Vsl name chg" for more complete data
  const sheet2 = wb.Sheets['Vsl name chg'];
  if (sheet2) {
    const data2 = XLSX.utils.sheet_to_json(sheet2, { header: 1, defval: '' });
    for (let r = 1; r < data2.length; r++) {
      const name = String(data2[r][0] || '').trim();
      const prev = String(data2[r][1] || '').trim();
      if (!name || !prev) continue;

      const built = data2[r][2] ? String(data2[r][2]) : null;
      const imo = data2[r][4] ? String(data2[r][4]) : null;
      const yard = String(data2[r][5] || '').trim() || null;
      const yardCountry = String(data2[r][6] || '').trim() || null;
      const liqCubic = parseFloat(data2[r][8]) || null;
      const owner = String(data2[r][11] || '').trim() || null;

      try {
        await db.query(
          `INSERT INTO name_changes (current_name, previous_name, built, imo, yard, yard_country, liq_cubic, commercial_owner) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE previous_name=VALUES(previous_name)`,
          [name, prev, built, imo, yard, yardCountry, liqCubic, owner]
        );
        count++;
      } catch (e) { /* skip duplicates */ }
    }
  }

  console.log(`✅ Seeded ${count} name changes`);
}

// ─── HIGHLIGHTERS ────────────────────────────────────
async function seedHighlighters(wb) {
  const sheet = wb.Sheets['Highlighter'];
  if (!sheet) { console.log('⚠ Highlighter sheet not found'); return; }
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  await db.query('DELETE FROM highlighter_vessels');

  let count = 0;
  const catMap = [
    { col: 1, cat: 'main_sorter' },
    { col: 3, cat: 'west_sorter' },
    { col: 5, cat: 'relet_open' },
    { col: 7, cat: 'east_west' },
    { col: 9, cat: 'panamax' },
    { col: 11, cat: 'deck_tank' },
  ];

  for (const c of catMap) {
    for (let r = 2; r < data.length; r++) {
      const name = String(data[r][c.col] || '').trim();
      if (!name) continue;
      try {
        await db.query('INSERT INTO highlighter_vessels (vessel_name, category) VALUES (?, ?)', [name, c.cat]);
        count++;
      } catch (e) { /* skip */ }
    }
  }
  console.log(`✅ Seeded ${count} highlighter vessels`);
}

// ─── DRYDOCK ─────────────────────────────────────────
async function seedDrydock(wb) {
  const sheet = wb.Sheets['Drydock'];
  if (!sheet) { console.log('⚠ Drydock sheet not found'); return; }
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  await db.query('DELETE FROM drydock_schedule');

  // Row 2 has dates (columns A-S), rows 3+ have vessel names placed under their scheduled month
  if (data.length < 3) return;

  const dateCols = data[1]; // Row 2 = dates
  let count = 0;

  for (let r = 2; r < data.length; r++) {
    for (let c = 0; c < dateCols.length; c++) {
      const vesselName = String(data[r][c] || '').trim();
      if (!vesselName) continue;

      const schedDate = parseExcelDate(dateCols[c]);
      if (!schedDate) continue;

      // Determine quarter
      const month = schedDate.getMonth();
      const qtr = `Q${Math.floor(month / 3) + 1} ${schedDate.getFullYear()}`;

      try {
        await db.query(
          'INSERT INTO drydock_schedule (vessel_name, scheduled_date, quarter) VALUES (?, ?, ?)',
          [vesselName, schedDate, qtr]
        );
        count++;
      } catch (e) { /* skip */ }
    }
  }
  console.log(`✅ Seeded ${count} drydock entries`);
}

// ─── HELPERS ──────────────────────────────────────────
function parseSDF(val) {
  const v = String(val || '').trim().toUpperCase();
  if (v === 'S') return 'scrubber';
  if (v === 'DF') return 'dual_fuel';
  if (v === 'DT') return 'deck_tank';
  return 'none';
}

function parseExcelDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const utcDays = Math.floor(val - 25569);
    return new Date(utcDays * 86400 * 1000);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
