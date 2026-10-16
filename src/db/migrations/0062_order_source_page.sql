-- Track which page the order originated from (landing page attribution).
ALTER TABLE `orders` ADD `source_page_path` text;
