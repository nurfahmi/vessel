const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_NAME = process.env.DB_NAME || 'vlgc_sorter';

/**
 * Initialize all database tables on startup.
 * Step 1: Create database if not exists
 * Step 2: Create all tables matching model schemas exactly
 */
async function initAllTables() {
  try {
    // Step 1: Create database (connect without database name)
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.end();
    console.log('[DB] ✓ Database ready');

    // Step 2: Create tables (connect with database)
    const db = require('../config/database');

    // Users (User.js)
    await db.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      display_name VARCHAR(100),
      initials VARCHAR(10),
      role VARCHAR(50) DEFAULT 'broker',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Settings (Setting.js)
    await db.query(`CREATE TABLE IF NOT EXISTS settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(100) UNIQUE NOT NULL,
      setting_value TEXT,
      description VARCHAR(255),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    // Vessels (Vessel.js)
    await db.query(`CREATE TABLE IF NOT EXISTS vessels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      built INT,
      cbm INT,
      us_trade TINYINT DEFAULT 0,
      chinese_built TINYINT DEFAULT 0,
      panamax TINYINT DEFAULT 0,
      deck_tank TINYINT DEFAULT 0,
      scrubber_df VARCHAR(50) DEFAULT 'none',
      controller VARCHAR(255),
      head_owner VARCHAR(255),
      imo VARCHAR(20),
      mmsi VARCHAR(20),
      kpler_vessel_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tracker Entries (TrackerEntry.js)
    await db.query(`CREATE TABLE IF NOT EXISTS tracker_entries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_id INT,
      position VARCHAR(255),
      open_from DATE,
      open_to DATE,
      notes TEXT,
      next_loading VARCHAR(255),
      current_voyage VARCHAR(255),
      edited_by VARCHAR(100),
      laden_v_cape VARCHAR(100),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Name Changes (NameChange.js)
    await db.query(`CREATE TABLE IF NOT EXISTS name_changes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      current_name VARCHAR(255),
      previous_name VARCHAR(255),
      change_date DATE,
      built INT,
      imo VARCHAR(20),
      yard VARCHAR(255),
      yard_country VARCHAR(100),
      liq_cubic INT,
      commercial_owner VARCHAR(255),
      status VARCHAR(50),
      fuel_option VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Voyage Routes (VoyageRoute.js)
    await db.query(`CREATE TABLE IF NOT EXISTS voyage_routes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      from_port VARCHAR(255),
      from_alias VARCHAR(255),
      destination VARCHAR(255),
      transit_days INT,
      notes TEXT,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // AG Fixtures (AgFixture.js)
    await db.query(`CREATE TABLE IF NOT EXISTS ag_fixtures (
      id INT AUTO_INCREMENT PRIMARY KEY,
      laycan VARCHAR(255),
      charterer VARCHAR(255),
      port VARCHAR(255),
      vessel VARCHAR(255),
      rate VARCHAR(100),
      region VARCHAR(100),
      year INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // COAs (Coa.js)
    await db.query(`CREATE TABLE IF NOT EXISTS coas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pool VARCHAR(255),
      charterer VARCHAR(255),
      route VARCHAR(255),
      frequency VARCHAR(100),
      rate_notes TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Restricted Ships (RestrictedShip.js)
    await db.query(`CREATE TABLE IF NOT EXISTS restricted_ships (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_name VARCHAR(255),
      category VARCHAR(100),
      notes TEXT,
      approved_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Iran FS Vessels (IranFsVessel.js)
    await db.query(`CREATE TABLE IF NOT EXISTS iran_fs_vessels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_name VARCHAR(255),
      built INT,
      cbm INT,
      imo VARCHAR(20),
      disponent VARCHAR(255),
      operator VARCHAR(255),
      previous_name VARCHAR(255),
      is_floating_storage TINYINT DEFAULT 0,
      actual_control VARCHAR(255),
      area VARCHAR(255),
      tc_expiry DATE,
      dd_date DATE,
      panama_fitted TINYINT DEFAULT 0,
      scrubber_df VARCHAR(50),
      position VARCHAR(255),
      open_from DATE,
      notes TEXT,
      category VARCHAR(50) DEFAULT 'india',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Drydock Schedule (DrydockSchedule.js)
    await db.query(`CREATE TABLE IF NOT EXISTS drydock_schedule (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_name VARCHAR(255),
      scheduled_date DATE,
      end_date DATE,
      quarter VARCHAR(20),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Highlighter Vessels (HighlighterVessel.js)
    await db.query(`CREATE TABLE IF NOT EXISTS highlighter_vessels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_name VARCHAR(255),
      category VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Kpler Data (KplerData.js)
    await db.query(`CREATE TABLE IF NOT EXISTS kpler_data (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_name VARCHAR(255),
      capacity_m3 INT,
      deadweight INT,
      state VARCHAR(50),
      status VARCHAR(50),
      mmsi VARCHAR(20),
      imo VARCHAR(20),
      next_destination VARCHAR(255),
      next_destination_eta DATETIME,
      is_loaded TINYINT DEFAULT 0,
      import_batch VARCHAR(100),
      imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_batch (import_batch)
    )`);

    // Kpler Vessels (individual vessel cache from kpler API)
    await db.query(`CREATE TABLE IF NOT EXISTS kpler_vessels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kpler_id INT UNIQUE,
      name VARCHAR(255),
      imo VARCHAR(20),
      mmsi VARCHAR(20),
      flag VARCHAR(100),
      state VARCHAR(50),
      status VARCHAR(50),
      cbm INT,
      built_year INT,
      controller VARCHAR(255),
      operator VARCHAR(255),
      owner VARCHAR(255),
      commercial_manager VARCHAR(255),
      position VARCHAR(255),
      position_detail VARCHAR(255),
      zone_port VARCHAR(255),
      zone_country VARCHAR(100),
      lat DECIMAL(10,6),
      lon DECIMAL(10,6),
      speed DECIMAL(5,1),
      heading INT,
      draught DECIMAL(5,2),
      loaded TINYINT DEFAULT 0,
      is_open TINYINT DEFAULT 0,
      cargo VARCHAR(255),
      ais_destination VARCHAR(255),
      ais_eta DATETIME,
      next_dest_name VARCHAR(255),
      next_dest_eta DATETIME,
      next_dest_country VARCHAR(100),
      last_port VARCHAR(255),
      last_port_country VARCHAR(100),
      last_port_departure DATETIME,
      vessel_availability VARCHAR(100),
      open_from DATE,
      open_to DATE,
      estimated_berth_departure DATETIME,
      estimated_berth_arrival DATETIME,
      data_timestamp DATETIME,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    // Kpler Fleet (fleet sync from /api/vessels)
    await db.query(`CREATE TABLE IF NOT EXISTS kpler_fleet (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kpler_id INT UNIQUE,
      name VARCHAR(255),
      imo VARCHAR(20),
      mmsi VARCHAR(20),
      call_sign VARCHAR(20),
      vessel_type_class VARCHAR(100),
      state VARCHAR(50),
      status VARCHAR(50),
      flag_name VARCHAR(100),
      build_year INT,
      capacity_cbm INT,
      deadweight INT,
      is_ethylene_capable TINYINT DEFAULT 0,
      is_floating_storage TINYINT DEFAULT 0,
      is_open TINYINT DEFAULT 0,
      cargo_type VARCHAR(100),
      number_tanks INT,
      statcode VARCHAR(50),
      commodity_types VARCHAR(255),
      classification VARCHAR(255),
      current_commodity_type VARCHAR(100),
      lat DECIMAL(10,6),
      lon DECIMAL(10,6),
      speed DECIMAL(5,2),
      course DECIMAL(5,1),
      draught DECIMAL(5,2),
      heading INT,
      position_time DATETIME,
      ais_destination VARCHAR(255),
      ais_eta DATETIME,
      next_dest_zone VARCHAR(255),
      next_dest_zone_id INT,
      next_dest_installation VARCHAR(255),
      next_dest_installation_id INT,
      next_dest_eta DATETIME,
      next_dest_source VARCHAR(50),
      loaded TINYINT DEFAULT 0,
      cargo_volume DECIMAL(12,2),
      cargo_mass DECIMAL(12,2),
      cargo_products VARCHAR(500),
      controller VARCHAR(255),
      last_port VARCHAR(255),
      last_port_zone VARCHAR(255),
      last_port_country VARCHAR(255),
      position VARCHAR(255),
      tracked TINYINT DEFAULT 0,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_state (state),
      INDEX idx_status (status)
    )`);

    // Kpler Vessel Details (enrichment data)
    await db.query(`CREATE TABLE IF NOT EXISTS kpler_vessel_details (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kpler_id INT UNIQUE,
      build_country VARCHAR(100),
      build_month INT,
      builder VARCHAR(255),
      gross_tonnage INT,
      beam DECIMAL(5,2),
      max_load_cbm INT,
      horse_power INT,
      max_speed DECIMAL(5,1),
      managers JSON,
      owners JSON,
      builders JSON,
      commercial_managers JSON,
      operators JSON,
      beneficial_owners JSON,
      insurers JSON,
      hire_rate DECIMAL(10,2),
      unloads_this_year INT,
      unloaded_tons DECIMAL(12,2),
      charter_contracts JSON,
      vessel_availability VARCHAR(100),
      vessel_availabilities JSON,
      position_snapshot JSON,
      last_port_zone VARCHAR(255),
      last_port_install VARCHAR(255),
      last_port_arrival DATETIME,
      last_port_departure DATETIME,
      last_port_availability VARCHAR(100),
      port_call_info JSON,
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    // Import logs
    await db.query(`CREATE TABLE IF NOT EXISTS import_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(50),
      filename VARCHAR(255),
      records_count INT,
      imported_by VARCHAR(100),
      imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log('[DB] ✓ All tables initialized');
  } catch (err) {
    console.error('[DB] Init error:', err.message);
  }
}

module.exports = { initAllTables };
