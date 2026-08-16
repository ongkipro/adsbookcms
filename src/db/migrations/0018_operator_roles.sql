-- Existing collaborators owned storefront content, which maps to the advertiser role.
-- Updating the credential revision also invalidates their pre-migration sessions.
UPDATE `admin_credentials`
SET
  `role` = 'advertiser',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `role` = 'collaborator';