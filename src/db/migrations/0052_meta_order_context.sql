-- Customer-information snapshot for a Purchase that becomes eligible after
-- the checkout request has ended (for example, an online payment confirmed
-- hours later). Raw fbp/fbc, IP and user agent are required by Meta CAPI and
-- cannot be reconstructed from an operator's later payment-confirmation request.
ALTER TABLE orders ADD COLUMN meta_request_context TEXT;
