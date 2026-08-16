-- Migration: Add disabled_autolaris_channels to stores
ALTER TABLE `stores` ADD `disabled_autolaris_channels` text DEFAULT '' NOT NULL;
