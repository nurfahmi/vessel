const { Destination, TransitTime, PortArea, PortAlias } = require('../models/VoyageData');
const Setting = require('../models/Setting');

/**
 * Format ETA range as "dd-dd MMM" like the Excel does
 */
function formatETARange(date1, date2) {
  if (!date1) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d1 = new Date(date1);
  const d2 = date2 ? new Date(date2) : d1;

  const day1 = d1.getDate().toString().padStart(2, '0');
  const day2 = d2.getDate().toString().padStart(2, '0');
  const mon = months[d2.getMonth()];

  if (day1 === day2) return `${day1} ${mon}`;
  return `${day1}-${day2} ${mon}`;
}

/**
 * Build an in-memory lookup map for fast batch processing.
 * Loads transit_times, port_areas, and port_aliases into memory.
 */
async function buildLookupMap() {
  const db = require('../config/database');

  // Load all transit times
  const [transitRows] = await db.query(
    `SELECT t.from_position, d.\`key\` as dest_key, t.transit_days 
     FROM transit_times t JOIN destinations d ON t.destination_id = d.id`
  );
  const transitMap = {};
  transitRows.forEach(r => {
    transitMap[`${r.from_position.toLowerCase().trim()}|${r.dest_key}`] = parseFloat(r.transit_days);
  });

  // Load all port areas (AIS location → area)
  const [areaRows] = await db.query('SELECT location_name, area FROM port_areas');
  const areaMap = {};
  areaRows.forEach(r => { areaMap[r.location_name.toLowerCase().trim()] = r.area; });

  // Load all aliases
  const [aliasRows] = await db.query('SELECT alias_name, canonical_name FROM port_aliases');
  const aliasMap = {};
  aliasRows.forEach(r => { aliasMap[r.alias_name.toLowerCase().trim()] = r.canonical_name; });

  // Load destinations
  const [destRows] = await db.query('SELECT * FROM destinations ORDER BY sort_order');

  return { transitMap, areaMap, aliasMap, destinations: destRows };
}

/**
 * Resolve a position through the lookup chain:
 * 1. Direct match in transit_times
 * 2. Alias lookup → then transit_times
 * 3. Port area lookup → then transit_times
 */
function resolveTransitDays(position, destKey, lookup) {
  const pos = (position || '').toLowerCase().trim();
  if (!pos) return null;

  // 1. Direct match
  const direct = lookup.transitMap[`${pos}|${destKey}`];
  if (direct !== undefined) return direct;

  // 2. Alias lookup
  const canonical = lookup.aliasMap[pos];
  if (canonical) {
    const aliased = lookup.transitMap[`${canonical.toLowerCase().trim()}|${destKey}`];
    if (aliased !== undefined) return aliased;
  }

  // 3. Port area lookup (AIS location → area → transit)
  const area = lookup.areaMap[pos];
  if (area) {
    let extraDays = 0;
    let baseArea = area;
    // Parse "Area + N" suffix (e.g. "East China + 4" → base "East China" + 4 extra days)
    const plusMatch = baseArea.match(/^(.+?)\s*\+\s*(\d+\.?\d*)$/);
    if (plusMatch) { baseArea = plusMatch[1].trim(); extraDays = parseFloat(plusMatch[2]); }
    // Strip parenthetical notes (e.g. "AG ( DD, BW Trader)" → "AG")
    baseArea = baseArea.replace(/\s*\(.*\)\s*$/, '').trim();
    // Strip arrow notation (e.g. "Ridley->Far East + 14" → "Far East")
    if (baseArea.includes('->')) baseArea = baseArea.split('->').pop().trim();

    const baseTransit = lookup.transitMap[`${baseArea.toLowerCase()}|${destKey}`];
    if (baseTransit !== undefined) return baseTransit + extraDays;
  }

  return null;
}

/**
 * Calculate all ETAs for a single vessel
 */
async function calculateAllETAs(position, openFrom, openTo) {
  const lookup = await buildLookupMap();
  const etas = {};
  for (const dest of lookup.destinations) {
    const transitDays = resolveTransitDays(position, dest.key, lookup);
    if (transitDays !== null && openFrom) {
      const etaStart = new Date(openFrom);
      etaStart.setDate(etaStart.getDate() + Math.ceil(transitDays));
      let etaEnd = null;
      if (openTo) {
        etaEnd = new Date(openTo);
        etaEnd.setDate(etaEnd.getDate() + Math.ceil(transitDays));
      }
      etas[dest.key] = { start: etaStart, end: etaEnd, transitDays, formatted: formatETARange(etaStart, etaEnd) };
    } else {
      etas[dest.key] = null;
    }
  }
  return etas;
}

/**
 * Batch calculate ETAs for multiple tracker entries.
 * Loads all lookup data once for performance.
 */
async function batchCalculateETAs(trackerEntries) {
  const lookup = await buildLookupMap();

  return trackerEntries.map(entry => {
    const etas = {};
    for (const dest of lookup.destinations) {
      const transitDays = resolveTransitDays(entry.position, dest.key, lookup);

      if (transitDays !== null && entry.open_from) {
        const etaStart = new Date(entry.open_from);
        etaStart.setDate(etaStart.getDate() + Math.ceil(transitDays));
        let etaEnd = null;
        if (entry.open_to) {
          etaEnd = new Date(entry.open_to);
          etaEnd.setDate(etaEnd.getDate() + Math.ceil(transitDays));
        }
        etas[dest.key] = { start: etaStart, end: etaEnd, transitDays, formatted: formatETARange(etaStart, etaEnd) };
      } else {
        etas[dest.key] = null;
      }
    }
    return { ...entry, etas };
  });
}

/**
 * Get destination list for views
 */
async function getDestinations() {
  const db = require('../config/database');
  const [rows] = await db.query('SELECT * FROM destinations ORDER BY sort_order');
  return rows.map(r => ({ key: r.key, label: r.short_label || r.label }));
}

/**
 * Check if AIS data is stale
 * Replicates: =IF(W3="","NO AIS",IF((W3-M3-1)>0,"Update",""))
 */
function checkAISStatus(kplerEtaDate, openFromDate) {
  if (!kplerEtaDate) return 'NO AIS';
  if (!openFromDate) return '';
  const eta = new Date(kplerEtaDate);
  const openFrom = new Date(openFromDate);
  const diffDays = (eta - openFrom) / (1000 * 60 * 60 * 24) - 1;
  return diffDays > 0 ? 'Update' : '';
}

module.exports = {
  calculateAllETAs,
  batchCalculateETAs,
  getDestinations,
  checkAISStatus,
  formatETARange,
  buildLookupMap,
  resolveTransitDays
};
