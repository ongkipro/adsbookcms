export function json(data: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(headers || {}),
    },
  });
}

export function jsonOk(data: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  return json({ success: true, ...data }, status, headers);
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return json({ success: false, error: message, ...(extra || {}) }, status);
}
