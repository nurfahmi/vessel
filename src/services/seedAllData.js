const XLSX = require('xlsx');
const path = require('path');
const db = require('../config/database');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const EXCEL_PATH = path.join(__dirname, '..', '..', 'excel formula', 'Copy of VLGC Sorter.xlsx');

async function seedTrackerData() {
  console.log('Reading Excel file...');
  const wb = XLSX.readFile(EXCEL_PATH);

  // === 1. Import Tracker manual data (Position, Open dates, Notes, Voyage) ===
  await importTrackerData(wb);

  // === 2. Import Kpler data from sheet ===
  await importKplerData(wb);

  // === 3. Import India sheet (separate tracker) ===
  await importIndiaData(wb);

  // === 4. Import Iran/FS data ===
  await importIranFsData(wb);

  // === 5. Import Old Ships ===
  await importOldShips(wb);

  // === 6. Import Pertamina ===
  await importPertamina(wb);

  // === 7. Import ScrubberDF/Panamax reference ===
  await importScrubberDfPanamax(wb);

  // === 8. Import Discharge ports ===
  await importDischargePorts(wb);

  // === 9. Import Loaded before ===
  await importLoadedBefore(wb);

  // === 10. Import AG lineup data ===
  await importAgLineup(wb);

  // === 11. Seed default settings ===
  await seedSettings();

  console.log('\n✅ All data seeded!');
  process.exit(0);
}

// ─── TRACKER DATA ────────────────────────────────────
async function importTrackerData(wb) {
  const sheet = wb.Sheets['2) Tracker'];
  if (!sheet) return console.log('⚠ Tracker sheet not found');
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  let updated = 0;
  for (let r = 2; r < data.length; r++) {
    const row = data[r];
    const vesselName = String(row[0] || '').trim();
    if (!vesselName) continue;

    const position = String(row[11] || '').trim() || null;     // Col L
    const openFrom = parseDate(row[12]);                        // Col M
    const openTo = parseDate(row[13]);                          // Col N
    const notes = String(row[15] || '').trim() || null;         // Col P
    const nextLoading = String(row[16] || '').trim() || null;   // Col Q
    const currentVoyage = String(row[17] || '').trim() || null; // Col R
    const editedBy = String(row[18] || '').trim() || null;      // Col S
    const ladenVCape = String(row[10] || '').trim() || null;    // Col K

    if (!position && !openFrom) continue; // Skip empty rows

    // Find vessel_id
    const [vessels] = await db.query('SELECT id FROM vessels WHERE LOWER(name) = LOWER(?)', [vesselName]);
    if (!vessels.length) continue;

    const vesselId = vessels[0].id;

    // Update or create tracker entry
    const [existing] = await db.query('SELECT id FROM tracker_entries WHERE vessel_id = ?', [vesselId]);
    if (existing.length) {
      await db.query(
        `UPDATE tracker_entries SET position=?, open_from=?, open_to=?, notes=?, next_loading=?, current_voyage=?, edited_by=?, laden_v_cape=? WHERE vessel_id=?`,
        [position, openFrom, openTo, notes, nextLoading, currentVoyage, editedBy, ladenVCape, vesselId]
      );
    } else {
      await db.query(
        `INSERT INTO tracker_entries (vessel_id, position, open_from, open_to, notes, next_loading, current_voyage, edited_by, laden_v_cape) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [vesselId, position, openFrom, openTo, notes, nextLoading, currentVoyage, editedBy, ladenVCape]
      );
    }
    updated++;
  }
  console.log(`✅ Imported ${updated} tracker entries with data`);
}

// ─── KPLER DATA ──────────────────────────────────────
async function importKplerData(wb) {
  const sheet = wb.Sheets['1) Kpler'];
  if (!sheet) return console.log('⚠ Kpler sheet not found');
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Clear existing
  await db.query('DELETE FROM kpler_data');

  const batch = 'excel_seed';
  let count = 0;
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const name = String(row[4] || '').trim(); // Col E
    if (!name) continue;

    const capacity = parseFloat(row[5]) || null;
    const deadweight = parseFloat(row[6]) || null;
    const state = String(row[7] || '').toLowerCase().trim();
    const status = String(row[8] || '').trim();
    const mmsi = String(row[9] || '').trim() || null;
    const imo = String(row[10] || '').trim() || null;
    const nextDest = String(row[11] || '').trim() || null;
    const nextDestEta = parseDate(row[12]);
    const isLoaded = String(row[13] || '').toLowerCase() === 'true';

    try {
      await db.query(
        `INSERT INTO kpler_data (vessel_name, capacity_m3, deadweight, state, status, mmsi, imo, next_destination, next_destination_eta, is_loaded, import_batch) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, capacity, deadweight, state, status, mmsi, imo, nextDest, nextDestEta, isLoaded, batch]
      );
      count++;
    } catch (e) { /* skip */ }
  }
  console.log(`✅ Imported ${count} Kpler vessel records`);
}

// ─── INDIA DATA (separate tracker) ───────────────────
async function importIndiaData(wb) {
  const sheet = wb.Sheets['India'];
  if (!sheet) return console.log('⚠ India sheet not found');
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Create india_tracker table if not exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS india_tracker (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_name VARCHAR(255) NOT NULL,
      built VARCHAR(20),
      cbm DECIMAL(10,2),
      ex_charterer VARCHAR(100),
      scrubber_df VARCHAR(20) DEFAULT 'none',
      dd_date DATE,
      tc_expiry VARCHAR(50),
      tc_owner VARCHAR(100),
      controller VARCHAR(100),
      head_owner VARCHAR(100),
      position VARCHAR(100),
      open_from DATE,
      open_to DATE,
      relet VARCHAR(10),
      notes TEXT,
      next_loading VARCHAR(255),
      current_voyage VARCHAR(255),
      edited_by VARCHAR(10),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.query('DELETE FROM india_tracker');

  let count = 0;
  for (let r = 2; r < data.length; r++) {
    const row = data[r];
    const name = String(row[0] || '').trim();
    if (!name) continue;

    try {
      await db.query(
        `INSERT INTO india_tracker (vessel_name, built, cbm, ex_charterer, scrubber_df, dd_date, tc_expiry, tc_owner, controller, head_owner, position, open_from, open_to, relet, notes, next_loading, current_voyage, edited_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          row[1] ? String(row[1]).substring(0, 20) : null,
          parseFloat(row[2]) || null,
          String(row[3] || '').trim() || null,
          parseSDF(row[4]),
          parseDate(row[5]),
          String(row[6] || '').trim() || null,
          String(row[7] || '').trim() || null,
          String(row[8] || '').trim() || null,
          String(row[9] || '').trim() || null,
          String(row[11] || '').trim() || null,
          parseDate(row[12]),
          parseDate(row[13]),
          String(row[14] || '').trim() || null,
          String(row[15] || '').trim() || null,
          String(row[16] || '').trim() || null,
          String(row[17] || '').trim() || null,
          String(row[18] || '').trim() || null
        ]
      );
      count++;
    } catch (e) {
      if (count < 3) console.error(`  India row ${r} error:`, e.message);
    }
  }
  console.log(`✅ Imported ${count} India tracker vessels`);
}

// ─── IRAN/FS DATA ────────────────────────────────────
async function importIranFsData(wb) {
  const sheet = wb.Sheets['Iran, FS'];
  if (!sheet) return console.log('⚠ Iran/FS sheet not found');
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  await db.query('DELETE FROM iran_fs_vessels');

  let count = 0;
  // Row 1 = header, Row 2 = "INDIA - Shuttle..." subheader, Row 3+ = data
  // Need to detect section breaks for category
  let category = 'india';
  for (let r = 2; r < data.length; r++) {
    const row = data[r];
    const name = String(row[0] || '').trim();
    
    // Detect section headers
    if (name.toUpperCase().includes('IRAN')) { category = 'iran'; continue; }
    if (name.toUpperCase().includes('FLOATING STORAGE')) { category = 'floating_storage'; continue; }
    if (name.toUpperCase().includes('INDIA') && name.length > 10) { category = 'india'; continue; }
    if (!name || name.length < 3) continue;

    try {
      await db.query(
        `INSERT INTO iran_fs_vessels (vessel_name, built, cbm, imo, disponent, operator, previous_name, is_floating_storage, actual_control, position, open_from, notes, category, tc_expiry, dd_date, panama_fitted, scrubber_df) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          row[1] ? String(row[1]).substring(0, 20) : null,
          parseFloat(row[2]) || null,
          String(row[3] || '').trim() || null,
          String(row[4] || '').trim() || null,
          String(row[5] || '').trim() || null,
          String(row[6] || '').trim() || null,
          row[7] ? true : false,
          String(row[8] || '').trim() || null,
          String(row[17] || '').trim() || null,
          parseDate(row[18]),
          String(row[21] || '').trim() || null,
          category,
          parseDate(row[13]),
          parseDate(row[14]),
          String(row[15] || '').trim() === 'P',
          parseSDF(row[16])
        ]
      );
      count++;
    } catch (e) {
      if (count < 3) console.error(`  Iran/FS row ${r} error:`, e.message);
    }
  }
  console.log(`✅ Imported ${count} Iran/FS vessels`);
}

// ─── OLD SHIPS ───────────────────────────────────────
async function importOldShips(wb) {
  const sheet = wb.Sheets['Old ships'];
  if (!sheet) return console.log('⚠ Old ships not found');
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  await db.query(`
    CREATE TABLE IF NOT EXISTS old_ships (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_name VARCHAR(255),
      built VARCHAR(20),
      cbm DECIMAL(10,2),
      disponent VARCHAR(100),
      comment TEXT,
      head_owner VARCHAR(100),
      panama_fitted BOOLEAN DEFAULT FALSE,
      scrubber_df VARCHAR(20),
      dd_date DATE,
      tc_expiry VARCHAR(50)
    )
  `);
  await db.query('DELETE FROM old_ships');

  let count = 0;
  for (let r = 2; r < data.length; r++) {
    const name = String(data[r][0] || '').trim();
    if (!name || name.includes('years') || name.includes('non')) continue;
    try {
      await db.query(
        'INSERT INTO old_ships (vessel_name, built, cbm, disponent, comment, head_owner, panama_fitted, scrubber_df, dd_date, tc_expiry) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [name, String(data[r][1] || ''), parseFloat(data[r][2]) || null, String(data[r][3] || '').trim() || null, String(data[r][4] || '').trim() || null, String(data[r][5] || '').trim() || null, String(data[r][6] || '') === 'P', parseSDF(data[r][7]), parseDate(data[r][8]), String(data[r][9] || '').trim() || null]
      );
      count++;
    } catch(e) {}
  }
  console.log(`✅ Imported ${count} old ships`);
}

// ─── PERTAMINA ───────────────────────────────────────
async function importPertamina(wb) {
  const sheet = wb.Sheets['Pertamina'];
  if (!sheet) return console.log('⚠ Pertamina not found');
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  await db.query(`
    CREATE TABLE IF NOT EXISTS pertamina (
      id INT AUTO_INCREMENT PRIMARY KEY,
      laycan VARCHAR(50),
      load_port VARCHAR(100),
      owner VARCHAR(100),
      vessel VARCHAR(255),
      broker VARCHAR(100),
      won VARCHAR(20)
    )
  `);
  await db.query('DELETE FROM pertamina');

  let count = 0;
  for (let r = 1; r < data.length; r++) {
    const laycan = String(data[r][0] || '').trim();
    if (!laycan) continue;
    try {
      await db.query('INSERT INTO pertamina (laycan, load_port, owner, vessel, broker, won) VALUES (?,?,?,?,?,?)',
        [laycan, String(data[r][1] || '').trim() || null, String(data[r][2] || '').trim() || null, String(data[r][3] || '').trim() || null, String(data[r][4] || '').trim() || null, String(data[r][5] || '').trim() || null]);
      count++;
    } catch(e) {}
  }
  console.log(`✅ Imported ${count} Pertamina entries`);
}

// ─── SCRUBBER/DF/PANAMAX ─────────────────────────────
async function importScrubberDfPanamax(wb) {
  const sheet = wb.Sheets['ScrubberDFPanamax'];
  if (!sheet) return console.log('⚠ ScrubberDFPanamax not found');
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  await db.query(`
    CREATE TABLE IF NOT EXISTS scrubber_df_panamax (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_name VARCHAR(255),
      cbm DECIMAL(10,2),
      built VARCHAR(20),
      head_owner VARCHAR(100),
      category VARCHAR(30),
      fitting_location VARCHAR(100),
      fitting_date DATE
    )
  `);
  await db.query('DELETE FROM scrubber_df_panamax');

  let count = 0;
  // Scrubbers: cols A-F, Dual Fuel: cols J-N
  for (let r = 2; r < data.length; r++) {
    const scrubName = String(data[r][0] || '').trim();
    if (scrubName && !scrubName.includes('VESSEL')) {
      try {
        await db.query('INSERT INTO scrubber_df_panamax (vessel_name, cbm, built, head_owner, category, fitting_location, fitting_date) VALUES (?,?,?,?,?,?,?)',
          [scrubName, parseFloat(data[r][1]) || null, String(data[r][2] || ''), String(data[r][3] || '').trim() || null, 'scrubber', String(data[r][4] || '').trim() || null, parseDate(data[r][5])]);
        count++;
      } catch(e) {}
    }
    const dfName = String(data[r][9] || '').trim();
    if (dfName && !dfName.includes('VESSEL')) {
      try {
        await db.query('INSERT INTO scrubber_df_panamax (vessel_name, cbm, built, head_owner, category) VALUES (?,?,?,?,?)',
          [dfName, parseFloat(data[r][10]) || null, String(data[r][11] || ''), String(data[r][12] || '').trim() || null, 'dual_fuel']);
        count++;
      } catch(e) {}
    }
  }
  console.log(`✅ Imported ${count} scrubber/DF/panamax entries`);
}

// ─── DISCHARGE PORTS ─────────────────────────────────
async function importDischargePorts(wb) {
  const sheet = wb.Sheets['Discharge ports'];
  if (!sheet) return console.log('⚠ Discharge ports not found');
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  await db.query(`
    CREATE TABLE IF NOT EXISTS discharge_ports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      port_name VARCHAR(255),
      receiver VARCHAR(255)
    )
  `);
  await db.query('DELETE FROM discharge_ports');

  let count = 0;
  for (let r = 1; r < data.length; r++) {
    const port = String(data[r][0] || '').trim();
    if (!port) continue;
    try {
      await db.query('INSERT INTO discharge_ports (port_name, receiver) VALUES (?,?)',
        [port, String(data[r][1] || '').trim() || null]);
      count++;
    } catch(e) {}
  }
  console.log(`✅ Imported ${count} discharge ports`);
}

// ─── LOADED BEFORE ───────────────────────────────────
async function importLoadedBefore(wb) {
  const sheet = wb.Sheets['Loaded before'];
  if (!sheet) return console.log('⚠ Loaded before not found');
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  await db.query(`
    CREATE TABLE IF NOT EXISTS loaded_before (
      id INT AUTO_INCREMENT PRIMARY KEY,
      port VARCHAR(100),
      vessel_name VARCHAR(255)
    )
  `);
  await db.query('DELETE FROM loaded_before');

  // Columns = ports (Row 1), rows below = vessel names
  const ports = [];
  for (let c = 0; c < data[0].length; c++) {
    const p = String(data[0][c] || '').trim();
    if (p) ports.push({ col: c, name: p });
  }

  let count = 0;
  for (const port of ports) {
    for (let r = 1; r < data.length; r++) {
      const vessel = String(data[r][port.col] || '').trim();
      if (!vessel) continue;
      try {
        await db.query('INSERT INTO loaded_before (port, vessel_name) VALUES (?,?)', [port.name, vessel]);
        count++;
      } catch(e) {}
    }
  }
  console.log(`✅ Imported ${count} loaded-before records`);
}

// ─── AG LINEUP ───────────────────────────────────────
async function importAgLineup(wb) {
  await db.query('DELETE FROM ag_fixtures');

  // AGsorter sheet
  const sheet1 = wb.Sheets['AGsorter'];
  if (sheet1) {
    const data = XLSX.utils.sheet_to_json(sheet1, { header: 1, defval: '' });
    let count = 0;
    for (let r = 1; r < data.length; r++) {
      // Left block: cols A-E, Right block: cols G-K
      for (const offset of [0, 6]) {
        const laycan = parseDate(data[r][offset]);
        const charterer = String(data[r][offset + 1] || '').trim();
        if (!charterer) continue;
        try {
          await db.query('INSERT INTO ag_fixtures (laycan, charterer, port, vessel, rate, region, year) VALUES (?,?,?,?,?,?,?)',
            [laycan, charterer, String(data[r][offset + 2] || '').trim() || null, String(data[r][offset + 3] || '').trim() || null, String(data[r][offset + 4] || '').trim() || null, 'unsorted', 2025]);
          count++;
        } catch(e) {}
      }
    }
    console.log(`✅ Imported ${count} AG sorter fixtures`);
  }

  // AGlineup2024 sheet (historical)
  const sheet2 = wb.Sheets['AGlineup2024'];
  if (sheet2) {
    const data = XLSX.utils.sheet_to_json(sheet2, { header: 1, defval: '' });
    const regions = [
      { offset: 0, key: 'qatar' }, { offset: 6, key: 'kpc' },
      { offset: 12, key: 'adnoc' }, { offset: 18, key: 'saudi' },
      { offset: 24, key: 'australia' }
    ];
    let count = 0;
    for (let r = 2; r < data.length; r++) {
      for (const reg of regions) {
        const laycan = parseDate(data[r][reg.offset]);
        const charterer = String(data[r][reg.offset + 1] || '').trim();
        if (!charterer) continue;
        try {
          await db.query('INSERT INTO ag_fixtures (laycan, charterer, port, vessel, rate, region, year) VALUES (?,?,?,?,?,?,?)',
            [laycan, charterer, String(data[r][reg.offset + 2] || '').trim() || null, String(data[r][reg.offset + 3] || '').trim() || null, String(data[r][reg.offset + 4] || '').trim() || null, reg.key, 2024]);
          count++;
        } catch(e) {}
      }
    }
    console.log(`✅ Imported ${count} AG lineup 2024 fixtures`);
  }
}

// ─── SETTINGS ────────────────────────────────────────
async function seedSettings() {
  const defaults = [
    ['nb_waiting_days', '6', 'NB Waiting Days (Sorter)'],
    ['app_name', 'VLGC Sorter', 'Application Name'],
  ];
  for (const [key, val, desc] of defaults) {
    await db.query(
      'INSERT INTO settings (setting_key, setting_value, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value=setting_value',
      [key, val, desc]
    );
  }
  console.log('✅ Default settings seeded');
}

// ─── HELPERS ─────────────────────────────────────────
function parseDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const utcDays = Math.floor(val - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function parseSDF(val) {
  const v = String(val || '').trim().toUpperCase();
  if (v === 'S' || v === 'SCRUBBER') return 'scrubber';
  if (v === 'DF' || v === 'DUAL FUEL') return 'dual_fuel';
  if (v === 'DT' || v === 'DECK TANK') return 'deck_tank';
  return 'none';
}

seedTrackerData().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
