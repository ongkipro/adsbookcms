export const MAX_EMBED_ALLOWED_ORIGINS = 25;
export const MAX_EMBED_ORIGIN_LENGTH = 300;

export type EmbedOriginPolicy = {
  origins: string[];
  valid: boolean;
};

function originCandidates(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  if (!value.trim()) return [];
  return value.split(/[,\n]/);
}

export function parseEmbedAllowedOrigins(value: unknown): EmbedOriginPolicy {
  const candidates = originCandidates(value);
  if (!candidates || candidates.length > MAX_EMBED_ALLOWED_ORIGINS * 4) {
    return { origins: [], valid: false };
  }

  const origins = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      return { origins: [], valid: false };
    }
    const raw = candidate.trim();
    if (
      !raw ||
      raw.length > MAX_EMBED_ORIGIN_LENGTH ||
      raw.includes("*") ||
      !/^https:\/\/[^/?#]+$/i.test(raw)
    ) {
      return { origins: [], valid: false };
    }

    try {
      const url = new URL(raw);
      if (
        url.protocol !== "https:" ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        url.origin === "null"
      ) {
        return { origins: [], valid: false };
      }
      origins.add(url.origin);
      if (origins.size > MAX_EMBED_ALLOWED_ORIGINS) {
        return { origins: [], valid: false };
      }
    } catch {
      return { origins: [], valid: false };
    }
  }


  return { origins: [...origins], valid: true };
}

export function resolveEmbedAllowedOrigins(
  storedValue: unknown,
  environmentFallback: unknown,
): EmbedOriginPolicy {
  return parseEmbedAllowedOrigins(
    storedValue === null || storedValue === undefined
      ? environmentFallback
      : storedValue,
  );
}

export function buildEmbedFrameAncestors(value: unknown): string {
  const policy = parseEmbedAllowedOrigins(value);
  const externalOrigins = policy.valid ? policy.origins : [];
  return ["frame-ancestors", "'self'", ...externalOrigins].join(" ");
}
