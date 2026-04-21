-- Add manual availability fields to kpler_fleet
ALTER TABLE `kpler_fleet` ADD COLUMN `avail_notes` TEXT NULL AFTER `auto_position`;
ALTER TABLE `kpler_fleet` ADD COLUMN `avail_status` VARCHAR(50) NULL AFTER `avail_notes`;
ALTER TABLE `kpler_fleet` ADD COLUMN `avail_voyage` VARCHAR(255) NULL AFTER `avail_status`;

-- Excluded controllers (sanctions/filter)
CREATE TABLE IF NOT EXISTS `excluded_controllers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `controller_name` VARCHAR(255) NOT NULL,
  `reason` VARCHAR(255) NULL DEFAULT 'Sanctioned',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `controller_name` (`controller_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed common sanctioned Iranian operators
INSERT IGNORE INTO `excluded_controllers` (`controller_name`, `reason`) VALUES
  ('NITC', 'Iran Sanctioned'),
  ('IRISL', 'Iran Sanctioned'),
  ('National Iranian Tanker Company', 'Iran Sanctioned'),
  ('Islamic Republic of Iran Shipping Lines', 'Iran Sanctioned');