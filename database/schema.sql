CREATE DATABASE IF NOT EXISTS vlgc_sorter CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE vlgc_sorter;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  initials VARCHAR(10),
  role ENUM('superadmin', 'admin', 'broker') DEFAULT 'broker',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Master vessel registry (from Control List)
CREATE TABLE IF NOT EXISTS vessels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) UNIQUE NOT NULL,
  built VARCHAR(20),
  cbm DECIMAL(12,2),
  us_trade BOOLEAN DEFAULT FALSE,
  chinese_built BOOLEAN DEFAULT FALSE,
  panamax BOOLEAN DEFAULT FALSE,
  deck_tank BOOLEAN DEFAULT FALSE,
  scrubber_df VARCHAR(30) DEFAULT 'none',
  controller VARCHAR(100),
  head_owner VARCHAR(100),
  imo VARCHAR(20),
  mmsi VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name),
  INDEX idx_controller (controller)
);

-- Raw Kpler AIS imports
CREATE TABLE IF NOT EXISTS kpler_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vessel_name VARCHAR(150) NOT NULL,
  capacity_m3 DECIMAL(12,2),
  deadweight DECIMAL(12,2),
  state VARCHAR(30) DEFAULT 'open',
  status VARCHAR(30) DEFAULT 'Active',
  mmsi VARCHAR(20),
  imo VARCHAR(20),
  next_destination VARCHAR(200),
  next_destination_eta DATETIME,
  is_loaded BOOLEAN DEFAULT FALSE,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  import_batch VARCHAR(50),
  INDEX idx_vessel_name (vessel_name),
  INDEX idx_import_batch (import_batch)
);

-- Tracker entries (main working data)
CREATE TABLE IF NOT EXISTS tracker_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vessel_id INT,
  position VARCHAR(100),
  open_from DATE,
  open_to DATE,
  notes TEXT,
  next_loading VARCHAR(200),
  current_voyage TEXT,
  edited_by VARCHAR(10),
  laden_v_cape VARCHAR(50),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE CASCADE,
  INDEX idx_vessel_id (vessel_id)
);

-- Voyage route transit times
CREATE TABLE IF NOT EXISTS voyage_routes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_port VARCHAR(150) NOT NULL,
  from_alias VARCHAR(200),
  destination VARCHAR(100) NOT NULL,
  transit_days DECIMAL(8,3),
  notes TEXT,
  sort_order INT DEFAULT 0,
  INDEX idx_destination (destination),
  INDEX idx_from_port (from_port)
);

-- Restricted ships (categorized lists)
CREATE TABLE IF NOT EXISTS restricted_ships (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vessel_name VARCHAR(150) NOT NULL,
  category VARCHAR(50) NOT NULL,
  notes TEXT,
  approved_date DATE
);

-- Drydock schedule
CREATE TABLE IF NOT EXISTS drydock_schedule (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vessel_name VARCHAR(150) NOT NULL,
  scheduled_date DATE NOT NULL,
  end_date DATE,
  quarter VARCHAR(10),
  notes TEXT
);

-- Iran / Floating Storage / India shuttle vessels
CREATE TABLE IF NOT EXISTS iran_fs_vessels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vessel_name VARCHAR(150) NOT NULL,
  built VARCHAR(20),
  cbm DECIMAL(12,2),
  imo VARCHAR(20),
  disponent VARCHAR(100),
  operator VARCHAR(100),
  previous_name VARCHAR(150),
  is_floating_storage BOOLEAN DEFAULT FALSE,
  actual_control VARCHAR(100),
  area VARCHAR(50),
  tc_expiry DATE,
  dd_date DATE,
  panama_fitted BOOLEAN DEFAULT FALSE,
  scrubber_df VARCHAR(20),
  position VARCHAR(100),
  open_from DATE,
  notes TEXT,
  category VARCHAR(30) DEFAULT 'india'
);

-- AG Sorter fixtures
CREATE TABLE IF NOT EXISTS ag_fixtures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  laycan DATE,
  charterer VARCHAR(100),
  port VARCHAR(100),
  vessel VARCHAR(150),
  rate VARCHAR(50),
  region VARCHAR(50),
  year INT DEFAULT 2025,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- COA entries
CREATE TABLE IF NOT EXISTS coas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pool VARCHAR(100),
  charterer VARCHAR(100),
  route VARCHAR(100),
  frequency VARCHAR(100),
  rate_notes TEXT,
  notes TEXT
);

-- Vessel name changes history
CREATE TABLE IF NOT EXISTS name_changes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  current_name VARCHAR(150),
  previous_name VARCHAR(300),
  change_date DATE,
  built VARCHAR(20),
  imo VARCHAR(20),
  yard VARCHAR(200),
  yard_country VARCHAR(50),
  liq_cubic DECIMAL(12,2),
  commercial_owner VARCHAR(100),
  status VARCHAR(20),
  fuel_option VARCHAR(50)
);

-- Highlighter vessel lists
CREATE TABLE IF NOT EXISTS highlighter_vessels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vessel_name VARCHAR(150) NOT NULL,
  category VARCHAR(50) NOT NULL,
  INDEX idx_category (category),
  INDEX idx_vessel (vessel_name)
);

-- App settings (configurable values)
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  description VARCHAR(255)
);

-- Import log
CREATE TABLE IF NOT EXISTS import_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255),
  sheet_name VARCHAR(100),
  rows_imported INT,
  imported_by INT,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (imported_by) REFERENCES users(id)
);

-- Default settings
INSERT INTO settings (setting_key, setting_value, description) VALUES
  ('nb_waiting_days', '6', 'Newbuild waiting days buffer for Sorter ETA calculations'),
  ('app_name', 'VLGC Sorter', 'Application display name')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
