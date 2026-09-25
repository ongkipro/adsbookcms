-- The outbox deduplicated on `event_id` alone. A Purchase's `event_id` is its
-- order number, which is sequential and public, while `/api/meta-event` accepts
-- any well-formed `event_id` for a funnel event. So a PageView posted with
-- `event_id: "INV-<next>"` occupied that key first, and the real Purchase was
-- then "deduplicated" away — never sent, never alerted. Meta itself
-- deduplicates on event_name + event_id, so the outbox now keys on the same
-- pair. Existing rows cannot collide: they were unique on the narrower key.
DROP INDEX IF EXISTS `capi_event_outbox_event_id_unique`;
CREATE UNIQUE INDEX `capi_event_outbox_event_name_id_unique`
  ON `capi_event_outbox` (`event_name`, `event_id`);
