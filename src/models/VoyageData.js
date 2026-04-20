const db = require('../config/database');

const Destination = {
  async getAll() {
    const [rows] = await db.query('SELECT * FROM destinations ORDER BY sort_order');
    return rows;
  },
  async findByKey(key) {
    const [rows] = await db.query('SELECT * FROM destinations WHERE `key` = ?', [key]);
    return rows[0];
  },
  async create(data) {
    const [r] = await db.query('INSERT INTO destinations (`key`, label, short_label, sort_order) VALUES (?,?,?,?)',
      [data.key, data.label, data.short_label, data.sort_order || 0]);
    return r.insertId;
  },
  async update(id, data) {
    await db.query('UPDATE destinations SET `key`=?, label=?, short_label=?, sort_order=? WHERE id=?',
      [data.key, data.label, data.short_label, data.sort_order, id]);
  },
  async delete(id) {
    await db.query('DELETE FROM destinations WHERE id=?', [id]);
  }
};

const TransitTime = {
  async getByDestination(destId) {
    const [rows] = await db.query(
      'SELECT t.*, d.`key` as dest_key, d.label as dest_label FROM transit_times t JOIN destinations d ON t.destination_id = d.id WHERE t.destination_id = ? ORDER BY t.from_position',
      [destId]);
    return rows;
  },
  async getAll() {
    const [rows] = await db.query(
      'SELECT t.*, d.`key` as dest_key, d.label as dest_label, d.short_label FROM transit_times t JOIN destinations d ON t.destination_id = d.id ORDER BY d.sort_order, t.from_position');
    return rows;
  },
  async findTransitDays(fromPosition, destKey) {
    // 1. Try exact match
    const [rows] = await db.query(
      `SELECT t.transit_days FROM transit_times t JOIN destinations d ON t.destination_id = d.id 
       WHERE LOWER(TRIM(t.from_position)) = LOWER(TRIM(?)) AND d.\`key\` = ?`, [fromPosition, destKey]);
    if (rows.length) return rows[0].transit_days;

    // 2. Try alias lookup
    const [alias] = await db.query('SELECT canonical_name FROM port_aliases WHERE LOWER(TRIM(alias_name)) = LOWER(TRIM(?))', [fromPosition]);
    if (alias.length) {
      const [r2] = await db.query(
        `SELECT t.transit_days FROM transit_times t JOIN destinations d ON t.destination_id = d.id 
         WHERE LOWER(TRIM(t.from_position)) = LOWER(TRIM(?)) AND d.\`key\` = ?`, [alias[0].canonical_name, destKey]);
      if (r2.length) return r2[0].transit_days;
    }

    // 3. Try port_areas lookup (AIS location → area → transit)
    const [area] = await db.query('SELECT area FROM port_areas WHERE LOWER(TRIM(location_name)) = LOWER(TRIM(?))', [fromPosition]);
    if (area.length) {
      const [r3] = await db.query(
        `SELECT t.transit_days FROM transit_times t JOIN destinations d ON t.destination_id = d.id 
         WHERE LOWER(TRIM(t.from_position)) = LOWER(TRIM(?)) AND d.\`key\` = ?`, [area[0].area, destKey]);
      if (r3.length) return r3[0].transit_days;
    }

    return null;
  },
  async create(data) {
    const [r] = await db.query('INSERT INTO transit_times (from_position, destination_id, transit_days, notes) VALUES (?,?,?,?)',
      [data.from_position, data.destination_id, data.transit_days, data.notes]);
    return r.insertId;
  },
  async update(id, data) {
    await db.query('UPDATE transit_times SET from_position=?, destination_id=?, transit_days=?, notes=? WHERE id=?',
      [data.from_position, data.destination_id, data.transit_days, data.notes, id]);
  },
  async delete(id) {
    await db.query('DELETE FROM transit_times WHERE id=?', [id]);
  },
  async countByDestination() {
    const [rows] = await db.query(
      `SELECT d.id, d.\`key\`, d.label, d.short_label, d.sort_order, COUNT(t.id) as route_count 
       FROM destinations d LEFT JOIN transit_times t ON d.id = t.destination_id 
       GROUP BY d.id ORDER BY d.sort_order`);
    return rows;
  },
  async search(query) {
    const [rows] = await db.query(
      `SELECT t.*, d.\`key\` as dest_key, d.label as dest_label FROM transit_times t 
       JOIN destinations d ON t.destination_id = d.id 
       WHERE t.from_position LIKE ? ORDER BY d.sort_order, t.from_position`, [`%${query}%`]);
    return rows;
  }
};

const PortArea = {
  async getAll() {
    const [rows] = await db.query('SELECT * FROM port_areas ORDER BY area, location_name');
    return rows;
  },
  async getAreas() {
    const [rows] = await db.query('SELECT DISTINCT area FROM port_areas ORDER BY area');
    return rows.map(r => r.area);
  },
  async getByArea(area) {
    const [rows] = await db.query('SELECT * FROM port_areas WHERE area = ? ORDER BY location_name', [area]);
    return rows;
  },
  async resolve(locationName) {
    const [rows] = await db.query('SELECT area FROM port_areas WHERE LOWER(TRIM(location_name)) = LOWER(TRIM(?))', [locationName]);
    return rows.length ? rows[0].area : null;
  },
  async create(data) {
    const [r] = await db.query('INSERT INTO port_areas (location_name, area, region) VALUES (?,?,?)',
      [data.location_name, data.area, data.region]);
    return r.insertId;
  },
  async update(id, data) {
    await db.query('UPDATE port_areas SET location_name=?, area=?, region=? WHERE id=?',
      [data.location_name, data.area, data.region, id]);
  },
  async delete(id) {
    await db.query('DELETE FROM port_areas WHERE id=?', [id]);
  },
  async count() {
    const [rows] = await db.query('SELECT COUNT(*) as c FROM port_areas');
    return rows[0].c;
  },
  async search(query) {
    const [rows] = await db.query('SELECT * FROM port_areas WHERE location_name LIKE ? OR area LIKE ? ORDER BY area, location_name',
      [`%${query}%`, `%${query}%`]);
    return rows;
  }
};

const PortAlias = {
  async getAll() {
    const [rows] = await db.query('SELECT * FROM port_aliases ORDER BY canonical_name, alias_name');
    return rows;
  },
  async resolve(name) {
    const [rows] = await db.query('SELECT canonical_name FROM port_aliases WHERE LOWER(TRIM(alias_name)) = LOWER(TRIM(?))', [name]);
    return rows.length ? rows[0].canonical_name : null;
  },
  async create(data) {
    const [r] = await db.query('INSERT INTO port_aliases (alias_name, canonical_name, notes) VALUES (?,?,?)',
      [data.alias_name, data.canonical_name, data.notes]);
    return r.insertId;
  },
  async update(id, data) {
    await db.query('UPDATE port_aliases SET alias_name=?, canonical_name=?, notes=? WHERE id=?',
      [data.alias_name, data.canonical_name, data.notes, id]);
  },
  async delete(id) {
    await db.query('DELETE FROM port_aliases WHERE id=?', [id]);
  }
};

const DischargeSetting = {
  async getAll() {
    const [rows] = await db.query('SELECT * FROM discharge_settings ORDER BY area_name');
    return rows;
  },
  async update(id, days) {
    await db.query('UPDATE discharge_settings SET discharge_days = ? WHERE id = ?', [days, id]);
  },
  async create(data) {
    const [r] = await db.query('INSERT INTO discharge_settings (area_name, discharge_days) VALUES (?, ?)',
      [data.area_name, data.discharge_days || 4]);
    return r.insertId;
  },
  async delete(id) {
    await db.query('DELETE FROM discharge_settings WHERE id = ?', [id]);
  }
};

module.exports = { Destination, TransitTime, PortArea, PortAlias, DischargeSetting };
