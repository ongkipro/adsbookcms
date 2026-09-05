import {
  isValidMetaBrowserId,
  isValidMetaExternalId,
  readMetaBrowserIds,
} from "./click-ids.ts";
import { getClientIp } from "./rate-limit.ts";

/** Original browser/request identity retained for a delayed paid Purchase. */
export type MetaOrderContext = {
  externalId?: string;
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  userAgent?: string;
};

const MAX_IP_LENGTH = 64;
const MAX_USER_AGENT_LENGTH = 512;

function cleanClientIp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  if (!cleaned || cleaned.toLowerCase() === "unknown" || cleaned.length > MAX_IP_LENGTH) {
    return undefined;
  }
  return cleaned;
}

function cleanUserAgent(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= MAX_USER_AGENT_LENGTH ? cleaned : undefined;
}

export function captureMetaOrderContext(request: Request): MetaOrderContext {
  const browserIds = readMetaBrowserIds(request);
  return {
    externalId: browserIds.externalId,
    fbp: browserIds.fbp,
    fbc: browserIds.fbc,
    clientIp: cleanClientIp(getClientIp(request.headers)),
    userAgent: cleanUserAgent(request.headers.get("user-agent")),
  };
}

export function serializeMetaOrderContext(
  context: MetaOrderContext,
): string | undefined {
  const cleaned = normalizeMetaOrderContext(context);
  return Object.values(cleaned).some(Boolean) ? JSON.stringify(cleaned) : undefined;
}

export function parseMetaOrderContext(raw: unknown): MetaOrderContext {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    return normalizeMetaOrderContext(JSON.parse(raw) as MetaOrderContext);
  } catch {
    return {};
  }
}

function normalizeMetaOrderContext(context: MetaOrderContext): MetaOrderContext {
  const normalized: MetaOrderContext = {};
  if (isValidMetaExternalId(context?.externalId)) {
    normalized.externalId = context.externalId;
  }
  if (isValidMetaBrowserId(context?.fbp)) normalized.fbp = context.fbp;
  if (isValidMetaBrowserId(context?.fbc)) normalized.fbc = context.fbc;
  const clientIp = cleanClientIp(context?.clientIp);
  if (clientIp) normalized.clientIp = clientIp;
  const userAgent = cleanUserAgent(context?.userAgent);
  if (userAgent) normalized.userAgent = userAgent;
  return normalized;
}
