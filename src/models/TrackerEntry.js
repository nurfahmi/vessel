const db = require('../config/database');

const TrackerEntry = {
  async getAll() {
    const [rows] = await db.query(`
      SELECT t.*, v.name as vessel_name, v.built, v.cbm, v.us_trade, v.chinese_built, 
             v.panamax, v.deck_tank, v.scrubber_df, v.controller, v.head_owner
      FROM tracker_entries t
      JOIN vessels v ON t.vessel_id = v.id
      ORDER BY v.name
    `);
    return rows;
  },

  async getWithKpler() {
    const [rows] = await db.query(`
      SELECT t.*, v.name as vessel_name, v.built, v.cbm, v.us_trade, v.chinese_built, 
             v.panamax, v.deck_tank, v.scrubber_df, v.controller as vessel_controller, 
             v.head_owner, v.imo, v.mmsi, v.kpler_vessel_id,
             kv.state as kpler_state, kv.status as kpler_status, kv.cbm as kpler_cbm,
             kv.flag as kpler_flag, kv.built_year as kpler_built_year,
             kv.lat as kpler_lat, kv.lon as kpler_lon, kv.speed as kpler_speed,
             kv.next_dest_name, kv.next_dest_eta, kv.next_dest_country,
             kv.last_port, kv.last_port_country, kv.last_port_departure,
             kv.vessel_availability, kv.controller as kpler_controller,
             kv.zone_port, kv.zone_country, kv.loaded as kpler_loaded,
             kv.ais_destination, kv.ais_eta, kv.data_timestamp as kpler_updated,
             kv.is_open as kpler_is_open, kv.draught as kpler_draught,
             kv.position as kpler_position, kv.position_detail as kpler_position_detail,
             kv.open_from as kpler_open_from, kv.open_to as kpler_open_to,
             kv.cargo as kpler_cargo, kv.operator as kpler_operator, kv.owner as kpler_owner,
             kv.commercial_manager as kpler_cm,
             kv.estimated_berth_departure, kv.estimated_berth_arrival
      FROM tracker_entries t
      JOIN vessels v ON t.vessel_id = v.id
      LEFT JOIN kpler_vessels kv ON v.kpler_vessel_id = kv.kpler_id
      ORDER BY COALESCE(kv.controller, v.controller, 'zzz'), v.name
    `);
    
    // Build lookup for auto-resolving position from API data
    const [areaRows] = await db.query('SELECT location_name, area FROM port_areas');
    const areaMap = {};
    areaRows.forEach(r => { areaMap[r.location_name.toLowerCase().trim()] = r.area; });

    const [transitPositions] = await db.query('SELECT DISTINCT from_position FROM transit_times');
    const validPositions = new Set(transitPositions.map(r => r.from_position.toLowerCase().trim()));

    // Resolve an API value to a valid position option
    function resolvePosition(value) {
      if (!value) return null;
      const key = value.toLowerCase().trim();
      // Direct match in transit positions
      if (validPositions.has(key)) return transitPositions.find(r => r.from_position.toLowerCase().trim() === key).from_position;
      // Lookup via port_areas
      const area = areaMap[key];
      if (!area) return null;
      // Parse area name: strip parenthetical notes, "+N" suffix, and "->" arrows
      let baseArea = area;
      // Handle "Area + N" suffix (e.g. "East China + 4")
      const plusMatch = baseArea.match(/^(.+?)\s*\+\s*\d/);
      if (plusMatch) baseArea = plusMatch[1].trim();
      // Handle parenthetical notes (e.g. "AG ( DD, BW Trader)" → "AG")
      baseArea = baseArea.replace(/\s*\(.*\)\s*$/, '').trim();
      // Handle arrow notation (e.g. "Ridley->Far East + 14" → "Far East")
      if (baseArea.includes('->')) baseArea = baseArea.split('->').pop().trim();

      if (validPositions.has(baseArea.toLowerCase())) {
        return transitPositions.find(r => r.from_position.toLowerCase().trim() === baseArea.toLowerCase()).from_position;
      }
      return null;
    }

    /**
     * Smart Open From calculation based on vessel state:
     * - Ballast at port, no next dest: Open From = estimatedBerthDeparture (or now)
     * - Ballast with next dest (heading to load): Open From = next_dest_eta (arrives at load port)
     * - Loaded, heading to discharge: Open From = next_dest_eta + 5 days (discharge time)
     */
    function calcOpenFrom(r) {
      const state = r.kpler_state;
      const nextEta = r.next_dest_eta || r.ais_eta;
      const departure = r.estimated_berth_departure || r.last_port_departure;
      
      if (state === 'ballast') {
        // Ballast = empty vessel
        if (!r.next_dest_name || r.vessel_availability === 'Potentially Open') {
          // No next orders — open from departure or now
          return departure || new Date();
        }
        // Heading to load port — open when arrives
        return nextEta || departure || new Date();
      }
      
      if (state === 'loaded') {
        // Loaded = heading to discharge — open after discharge (~5 days)
        if (nextEta) {
          const eta = new Date(nextEta);
          return new Date(eta.getTime() + 5 * 86400000); // +5 days discharge
        }
        // Fallback: departure + 25 days (average voyage + discharge)
        if (departure) {
          return new Date(new Date(departure).getTime() + 25 * 86400000);
        }
      }
      
      return departure || null;
    }

    // Auto-fill from kpler_vessels where tracker has no manual data
    return rows.map(r => {
      // Track source of each field
      r._src = { position: 'manual', open_from: 'manual', open_to: 'manual', controller: 'manual' };

      // Position: auto-resolve from API data if no manual selection
      if (!r.position) {
        const resolved = resolvePosition(r.next_dest_name) || resolvePosition(r.zone_port) || resolvePosition(r.ais_destination);
        if (resolved) { r.position = resolved; r._src.position = 'api'; }
      }
      
      // Controller: prefer kpler live → vessel static
      if (r.kpler_controller) { r.controller = r.kpler_controller; r._src.controller = 'api'; }
      else { r.controller = r.vessel_controller; }
      
      // Open From: prefer manual → smart auto-calculation
      if (!r.open_from) {
        const auto = calcOpenFrom(r);
        if (auto) { r.open_from = auto; r._src.open_from = 'auto'; }
      }
      
      // Open To: prefer manual → Open From + 1 day
      if (!r.open_to && r.open_from) {
        const from = new Date(r.open_from);
        r.open_to = new Date(from.getTime() + 86400000);
        r._src.open_to = r._src.open_from === 'manual' ? 'manual' : 'auto';
      }
      
      return r;
    });
  },

  async findByVesselId(vesselId) {
    const [rows] = await db.query('SELECT * FROM tracker_entries WHERE vessel_id = ?', [vesselId]);
    return rows[0];
  },

  async create(data) {
    const [result] = await db.query(
      `INSERT INTO tracker_entries (vessel_id, position, open_from, open_to, notes, next_loading, current_voyage, edited_by, laden_v_cape) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.vessel_id, data.position, data.open_from, data.open_to, data.notes, data.next_loading, data.current_voyage, data.edited_by, data.laden_v_cape]
    );
    return result.insertId;
  },

  async update(id, data) {
    await db.query(
      `UPDATE tracker_entries SET position=?, open_from=?, open_to=?, notes=?, next_loading=?, current_voyage=?, edited_by=?, laden_v_cape=? WHERE id=?`,
      [data.position, data.open_from, data.open_to, data.notes, data.next_loading, data.current_voyage, data.edited_by, data.laden_v_cape, id]
    );
  },

  async upsertByVesselId(vesselId, data) {
    const existing = await this.findByVesselId(vesselId);
    if (existing) {
      await this.update(existing.id, { ...data, vessel_id: vesselId });
      return existing.id;
    }
    return await this.create({ ...data, vessel_id: vesselId });
  },

  async delete(id) {
    await db.query('DELETE FROM tracker_entries WHERE id = ?', [id]);
  },

  async count() {
    const [rows] = await db.query('SELECT COUNT(*) as count FROM tracker_entries');
    return rows[0].count;
  }
};

module.exports = TrackerEntry;
