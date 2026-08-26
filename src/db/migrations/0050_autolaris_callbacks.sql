-- Evidence store for AutoLaris callbacks (A-164).
--
-- The provider requires a non-empty `callback_url` on every create_payment and
-- was being handed a URL that answered 410. The settled/expired/failed shapes
-- of that callback have never been observed (UNIMPLEMENTED_SPECS §AutoLaris),
-- so this table records every delivery verbatim and nothing reads it to move
-- payment state. Once enough real callbacks are on file the shape can be
-- classified deliberately; until then manual reconciliation stays the only
-- path that marks a payment paid.
CREATE TABLE `autolaris_callbacks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `received_at` text NOT NULL,
  `remote_ip` text NOT NULL,
  `content_type` text,
  `user_agent` text,
  `body` text NOT NULL,
  `reference_id` text,
  `provider_transaction_id` text
);
CREATE INDEX `autolaris_callbacks_received_idx` ON `autolaris_callbacks` (`received_at`);
CREATE INDEX `autolaris_callbacks_reference_idx` ON `autolaris_callbacks` (`reference_id`);
