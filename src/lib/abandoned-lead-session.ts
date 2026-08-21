import { normalizePhone } from "./validation.ts";

export const ABANDONED_LEAD_SESSION_KEY =
  "adsbook_abandoned_lead_fingerprints_v2";
const LEGACY_ABANDONED_LEAD_SESSION_KEY =
  "adsbook_abandoned_lead_fingerprint_v1";

export type AbandonedLeadSnapshot = {
  customerName: string;
  customerPhone: string;
  productId?: string | number | null;
  variantId?: string | number | null;
};

export class AbandonedLeadCaptureGate {
  readonly #recordedFingerprints: Set<string>;
  readonly #inFlightFingerprints = new Set<string>();

  constructor(recordedFingerprints: Iterable<string> = []) {
    this.#recordedFingerprints = new Set(recordedFingerprints);
  }

  shouldStart(fingerprint: string) {
    return (
      !this.#recordedFingerprints.has(fingerprint) &&
      !this.#inFlightFingerprints.has(fingerprint)
    );
  }

  start(fingerprint: string) {
    if (!this.shouldStart(fingerprint)) return false;
    this.#inFlightFingerprints.add(fingerprint);
    return true;
  }

  finish(fingerprint: string, succeeded: boolean) {
    this.#inFlightFingerprints.delete(fingerprint);
    if (succeeded) this.#recordedFingerprints.add(fingerprint);
  }
}

export function createAbandonedLeadFingerprint(
  snapshot: AbandonedLeadSnapshot,
): string {
  return JSON.stringify([
    snapshot.customerName.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID"),
    normalizePhone(snapshot.customerPhone),
    String(snapshot.productId ?? "").trim(),
    String(snapshot.variantId ?? "").trim(),
  ]);
}

export function readAbandonedLeadFingerprints(
  storage: Pick<Storage, "getItem">,
): string[] {
  try {
    const stored = storage.getItem(ABANDONED_LEAD_SESSION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (fingerprint): fingerprint is string =>
            typeof fingerprint === "string" && fingerprint.length > 0,
        );
      }
    }
    const legacy = storage.getItem(LEGACY_ABANDONED_LEAD_SESSION_KEY);
    return legacy ? [legacy] : [];
  } catch {
    return [];
  }
}

export function writeAbandonedLeadFingerprint(
  storage: Pick<Storage, "getItem" | "setItem">,
  fingerprint: string,
): void {
  try {
    const fingerprints = [
      ...new Set([...readAbandonedLeadFingerprints(storage), fingerprint]),
    ];
    storage.setItem(
      ABANDONED_LEAD_SESSION_KEY,
      JSON.stringify(fingerprints),
    );
  } catch {
    // Capture still succeeds when storage is disabled; only reload deduplication degrades.
  }
}
