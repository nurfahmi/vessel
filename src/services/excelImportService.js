const XLSX = require('xlsx');
const path = require('path');

/**
 * Parse Kpler Excel export into structured records
 * Maps columns: Name(E), Capacity(F), Deadweight(G), State(H), Status(I), MMSI(J), IMO(K), NextDest(L), NextDestETA(M), Loaded(N)
 */
function parseKplerExcel(filePath) {
  const workbook = XLSX.readFile(filePath);

  // Try to find the Kpler sheet
  let sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('kpler')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Find header row - look for "Name" column
  let headerRow = 0;
  let nameCol = -1;

  for (let r = 0; r < Math.min(rawData.length, 5); r++) {
    const row = rawData[r];
    for (let c = 0; c < row.length; c++) {
      if (String(row[c]).toLowerCase().trim() === 'name') {
        headerRow = r;
        nameCol = c;
        break;
      }
    }
    if (nameCol >= 0) break;
  }

  if (nameCol < 0) {
    // Fallback - assume column E (index 4) based on Excel structure
    nameCol = 4;
    headerRow = 0;
  }

  const records = [];
  for (let r = headerRow + 1; r < rawData.length; r++) {
    const row = rawData[r];
    const name = String(row[nameCol] || '').trim();
    if (!name) continue;

    // Parse ETA - can be Excel serial date, string like "19 Apr 2026 00:00", or Date object
    let eta = row[nameCol + 8] || null;
    if (eta) {
      if (typeof eta === 'number') {
        eta = excelDateToJS(eta);
      } else if (typeof eta === 'string') {
        // Handle Kpler format: "19 Apr 2026 00:00" or similar
        eta = new Date(eta);
        if (isNaN(eta.getTime())) eta = null;
      } else if (eta instanceof Date) {
        // Already a Date
      } else {
        eta = null;
      }
    }

    // Parse Loaded - can be boolean true/false or string "True"/"False"
    const loadedRaw = row[nameCol + 9];
    const isLoaded = loadedRaw === true || String(loadedRaw || '').toLowerCase() === 'true';

    records.push({
      vessel_name: name,
      capacity_m3: parseFloat(row[nameCol + 1]) || null,
      deadweight: parseFloat(row[nameCol + 2]) || null,
      state: String(row[nameCol + 3] || 'open').toLowerCase().trim(),
      status: String(row[nameCol + 4] || 'Active').trim(),
      mmsi: String(row[nameCol + 5] || '').trim() || null,
      imo: String(row[nameCol + 6] || '').trim() || null,
      next_destination: String(row[nameCol + 7] || '').trim() || null,
      next_destination_eta: eta,
      is_loaded: isLoaded
    });
  }

  return { records, sheetName, headerRow };
}

/**
 * Parse the Tracker sheet from the full VLGC Sorter workbook
 */
function parseTrackerSheet(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames.find(n => n.includes('Tracker')) || '2) Tracker';
  if (!workbook.Sheets[sheetName]) return [];

  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const records = [];
  // Row 2 is header (index 1), data starts at row 3 (index 2)
  for (let r = 2; r < rawData.length; r++) {
    const row = rawData[r];
    const name = String(row[0] || '').trim(); // Column A = Vessel
    if (!name) continue;

    records.push({
      vessel_name: name,
      built: row[1] || null,
      cbm: parseFloat(row[2]) || null,
      us_trade: String(row[3] || '').trim().toUpperCase() === 'US',
      chinese_built: String(row[4] || '').trim().toUpperCase() === 'C',
      deck_tank: !!row[6],
      scrubber_df: parseScrubberDF(row[7]),
      controller: String(row[8] || '').trim() || null,
      position: String(row[11] || '').trim() || null,
      open_from: parseExcelDate(row[12]),
      open_to: parseExcelDate(row[13]),
      notes: String(row[15] || '').trim() || null,
      next_loading: String(row[16] || '').trim() || null,
      current_voyage: String(row[17] || '').trim() || null,
      edited_by: String(row[18] || '').trim() || null,
      laden_v_cape: String(row[10] || '').trim() || null,
    });
  }

  return records;
}

function parseScrubberDF(val) {
  const v = String(val || '').trim().toUpperCase();
  if (v === 'S') return 'scrubber';
  if (v === 'DF') return 'dual_fuel';
  if (v === 'DT') return 'deck_tank';
  return 'none';
}

function parseExcelDate(val) {
  if (!val) return null;
  if (typeof val === 'number') return excelDateToJS(val);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function excelDateToJS(serial) {
  const utcDays = Math.floor(serial - 25569);
  return new Date(utcDays * 86400 * 1000);
}

module.exports = {
  parseKplerExcel,
  parseTrackerSheet,
  parseExcelDate,
  excelDateToJS
};
