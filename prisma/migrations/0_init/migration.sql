-- CreateTable
CREATE TABLE `ag_fixtures` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `laycan` DATE NULL,
    `charterer` VARCHAR(100) NULL,
    `port` VARCHAR(100) NULL,
    `vessel` VARCHAR(150) NULL,
    `rate` VARCHAR(50) NULL,
    `region` VARCHAR(50) NULL,
    `year` INTEGER NULL DEFAULT 2025,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pool` VARCHAR(100) NULL,
    `charterer` VARCHAR(100) NULL,
    `route` VARCHAR(100) NULL,
    `frequency` VARCHAR(100) NULL,
    `rate_notes` TEXT NULL,
    `notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `destinations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(50) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `short_label` VARCHAR(30) NULL,
    `sort_order` INTEGER NULL DEFAULT 0,

    UNIQUE INDEX `key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discharge_ports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `port_name` VARCHAR(255) NULL,
    `receiver` VARCHAR(255) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discharge_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `area_name` VARCHAR(100) NOT NULL,
    `discharge_days` INTEGER NULL DEFAULT 4,

    UNIQUE INDEX `area_name`(`area_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `drydock_schedule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vessel_name` VARCHAR(150) NOT NULL,
    `scheduled_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `quarter` VARCHAR(10) NULL,
    `notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `highlighter_vessels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vessel_name` VARCHAR(150) NOT NULL,
    `category` VARCHAR(50) NOT NULL,

    INDEX `idx_category`(`category`),
    INDEX `idx_vessel`(`vessel_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(50) NULL,
    `filename` VARCHAR(255) NULL,
    `records_count` INTEGER NULL,
    `imported_by` VARCHAR(100) NULL,
    `imported_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `india_tracker` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vessel_name` VARCHAR(255) NOT NULL,
    `built` VARCHAR(20) NULL,
    `cbm` DECIMAL(10, 2) NULL,
    `ex_charterer` VARCHAR(100) NULL,
    `scrubber_df` VARCHAR(20) NULL DEFAULT 'none',
    `dd_date` DATE NULL,
    `tc_expiry` VARCHAR(50) NULL,
    `tc_owner` VARCHAR(100) NULL,
    `controller` VARCHAR(100) NULL,
    `head_owner` VARCHAR(100) NULL,
    `position` VARCHAR(100) NULL,
    `open_from` DATE NULL,
    `open_to` DATE NULL,
    `relet` VARCHAR(10) NULL,
    `notes` TEXT NULL,
    `next_loading` VARCHAR(255) NULL,
    `current_voyage` VARCHAR(255) NULL,
    `edited_by` VARCHAR(10) NULL,
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `iran_fs_vessels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vessel_name` VARCHAR(150) NOT NULL,
    `built` VARCHAR(20) NULL,
    `cbm` DECIMAL(12, 2) NULL,
    `imo` VARCHAR(20) NULL,
    `disponent` VARCHAR(100) NULL,
    `operator` VARCHAR(100) NULL,
    `previous_name` VARCHAR(150) NULL,
    `is_floating_storage` BOOLEAN NULL DEFAULT false,
    `actual_control` VARCHAR(100) NULL,
    `area` VARCHAR(50) NULL,
    `tc_expiry` DATE NULL,
    `dd_date` DATE NULL,
    `panama_fitted` BOOLEAN NULL DEFAULT false,
    `scrubber_df` VARCHAR(20) NULL,
    `position` VARCHAR(100) NULL,
    `open_from` DATE NULL,
    `notes` TEXT NULL,
    `category` VARCHAR(30) NULL DEFAULT 'india',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kpler_data` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vessel_name` VARCHAR(255) NULL,
    `capacity_m3` INTEGER NULL,
    `deadweight` INTEGER NULL,
    `state` VARCHAR(50) NULL,
    `status` VARCHAR(50) NULL,
    `mmsi` VARCHAR(20) NULL,
    `imo` VARCHAR(20) NULL,
    `next_destination` VARCHAR(255) NULL,
    `next_destination_eta` DATETIME(0) NULL,
    `is_loaded` TINYINT NULL DEFAULT 0,
    `import_batch` VARCHAR(100) NULL,
    `imported_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_batch`(`import_batch`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kpler_fleet` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kpler_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `imo` VARCHAR(20) NULL,
    `mmsi` VARCHAR(20) NULL,
    `call_sign` VARCHAR(20) NULL,
    `vessel_type_class` VARCHAR(50) NULL,
    `state` VARCHAR(30) NULL,
    `status` VARCHAR(50) NULL,
    `flag_name` VARCHAR(100) NULL,
    `build_year` INTEGER NULL,
    `capacity_cbm` INTEGER NULL,
    `deadweight` INTEGER NULL,
    `is_ethylene_capable` BOOLEAN NULL DEFAULT false,
    `is_floating_storage` BOOLEAN NULL DEFAULT false,
    `is_open` BOOLEAN NULL DEFAULT false,
    `cargo_type` VARCHAR(50) NULL,
    `number_tanks` INTEGER NULL,
    `statcode` VARCHAR(30) NULL,
    `commodity_types` VARCHAR(255) NULL,
    `classification` VARCHAR(100) NULL,
    `current_commodity_type` VARCHAR(100) NULL,
    `lat` DECIMAL(10, 6) NULL,
    `lon` DECIMAL(10, 6) NULL,
    `speed` DECIMAL(6, 2) NULL,
    `course` DECIMAL(6, 2) NULL,
    `draught` DECIMAL(5, 2) NULL,
    `heading` INTEGER NULL,
    `position_time` DATETIME(0) NULL,
    `ais_destination` VARCHAR(255) NULL,
    `ais_eta` DATETIME(0) NULL,
    `next_dest_zone` VARCHAR(255) NULL,
    `next_dest_zone_id` INTEGER NULL,
    `next_dest_installation` VARCHAR(255) NULL,
    `next_dest_installation_id` INTEGER NULL,
    `next_dest_eta` DATETIME(0) NULL,
    `next_dest_source` VARCHAR(20) NULL,
    `loaded` BOOLEAN NULL DEFAULT false,
    `cargo_volume` DECIMAL(12, 2) NULL,
    `cargo_mass` DECIMAL(12, 2) NULL,
    `cargo_products` TEXT NULL,
    `controller` VARCHAR(255) NULL,
    `last_port` VARCHAR(255) NULL,
    `last_port_country` VARCHAR(100) NULL,
    `tracked` BOOLEAN NULL DEFAULT false,
    `synced_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `position` VARCHAR(100) NULL,
    `last_port_zone` VARCHAR(255) NULL,
    `auto_position` VARCHAR(100) NULL,

    UNIQUE INDEX `kpler_id`(`kpler_id`),
    INDEX `idx_imo`(`imo`),
    INDEX `idx_name`(`name`),
    INDEX `idx_state`(`state`),
    INDEX `idx_tracked`(`tracked`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kpler_vessel_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kpler_id` INTEGER NOT NULL,
    `build_country` VARCHAR(100) NULL,
    `build_month` INTEGER NULL,
    `builder` VARCHAR(255) NULL,
    `gross_tonnage` INTEGER NULL,
    `beam` DECIMAL(8, 2) NULL,
    `max_load_cbm` INTEGER NULL,
    `horse_power` INTEGER NULL,
    `max_speed` DECIMAL(5, 1) NULL,
    `managers` JSON NULL,
    `owners` JSON NULL,
    `builders` JSON NULL,
    `commercial_managers` JSON NULL,
    `operators` JSON NULL,
    `beneficial_owners` JSON NULL,
    `insurers` JSON NULL,
    `hire_rate` DECIMAL(6, 2) NULL,
    `unloads_this_year` INTEGER NULL,
    `unloaded_tons` DECIMAL(12, 3) NULL,
    `charter_contracts` JSON NULL,
    `vessel_availability` TEXT NULL,
    `vessel_availabilities` JSON NULL,
    `position_snapshot` JSON NULL,
    `fetched_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_port_zone` VARCHAR(255) NULL,
    `last_port_install` VARCHAR(255) NULL,
    `last_port_arrival` DATETIME(0) NULL,
    `last_port_departure` DATETIME(0) NULL,
    `last_port_availability` TEXT NULL,
    `port_call_info` JSON NULL,

    UNIQUE INDEX `kpler_id`(`kpler_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kpler_vessels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kpler_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `imo` VARCHAR(20) NULL,
    `mmsi` VARCHAR(20) NULL,
    `call_sign` VARCHAR(20) NULL,
    `flag` VARCHAR(50) NULL,
    `ship_class` VARCHAR(10) NULL,
    `status` VARCHAR(20) NULL,
    `built_year` INTEGER NULL,
    `built_month` INTEGER NULL,
    `built_country` VARCHAR(50) NULL,
    `cbm` INTEGER NULL,
    `cargo_type` VARCHAR(50) NULL,
    `num_tanks` INTEGER NULL,
    `deadweight` INTEGER NULL,
    `gross_tonnage` INTEGER NULL,
    `beam` FLOAT NULL,
    `max_speed` FLOAT NULL,
    `horsepower` INTEGER NULL,
    `is_ethylene_capable` BOOLEAN NULL DEFAULT false,
    `state` VARCHAR(20) NULL,
    `is_open` BOOLEAN NULL DEFAULT false,
    `lat` DOUBLE NULL,
    `lon` DOUBLE NULL,
    `speed` FLOAT NULL,
    `heading` FLOAT NULL,
    `course` FLOAT NULL,
    `draught` FLOAT NULL,
    `position_time` DATETIME(0) NULL,
    `loaded` BOOLEAN NULL DEFAULT false,
    `ais_destination` VARCHAR(100) NULL,
    `ais_eta` DATETIME(0) NULL,
    `next_dest_name` VARCHAR(100) NULL,
    `next_dest_zone` VARCHAR(255) NULL,
    `next_dest_country` VARCHAR(50) NULL,
    `next_dest_eta` DATETIME(0) NULL,
    `next_dest_type` VARCHAR(30) NULL,
    `last_port` VARCHAR(100) NULL,
    `last_port_country` VARCHAR(50) NULL,
    `last_port_type` VARCHAR(30) NULL,
    `last_port_arrival` DATETIME(0) NULL,
    `last_port_departure` DATETIME(0) NULL,
    `vessel_availability` TEXT NULL,
    `port_call_operation` VARCHAR(20) NULL,
    `flow_volume` INTEGER NULL,
    `sts_partner` VARCHAR(100) NULL,
    `sts_volume` INTEGER NULL,
    `is_sts` BOOLEAN NULL DEFAULT false,
    `position_zones` JSON NULL,
    `zone_port` VARCHAR(100) NULL,
    `zone_country` VARCHAR(50) NULL,
    `controller` VARCHAR(100) NULL,
    `controller_country` VARCHAR(50) NULL,
    `data_timestamp` DATETIME(0) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `position` VARCHAR(100) NULL,
    `position_detail` VARCHAR(200) NULL,
    `cargo` VARCHAR(200) NULL,
    `cargo_volume` INTEGER NULL,
    `cargo_products` VARCHAR(200) NULL,
    `confirmed_grades` VARCHAR(200) NULL,
    `partial_cargo` BOOLEAN NULL DEFAULT false,
    `current_volume` INTEGER NULL,
    `open_from` DATETIME(0) NULL,
    `open_to` DATETIME(0) NULL,
    `operator` VARCHAR(100) NULL,
    `owner` VARCHAR(100) NULL,
    `beneficial_owner` VARCHAR(100) NULL,
    `commercial_manager` VARCHAR(100) NULL,
    `manager` VARCHAR(100) NULL,
    `builder` VARCHAR(150) NULL,
    `enriched_at` DATETIME(0) NULL,
    `estimated_berth_departure` DATETIME(0) NULL,
    `estimated_berth_arrival` DATETIME(0) NULL,
    `last_port_operation` VARCHAR(30) NULL,
    `ais_set_time` DATETIME(0) NULL,
    `current_mass` DECIMAL(12, 2) NULL,
    `flow_mass` DECIMAL(12, 2) NULL,
    `parent_zones` TEXT NULL,
    `third_party_operator` VARCHAR(200) NULL,
    `unloads_this_year` INTEGER NULL,
    `unloaded_ton_this_year` DECIMAL(14, 2) NULL,
    `hire_rate` DECIMAL(8, 2) NULL,
    `charter_charterer` VARCHAR(200) NULL,
    `charter_start` DATE NULL,
    `charter_end` DATE NULL,
    `owner_country` VARCHAR(100) NULL,
    `insurer` VARCHAR(200) NULL,
    `is_floating_storage` BOOLEAN NULL DEFAULT false,
    `last_port_installation` VARCHAR(200) NULL,
    `last_port_berth` VARCHAR(200) NULL,
    `next_forecast_load` DATE NULL,
    `next_forecast_load_zone` VARCHAR(100) NULL,

    UNIQUE INDEX `kpler_id`(`kpler_id`),
    INDEX `idx_flag`(`flag`),
    INDEX `idx_imo`(`imo`),
    INDEX `idx_name`(`name`),
    INDEX `idx_state`(`state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `loaded_before` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `port` VARCHAR(100) NULL,
    `vessel_name` VARCHAR(255) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `name_changes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `current_name` VARCHAR(150) NULL,
    `previous_name` VARCHAR(300) NULL,
    `change_date` DATE NULL,
    `built` VARCHAR(20) NULL,
    `imo` VARCHAR(20) NULL,
    `yard` VARCHAR(200) NULL,
    `yard_country` VARCHAR(50) NULL,
    `liq_cubic` DECIMAL(12, 2) NULL,
    `commercial_owner` VARCHAR(100) NULL,
    `status` VARCHAR(20) NULL,
    `fuel_option` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `old_ships` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vessel_name` VARCHAR(255) NULL,
    `built` VARCHAR(20) NULL,
    `cbm` DECIMAL(10, 2) NULL,
    `disponent` VARCHAR(100) NULL,
    `comment` TEXT NULL,
    `head_owner` VARCHAR(100) NULL,
    `panama_fitted` BOOLEAN NULL DEFAULT false,
    `scrubber_df` VARCHAR(20) NULL,
    `dd_date` DATE NULL,
    `tc_expiry` VARCHAR(50) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pertamina` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `laycan` VARCHAR(50) NULL,
    `load_port` VARCHAR(100) NULL,
    `owner` VARCHAR(100) NULL,
    `vessel` VARCHAR(255) NULL,
    `broker` VARCHAR(100) NULL,
    `won` VARCHAR(20) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `port_aliases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alias_name` VARCHAR(255) NOT NULL,
    `canonical_name` VARCHAR(150) NOT NULL,
    `notes` TEXT NULL,

    UNIQUE INDEX `uq_alias`(`alias_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `port_areas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `location_name` VARCHAR(255) NOT NULL,
    `area` VARCHAR(100) NOT NULL,
    `region` VARCHAR(100) NULL,

    UNIQUE INDEX `uq_loc`(`location_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `restricted_ships` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vessel_name` VARCHAR(150) NOT NULL,
    `category` VARCHAR(50) NOT NULL,
    `notes` TEXT NULL,
    `approved_date` DATE NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scrubber_df_panamax` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vessel_name` VARCHAR(255) NULL,
    `cbm` DECIMAL(10, 2) NULL,
    `built` VARCHAR(20) NULL,
    `head_owner` VARCHAR(100) NULL,
    `category` VARCHAR(30) NULL,
    `fitting_location` VARCHAR(100) NULL,
    `fitting_date` DATE NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `setting_key` VARCHAR(100) NOT NULL,
    `setting_value` TEXT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `setting_key`(`setting_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tracker_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vessel_id` INTEGER NULL,
    `position` VARCHAR(100) NULL,
    `open_from` DATE NULL,
    `open_to` DATE NULL,
    `notes` TEXT NULL,
    `next_loading` VARCHAR(200) NULL,
    `current_voyage` TEXT NULL,
    `edited_by` VARCHAR(10) NULL,
    `laden_v_cape` VARCHAR(50) NULL,
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_vessel_id`(`vessel_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transit_times` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `from_position` VARCHAR(150) NOT NULL,
    `destination_id` INTEGER NOT NULL,
    `transit_days` DECIMAL(8, 3) NOT NULL,
    `notes` TEXT NULL,

    INDEX `destination_id`(`destination_id`),
    UNIQUE INDEX `uq_route`(`from_position`, `destination_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(100) NULL,
    `initials` VARCHAR(10) NULL,
    `role` ENUM('superadmin', 'admin', 'broker') NULL DEFAULT 'broker',
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `username`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vessels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `built` VARCHAR(20) NULL,
    `cbm` DECIMAL(12, 2) NULL,
    `us_trade` BOOLEAN NULL DEFAULT false,
    `chinese_built` BOOLEAN NULL DEFAULT false,
    `panamax` BOOLEAN NULL DEFAULT false,
    `deck_tank` BOOLEAN NULL DEFAULT false,
    `scrubber_df` VARCHAR(30) NULL DEFAULT 'none',
    `controller` VARCHAR(100) NULL,
    `head_owner` VARCHAR(100) NULL,
    `imo` VARCHAR(20) NULL,
    `mmsi` VARCHAR(20) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `kpler_vessel_id` INTEGER NULL,
    `tracked` BOOLEAN NULL DEFAULT true,

    UNIQUE INDEX `name`(`name`),
    INDEX `idx_controller`(`controller`),
    INDEX `idx_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `voyage_routes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `from_port` VARCHAR(150) NOT NULL,
    `from_alias` VARCHAR(200) NULL,
    `destination` VARCHAR(100) NOT NULL,
    `transit_days` DECIMAL(8, 3) NULL,
    `notes` TEXT NULL,
    `sort_order` INTEGER NULL DEFAULT 0,

    INDEX `idx_destination`(`destination`),
    INDEX `idx_from_port`(`from_port`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `kpler_vessel_details` ADD CONSTRAINT `kpler_vessel_details_ibfk_1` FOREIGN KEY (`kpler_id`) REFERENCES `kpler_fleet`(`kpler_id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `tracker_entries` ADD CONSTRAINT `tracker_entries_ibfk_1` FOREIGN KEY (`vessel_id`) REFERENCES `vessels`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `transit_times` ADD CONSTRAINT `transit_times_ibfk_1` FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

