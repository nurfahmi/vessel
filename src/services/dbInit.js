const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_NAME = process.env.DB_NAME || 'vlgc_sorter';

/**
 * Initialize all database tables on startup.
 * First creates the database, then creates all tables.
 */
async function initAllTables() {
  try {
    // Step 1: Create database if not exists (connect without database)
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.end();
    console.log('[DB] ✓ Database ready');

    // Step 2: Now require the pool (safe because DB exists)
    const db = require('../config/database');

    // Users
    await db.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      display_name VARCHAR(100),
      initials VARCHAR(10),
      role VARCHAR(50) DEFAULT 'broker',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Settings
    await db.query(`CREATE TABLE IF NOT EXISTS settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(100) UNIQUE NOT NULL,
      setting_value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    // Vessels (Control List)
    await db.query(`CREATE TABLE IF NOT EXISTS vessels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      previous_name VARCHAR(255),
      imo VARCHAR(20),
      cbm INT,
      built_year INT,
      flag VARCHAR(100),
      controller VARCHAR(255),
      status VARCHAR(50) DEFAULT 'Active',
      kpler_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tracker Entries
    await db.query(`CREATE TABLE IF NOT EXISTS tracker_entries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_id INT,
      vessel_name VARCHAR(255),
      state VARCHAR(50),
      area VARCHAR(255),
      position VARCHAR(255),
      date DATE,
      speed DECIMAL(5,1),
      eta VARCHAR(255),
      destination VARCHAR(255),
      remarks TEXT,
      updated_by VARCHAR(100),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Voyage Routes
    await db.query(`CREATE TABLE IF NOT EXISTS voyage_routes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255),
      from_port VARCHAR(255),
      to_port VARCHAR(255),
      distance_nm INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Name Changes
    await db.query(`CREATE TABLE IF NOT EXISTS name_changes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_id INT,
      old_name VARCHAR(255),
      new_name VARCHAR(255),
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // AG Fixtures
    await db.query(`CREATE TABLE IF NOT EXISTS ag_fixtures (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_name VARCHAR(255),
      charterer VARCHAR(255),
      cargo VARCHAR(255),
      load_port VARCHAR(255),
      discharge_port VARCHAR(255),
      laycan_start DATE,
      laycan_end DATE,
      rate VARCHAR(100),
      source VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // COAs
    await db.query(`CREATE TABLE IF NOT EXISTS coas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      charterer VARCHAR(255),
      vessel_name VARCHAR(255),
      cargo VARCHAR(255),
      route VARCHAR(255),
      frequency VARCHAR(100),
      rate VARCHAR(100),
      start_date DATE,
      end_date DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Restricted Ships
    await db.query(`CREATE TABLE IF NOT EXISTS restricted_ships (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_name VARCHAR(255),
      imo VARCHAR(20),
      reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Iran FS Vessels
    await db.query(`CREATE TABLE IF NOT EXISTS iran_fs_vessels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_name VARCHAR(255),
      imo VARCHAR(20),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Drydock Schedule
    await db.query(`CREATE TABLE IF NOT EXISTS drydock_schedule (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_name VARCHAR(255),
      vessel_id INT,
      start_date DATE,
      end_date DATE,
      shipyard VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Highlighter Vessels
    await db.query(`CREATE TABLE IF NOT EXISTS highlighter_vessels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vessel_name VARCHAR(255),
      color VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Kpler Data (CSV import)
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

    // Kpler Vessels (individual vessel cache)
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
      controller VARCHAR(255),
      position VARCHAR(255),
      zone_port VARCHAR(255),
      lat DECIMAL(10,6),
      lon DECIMAL(10,6),
      speed DECIMAL(5,1),
      heading INT,
      draught DECIMAL(5,2),
      ais_destination VARCHAR(255),
      ais_eta DATETIME,
      next_dest_name VARCHAR(255),
      next_dest_country VARCHAR(255),
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    // Kpler Fleet (fleet sync)
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

    // Kpler Vessel Details (enrichment)
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
