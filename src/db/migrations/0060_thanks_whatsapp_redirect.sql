-- Whether /thanks hands a COD buyer straight to the store's WhatsApp support
-- once the Purchase has been sent. Off by default: an install keeps today's
-- behaviour (a button) until an operator turns it on in Settings -> Store.
ALTER TABLE stores ADD COLUMN thanks_whatsapp_redirect INTEGER NOT NULL DEFAULT 0;
