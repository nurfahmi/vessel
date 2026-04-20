const db = require('../config/database');
const Setting = require('../models/Setting');

const KPLER_AUTH_URL = 'https://auth.kpler.com/oauth/token';
const KPLER_API_BASE = 'https://terminal.kpler.com/api';

let cachedToken = null;
let tokenExpiry = 0;

/** Convert ISO datetime or Date object to MySQL format */
function toMysqlDate(s) {
  if (!s) return null;
  if (s instanceof Date) s = s.toISOString();
  if (typeof s !== 'string') s = String(s);
  return s.replace('T', ' ').replace('Z', '').substring(0, 19);
}

/**
 * Extract vessel data from the /api/vessels list response format
 */
function extractFromList(v) {
  const lp = v.lastPosition || {};
  const geo = lp.geo || {};
  const pc = (v.portCallInfo || {}).lastPortCall || {};
  const ais = v.lastRawAisSignals || {};
  const nd = v.nextDestination || {};
  const ndZone = nd.zone || {};
  const ndInstall = nd.installation || {};
  const vc = (v.vesselController || {}).default || {};
  const build = v.build || {};
  const engine = v.engineMetrics || {};
  const cargoM = v.cargoMetrics || {};
  const pcZone = pc.zone || {};
  const pcInstall = pc.installation || {};
  const pcVc = pc.vesselController || {};
  const country = pcZone.country;
  const ndCountry = ndZone.country;

  return {
    kpler_id: v.id,
    name: v.name,
    imo: v.imo,
    mmsi: v.mmsi,
    call_sign: v.callSign,
    flag: v.flagName,
    status: v.status,
    built_year: build.buildYear,
    built_country: build.buildCountry,
    cbm: cargoM.capacity,
    cargo_type: cargoM.cargoType,
    num_tanks: cargoM.numberTanks,
    deadweight: v.deadWeight,
    max_speed: engine.maxSpeed,
    horsepower: engine.horsePower,
    is_ethylene_capable: v.isEthyleneCapable || false,
    state: v.state,
    is_open: v.isOpen || false,
    lat: geo.lat,
    lon: geo.lon,
    speed: lp.speed,
    course: lp.course,
    draught: lp.draught,
    position_time: lp.receivedTime,
    loaded: (lp.currentCargo || {}).loaded || false,
    ais_destination: ais.rawDestination,
    ais_eta: ais.eta,
    next_dest_name: ndInstall.name,
    next_dest_zone: ndZone.name || null,
    next_dest_country: typeof ndCountry === 'object' && ndCountry ? ndCountry.name : null,
    next_dest_eta: nd.eta,
    next_dest_type: ndInstall.shortType,
    last_port: pcInstall.name,
    last_port_country: typeof country === 'object' && country ? country.name : null,
    last_port_type: pcInstall.shortType,
    last_port_arrival: pc.estimatedBerthArrival,
    last_port_departure: pc.estimatedBerthDeparture,
    vessel_availability: pc.vesselAvailability,
    zone_port: pcZone.name,
    zone_country: typeof country === 'object' && country ? country.name : null,
    controller: vc.name || pcVc.name || null,
    data_timestamp: v.timestamp,
  };
}

/**
 * Get a fresh access token using the refresh token, or fallback to direct token
 */
async function getAccessToken() {
  // Return cached if still valid (with 30s buffer)
  if (cachedToken && Date.now() < tokenExpiry - 30000) {
    return cachedToken;
  }

  const clientId = await Setting.get('kpler_client_id');
  const refreshToken = await Setting.get('kpler_refresh_token');

  // Try refresh token first
  if (refreshToken) {
    try {
      const body = new URLSearchParams({
        client_id: clientId || '0LglhXfJvfepANl3HqVT9i1U0OwV0gSP',
        redirect_uri: 'https://terminal.kpler.com/oauth/callback',
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });

      const res = await fetch(KPLER_AUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://terminal.kpler.com',
        },
        body: body.toString()
      });

      if (res.ok) {
        const data = await res.json();
        cachedToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in || 300) * 1000;

        // Save the new rotated refresh token
        if (data.refresh_token) {
          await Setting.set('kpler_refresh_token', data.refresh_token);
        }
        return cachedToken;
      }
    } catch (e) { /* fall through to direct token */ }
  }

  // Fallback: use direct access token from settings
  const directToken = await Setting.get('kpler_access_token');
  if (directToken) {
    cachedToken = directToken;
    tokenExpiry = Date.now() + 280000; // assume ~5 min
    return cachedToken;
  }

  throw new Error('No valid Kpler token. Go to Settings → paste kpler_access_token or kpler_refresh_token.');
}

/**
 * Set access token directly (for quick paste from browser)
 */
async function setAccessToken(token) {
  await Setting.set('kpler_access_token', token);
  cachedToken = token;
  tokenExpiry = Date.now() + 280000;
}

/**
 * Call Kpler API with auto-refreshing token
 */
async function kplerFetch(endpoint) {
  const token = await getAccessToken();
  const res = await fetch(`${KPLER_API_BASE}${endpoint}`, {
    headers: {
      'Accept': 'application/json',
      'x-access-token': token,
      'use-access-token': 'true',
      'User-Agent': 'VLGC-Sorter/1.0'
    }
  });

  if (res.status === 401) {
    // Token expired, clear cache and retry once
    cachedToken = null;
    const newToken = await getAccessToken();
    const retry = await fetch(`${KPLER_API_BASE}${endpoint}`, {
      headers: {
        'Accept': 'application/json',
        'x-access-token': newToken,
        'use-access-token': 'true',
        'User-Agent': 'VLGC-Sorter/1.0'
      }
    });
    if (!retry.ok) throw new Error(`Kpler API error: ${retry.status}`);
    return retry.json();
  }

  if (!res.ok) throw new Error(`Kpler API error: ${res.status}`);
  return res.json();
}

/**
 * Fetch a single vessel by Kpler vessel ID
 */
async function fetchVessel(kplerVesselId) {
  return kplerFetch(`/vessels/${kplerVesselId}`);
}

/**
 * Extract tracker-relevant data from Kpler vessel JSON
 */
function extractTrackerData(vessel) {
  const result = {
    name: vessel.name,
    imo: vessel.imo,
    mmsi: vessel.mmsi,
    state: vessel.state,
    flag: vessel.flagName,
    cbm: vessel.cargoMetrics?.capacity,
    built_year: vessel.build?.buildYear,
    built_month: vessel.build?.buildMonth,
    builder: vessel.builder,
    speed: vessel.positionSnapshot?.speed,
    lat: vessel.positionSnapshot?.position?.lat,
    lon: vessel.positionSnapshot?.position?.lon,
    draught: vessel.positionSnapshot?.draught,
    operator: vessel.players?.operators?.[0]?.name || null,
    kpler_vessel_id: vessel.id,
  };

  // Extract from portCallInfo
  const pc = vessel.portCallInfo?.lastPortCall;
  if (pc) {
    result.last_port = pc.installation?.name || null;
    result.last_port_country = pc.zone?.country?.name || null;
    result.last_port_type = pc.installation?.shortType || null;
    result.controller = pc.vesselController?.name || null;
    result.vessel_availability = pc.vesselAvailability || null;
    result.estimated_departure = pc.estimatedBerthDeparture || null;
    result.berth_arrival = pc.estimatedBerthArrival || null;

    // Extract position from zone parentZones
    // Priority: look for "custom" type zones like "South China", "Far East"
    const zones = pc.zone?.parentZones || [];
    const customZones = zones.filter(z => z.type === 'custom');
    const subregion = zones.find(z => z.type === 'subregion');
    const country = zones.find(z => z.type === 'country');
    
    // Pick the best position name
    if (customZones.length) {
      // Prefer shorter custom zone names (more specific)
      const sorted = customZones.sort((a, b) => a.name.length - b.name.length);
      result.position = sorted[0].name;
      result.position_detail = sorted.map(z => z.name).join(', ');
    } else if (subregion) {
      result.position = subregion.name;
    } else if (country) {
      result.position = country.name;
    }

    // Cargo info
    const cargo = pc.flowQuantitiesViews || [];
    result.cargo = cargo.map(c => c.name).join(', ');
    result.cargo_volume = Math.abs(pc.flowQuantity?.volume || 0);

    // Calculate open dates using transit_times table
    const nd = vessel.nextDestination || vessel.portCallInfo?.nextDestination;
    const state = vessel.state;
    const dep = pc.estimatedBerthDeparture ? new Date(pc.estimatedBerthDeparture) : null;
    const nextEta = nd?.eta ? new Date(nd.eta) : null;
    const ndZone = nd?.zone?.name || nd?.installation?.name || null;

    // Discharge days by region
    const dischargeDays = (zone) => {
      if (!zone) return 4;
      const z = zone.toLowerCase();
      if (/japan|korea|china|taiwan|indo|vietnam|thailand|malaysia|philippines|singapore|far east|australia|darwin/.test(z)) return 3; // Asia
      if (/india|bangladesh|pakistan|galle|wci|eci/.test(z)) return 5; // India
      if (/eu|flushing|terneuzen|bethioua|algeria|gibraltar|turkey|greece|east med|mohammedia/.test(z)) return 4; // Europe/Med
      return 4; // default
    };

    // Loading days at load port
    const loadingDays = 2;

    if (state === 'loaded' && nextEta) {
      // Loaded → heading to discharge → open = ETA + discharge days
      result.open_from = new Date(nextEta.getTime() + dischargeDays(ndZone) * 86400000);
    } else if (state === 'ballast' && !nd && dep) {
      // Ballast, no orders → already open
      result.open_from = dep;
    } else if (state === 'ballast' && nextEta) {
      // Ballast heading to load port → need transit to discharge
      // We'll calculate: ETA(load port) + loading + transit + discharge
      // Transit lookup happens in availability route with DB access
      // Here estimate: loadingDays + 14 avg transit + 4 discharge = +20
      result.open_from = new Date(nextEta.getTime() + (loadingDays + 14 + 4) * 86400000);
    } else if (dep) {
      result.open_from = dep;
    }

    if (result.open_from) {
      const openTo = new Date(result.open_from);
      openTo.setDate(openTo.getDate() + 1);
      result.open_to = openTo;
    }
  }

  return result;
}

/**
 * Sync a single vessel: fetch from API → update tracker
 */
async function syncVessel(kplerVesselId) {
  const data = await fetchVessel(kplerVesselId);
  const extracted = extractTrackerData(data);

  // Find matching vessel in our DB by IMO or name
  let [vessels] = await db.query(
    'SELECT id FROM vessels WHERE imo = ? OR LOWER(TRIM(name)) = LOWER(TRIM(?))',
    [extracted.imo, extracted.name]
  );

  if (!vessels.length) {
    return { status: 'not_found', name: extracted.name, imo: extracted.imo };
  }

  const vesselId = vessels[0].id;

  // Update vessel's kpler_vessel_id
  await db.query('UPDATE vessels SET kpler_vessel_id = ? WHERE id = ?', [kplerVesselId, vesselId]);

  // Update tracker entry
  const [tracker] = await db.query('SELECT id FROM tracker_entries WHERE vessel_id = ?', [vesselId]);
  if (tracker.length) {
    await db.query(
      `UPDATE tracker_entries SET 
        position = COALESCE(?, position), 
        open_from = COALESCE(?, open_from), 
        open_to = COALESCE(?, open_to),
        edited_by = 'API',
        updated_at = NOW()
      WHERE vessel_id = ?`,
      [extracted.position, extracted.open_from, extracted.open_to, vesselId]
    );
  }

  // Update kpler_data
  await db.query(
    `INSERT INTO kpler_data (vessel_name, capacity_m3, state, status, mmsi, imo, next_destination, next_destination_eta, import_batch) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'api_sync')
     ON DUPLICATE KEY UPDATE state=VALUES(state), next_destination=VALUES(next_destination), next_destination_eta=VALUES(next_destination_eta)`,
    [extracted.name, extracted.cbm, extracted.state, 'Active', extracted.mmsi, extracted.imo, 
     extracted.last_port, extracted.estimated_departure]
  );

  return { status: 'synced', name: extracted.name, position: extracted.position, open_from: extracted.open_from };
}

/**
 * Sync all vessels using bulk /api/vessels endpoint (single API call)
 * Then auto-enrich only vessels with missing position/AIS data
 */
async function syncAll(onProgress) {
  const notify = onProgress || (() => {});
  notify({ phase: 'bulk', current: 'Fetching fleet data...' });

  // 1. Fetch all vessels in one call
  const allVessels = await kplerFetch('/vessels');
  
  // 2. Filter VLGC + LPG
  const vlgc = allVessels.filter(v => v.vesselTypeClass === 'VLGC' && v.currentCommodityType === 'lpg');
  
  const results = { synced: 0, failed: 0, total: vlgc.length, enriched: 0, enrichTotal: 0, errors: [] };

  for (const v of vlgc) {
    try {
      const extracted = extractFromList(v);
      
      // Update kpler_vessels table
      await db.query(
        `INSERT INTO kpler_vessels (kpler_id, name, imo, mmsi, call_sign, flag, status,
          built_year, built_country, cbm, cargo_type, num_tanks, deadweight, max_speed, horsepower,
          is_ethylene_capable, state, is_open, lat, lon, speed, course, draught, position_time,
          loaded, ais_destination, ais_eta, next_dest_name, next_dest_zone, next_dest_country, next_dest_eta,
          next_dest_type, last_port, last_port_country, last_port_type, last_port_arrival,
          last_port_departure, vessel_availability, position_zones, zone_port, zone_country,
          controller, data_timestamp)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          state=VALUES(state), is_open=VALUES(is_open), lat=VALUES(lat), lon=VALUES(lon),
          speed=VALUES(speed), course=VALUES(course), draught=VALUES(draught),
          position_time=VALUES(position_time), loaded=VALUES(loaded),
          ais_destination=VALUES(ais_destination), ais_eta=VALUES(ais_eta),
          next_dest_name=VALUES(next_dest_name), next_dest_zone=VALUES(next_dest_zone), next_dest_country=VALUES(next_dest_country),
          next_dest_eta=VALUES(next_dest_eta), controller=VALUES(controller),
          last_port=VALUES(last_port), last_port_country=VALUES(last_port_country),
          last_port_departure=VALUES(last_port_departure), vessel_availability=VALUES(vessel_availability),
          data_timestamp=VALUES(data_timestamp)`,
        [extracted.kpler_id, extracted.name, extracted.imo, extracted.mmsi, extracted.call_sign,
         extracted.flag, extracted.status, extracted.built_year, extracted.built_country,
         extracted.cbm, extracted.cargo_type, extracted.num_tanks, extracted.deadweight,
         extracted.max_speed, extracted.horsepower, extracted.is_ethylene_capable,
         extracted.state, extracted.is_open, extracted.lat, extracted.lon,
         extracted.speed, extracted.course, extracted.draught, toMysqlDate(extracted.position_time),
         extracted.loaded, extracted.ais_destination, toMysqlDate(extracted.ais_eta),
         extracted.next_dest_name, extracted.next_dest_zone, extracted.next_dest_country, toMysqlDate(extracted.next_dest_eta),
         extracted.next_dest_type, extracted.last_port, extracted.last_port_country,
         extracted.last_port_type, toMysqlDate(extracted.last_port_arrival),
         toMysqlDate(extracted.last_port_departure), extracted.vessel_availability,
         null, extracted.zone_port, extracted.zone_country,
         extracted.controller, toMysqlDate(extracted.data_timestamp)]
      );
      
      results.synced++;
    } catch (err) {
      results.failed++;
      results.errors.push({ name: v.name, error: err.message });
    }
  }

  notify({ phase: 'bulk_done', synced: results.synced });

  // 3. Auto-enrich: only Active vessels missing key data (skip Under Construction)
  const [missing] = await db.query(
    `SELECT kpler_id, name FROM kpler_vessels 
     WHERE enriched_at IS NULL 
       AND status != 'Under Construction'
       AND ((position IS NULL OR position = '') OR (next_dest_name IS NULL OR next_dest_name = ''))`
  );

  results.enrichTotal = missing.length;

  if (missing.length > 0) {
    console.log(`[Kpler Sync] Enriching ${missing.length} vessels with missing data...`);
    notify({ phase: 'enrich', enrichTotal: missing.length, enriched: 0 });
    for (let i = 0; i < missing.length; i++) {
      const v = missing[i];
      try {
        console.log(`[Kpler Sync] ${i + 1}/${missing.length} — ${v.name}`);
        notify({ phase: 'enrich', enriched: i, enrichTotal: missing.length, current: v.name });
        const data = await fetchVessel(v.kpler_id);
        const enriched = extractTrackerData(data);

        await db.query(
          `UPDATE kpler_vessels SET 
            position = COALESCE(?, position), position_detail = COALESCE(?, position_detail),
            cargo = ?, cargo_volume = ?,
            open_from = COALESCE(?, open_from), open_to = COALESCE(?, open_to),
            controller = COALESCE(?, controller),
            operator = ?, owner = ?, commercial_manager = ?,
            last_port = COALESCE(?, last_port),
            last_port_country = COALESCE(?, last_port_country),
            last_port_departure = COALESCE(?, last_port_departure),
            vessel_availability = COALESCE(?, vessel_availability),
            lat = COALESCE(?, lat), lon = COALESCE(?, lon),
            zone_port = COALESCE(?, zone_port),
            zone_country = COALESCE(?, zone_country),
            next_dest_name = COALESCE(?, next_dest_name),
            next_dest_country = COALESCE(?, next_dest_country),
            enriched_at = NOW()
          WHERE kpler_id = ?`,
          [
            enriched.position, enriched.position_detail,
            enriched.cargo, enriched.cargo_volume,
            toMysqlDate(enriched.open_from), toMysqlDate(enriched.open_to),
            enriched.controller,
            enriched.operator, data.players?.owners?.[0]?.name || null,
            data.players?.commercialManagers?.[0]?.name || null,
            enriched.last_port, enriched.last_port_country,
            toMysqlDate(enriched.estimated_departure),
            enriched.vessel_availability,
            enriched.lat, enriched.lon,
            enriched.last_port, enriched.last_port_country,
            data.nextDestination?.installation?.name || data.lastRawAisSignals?.rawDestination || null,
            data.nextDestination?.zone?.country?.name || null,
            v.kpler_id
          ]
        );

        results.enriched++;
        await new Promise(r => setTimeout(r, 100)); // rate limit
      } catch (err) {
        console.error(`[Kpler Sync] ✕ ${v.name}: ${err.message}`);
        results.errors.push({ name: v.name, error: err.message });
      }
    }
  }

  // Update last sync time
  await Setting.set('kpler_last_sync', new Date().toISOString());

  return results;
}

/**
 * Enrich kpler_vessels with detailed data from individual vessel endpoints
 * This gets: position (zone), open_from/to, cargo, operator, owner
 */
async function enrichAll(progressCallback) {
  const [vessels] = await db.query('SELECT kpler_id, name FROM kpler_vessels ORDER BY name');
  const results = { enriched: 0, failed: 0, total: vessels.length, errors: [] };

  for (let i = 0; i < vessels.length; i++) {
    const v = vessels[i];
    try {
      const data = await fetchVessel(v.kpler_id);
      const enriched = extractTrackerData(data);

      await db.query(
        `UPDATE kpler_vessels SET 
          position = ?, position_detail = ?,
          cargo = ?, cargo_volume = ?,
          open_from = ?, open_to = ?,
          controller = COALESCE(?, controller),
          operator = ?, owner = ?, commercial_manager = ?,
          last_port = COALESCE(?, last_port),
          last_port_country = COALESCE(?, last_port_country),
          last_port_departure = COALESCE(?, last_port_departure),
          vessel_availability = COALESCE(?, vessel_availability),
          enriched_at = NOW()
        WHERE kpler_id = ?`,
        [
          enriched.position, enriched.position_detail,
          enriched.cargo, enriched.cargo_volume,
          toMysqlDate(enriched.open_from), toMysqlDate(enriched.open_to),
          enriched.controller,
          enriched.operator, data.players?.owners?.[0]?.name || null,
          data.players?.commercialManagers?.[0]?.name || null,
          enriched.last_port, enriched.last_port_country,
          toMysqlDate(enriched.estimated_departure),
          enriched.vessel_availability,
          v.kpler_id
        ]
      );

      results.enriched++;
      if (progressCallback) progressCallback(i + 1, vessels.length, v.name);

      // Rate limit: 300ms between requests
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      results.failed++;
      results.errors.push({ name: v.name, error: err.message });
    }
  }

  return results;
}

/**
 * Fetch voyages (past + forecast) for a vessel via Kpler GraphQL
 */
async function fetchVoyages(kplerVesselId, size = 15) {
  const token = await getAccessToken();
  const query = {
    operationName: 'voyages',
    variables: {
      size,
      where: {
        vesselIds: [String(kplerVesselId)],
        locations: [], fromLocations: [], toLocations: [], subLocations: [], productIds: []
      },
      sort: { sortBy: 'START' }
    },
    query: `query voyages($size: Int!, $where: VoyageFiltersInput!, $sort: VoyageSortsInput) {
      voyages(size: $size, where: $where, sort: $sort) {
        items {
          id start end
          charter { charterer { id name } }
          portCalls {
            operation start end eta forecasted
            installation { id name }
            zone { id name }
            flowQuantities {
              product { name }
              flowQuantity: quantity { mass volume }
            }
          }
        }
      }
    }`
  };

  const res = await fetch('https://terminal.kpler.com/graphql/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
      'use-access-token': 'true',
      'apollographql-client-name': 'Web',
    },
    body: JSON.stringify(query)
  });

  if (!res.ok) throw new Error(`Kpler GraphQL error: ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data.voyages.items || [];
}

module.exports = {
  getAccessToken,
  setAccessToken,
  fetchVessel,
  fetchVoyages,
  extractTrackerData,
  syncVessel,
  syncAll,
  enrichAll,
  kplerFetch,
  toMysqlDate
};
