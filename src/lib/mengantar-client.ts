export type MengantarEstimateInput = {
  originId: string; // area _id
  destinationId: string; // area _id
  courier?: string; // default "all"
  weight?: number; // kg
  codAmount?: number;
};

export type CourierRateResult = {
  courier_code: string;
  courier_service: string;
  price: number;
  estimated_days: string;
  unsupported: boolean;
  unsupported_cod: boolean;
  cod_fee: number;
  is_fallback?: boolean;
};

export type MengantarAddressSearchResult = {
  _id: string;
  DISTRICT_NAME?: string;
  SUBDISTRICT_NAME?: string;
  CITY_NAME?: string;
  PROVINCE_NAME?: string;
  ZIP_CODE?: string;
};

export type MengantarPickupAddressInput = {
  addressId?: string;
  pickupName: string;
  pickupPic: string;
  pickupPicPhone: string;
  pickupAddress: string;
  pickupAutofill: string;
};

export type MengantarPickupAddress = {
  _id: string;
  PICKUP_NAME?: string;
  PICKUP_PIC?: string;
  PICKUP_PIC_PHONE?: string;
  PICKUP_ADDRESS?: string;
  PICKUP_AUTOFILL?: unknown;
};

export type MengantarPickupTimeInput = {
  addressId: string; // _id pickup address from GET /address
  date: string; // Format mm-dd-yyyy (e.g. 08-07-2026)
  time: string; // Slot 9:00 - 18:00
};

type MengantarApiResponse<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

const DEFAULT_TIMEOUT_MS = 10_000;

export function redactMengantarApiKey(message: string, apiKey: string): string {
  if (!apiKey) return message;
  let sanitized = message;
  for (const secret of [apiKey, encodeURIComponent(apiKey)]) {
    if (secret) sanitized = sanitized.split(secret).join('[REDACTED]');
  }
  return sanitized;
}
export function getActualMengantarRatePrice(
  item: Record<string, unknown>,
): number | null {
  const price = Number(item.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

const normalizePickupValue = (value: unknown) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleLowerCase("id-ID");

const normalizePickupPhone = (value: unknown) =>
  String(value || "").replace(/\D/g, "");

export function selectMengantarPickupAddress(
  addresses: readonly MengantarPickupAddress[],
  input: MengantarPickupAddressInput,
) {
  const requestedId = input.addressId?.trim();
  if (requestedId) {
    const byId = addresses.find((address) => address._id === requestedId);
    if (byId) return byId;
  }

  const expectedName = normalizePickupValue(input.pickupName);
  const expectedPhone = normalizePickupPhone(input.pickupPicPhone);
  const expectedAddress = normalizePickupValue(input.pickupAddress);
  return addresses.find(
    (address) =>
      normalizePickupValue(address.PICKUP_NAME) === expectedName &&
      normalizePickupPhone(address.PICKUP_PIC_PHONE) === expectedPhone &&
      normalizePickupValue(address.PICKUP_ADDRESS) === expectedAddress,
  );
}

export function extractMengantarPickupAddressId(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["_id", "address_id", "id"]) {
    const candidate = String(record[key] || "").trim();
    if (candidate) return candidate;
  }
  return "";
}


export class MengantarClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(apiKey: string, baseUrl = 'https://api-public.mengantar.com', timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  private get prefixUrl(): string {
    return `${this.baseUrl}/api/public/${this.apiKey}`;
  }

  private async requestJson<T>(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    if (!headers.has("x-client-source")) {
      headers.set("x-client-source", "directCall");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.prefixUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const raw = await res.text();
      let payload: MengantarApiResponse<T> = {};

      if (raw.trim()) {
        try {
          payload = JSON.parse(raw) as MengantarApiResponse<T>;
        } catch {
          throw new Error('Mengantar API mengembalikan respons yang tidak valid.');
        }
      }

      const message = typeof payload.message === 'string' && payload.message.trim() ? payload.message.trim() : '';
      if (!res.ok) {
        throw new Error(message || `Mengantar API gagal (${res.status}).`);
      }
      if (payload.success === false) {
        throw new Error(message || 'Mengantar API menolak permintaan.');
      }

      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Mengantar API timeout.');
      }
      if (error instanceof Error) {
        const sanitizedMessage = redactMengantarApiKey(error.message, this.apiKey);
        throw new Error(sanitizedMessage || 'Gagal menghubungi Mengantar API.');
      }
      throw new Error('Gagal menghubungi Mengantar API.');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Search Area for origin_id and destination_id
   */
  async searchAddress(keyword: string): Promise<MengantarAddressSearchResult[]> {
    const query = new URLSearchParams({ keyword });
    const json = await this.requestJson<MengantarAddressSearchResult[]>(
      `/address/search?${query.toString()}`,
    );
    return Array.isArray(json.data) ? json.data : [];
  }

  /**
   * List Registered Pickup Addresses (GET /address)
   */
  async getPickupAddresses(): Promise<MengantarPickupAddress[]> {
    const json = await this.requestJson<MengantarPickupAddress[]>("/address");
    return Array.isArray(json.data) ? json.data : [];
  }

  /**
   * Create or update a pickup address. Omitting `_id` lets Mengantar assign it.
   */
  async createPickupAddress(input: MengantarPickupAddressInput) {
    const formData = new URLSearchParams();
    if (input.addressId) formData.append("_id", input.addressId);
    formData.append("PICKUP_NAME", input.pickupName);
    formData.append("PICKUP_PIC", input.pickupPic);
    formData.append("PICKUP_PIC_PHONE", input.pickupPicPhone);
    formData.append("PICKUP_ADDRESS", input.pickupAddress);
    formData.append("PICKUP_AUTOFILL", input.pickupAutofill);

    const json = await this.requestJson<Record<string, unknown>>("/address", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });
    return json.data && typeof json.data === "object" ? json.data : {};
  }

  async ensurePickupAddress(input: MengantarPickupAddressInput) {
    const addresses = await this.getPickupAddresses();
    const existing = selectMengantarPickupAddress(addresses, input);
    const saved = await this.createPickupAddress({
      ...input,
      addressId: existing?._id,
    });
    const savedId = extractMengantarPickupAddressId(saved);
    if (savedId) return savedId;
    if (existing?._id) return existing._id;

    const created = selectMengantarPickupAddress(
      await this.getPickupAddresses(),
      { ...input, addressId: undefined },
    );
    if (created?._id) return created._id;
    throw new Error(
      "Mengantar menerima alamat pickup tetapi tidak mengembalikan ID alamat.",
    );
  }

  /**
   * Schedule Pickup Time Slot (POST /time)
   */
  async schedulePickupTime(input: MengantarPickupTimeInput) {
    const formData = new URLSearchParams();
    formData.append('address_id', input.addressId);
    formData.append('date', input.date); // mm-dd-yyyy
    formData.append('time', input.time); // 9:00 - 18:00

    return await this.requestJson<Array<{ _id: string; date: string; time: string }>>('/time', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });
  }

  /**
   * List Scheduled Pickup Times for an Address (GET /time?address=)
   */
  async getPickupTimes(addressId: string) {
    const query = new URLSearchParams({ address: addressId });
    return await this.requestJson<Array<{ _id: string; date: string; time: string }>>(`/time?${query.toString()}`);
  }

  /**
   * Estimate Shipping Rates across all couriers
   */
  async estimateRates(input: MengantarEstimateInput): Promise<CourierRateResult[]> {
    const originId = input.originId.trim();
    const destinationId = input.destinationId.trim();
    if (!originId || !destinationId) {
      throw new Error('Area asal dan tujuan Mengantar wajib dipilih dari hasil pencarian provider.');
    }

    const query = new URLSearchParams({
      origin_id: originId,
      destination_id: destinationId,
      courier: input.courier || 'all',
      weight: String(input.weight || 1),
    });

    if (input.codAmount) {
      query.append('COD_AMOUNT', String(input.codAmount));
    }

    const json = await this.requestJson<Record<string, unknown>>(`/order/estimate?${query.toString()}`);

    const results: CourierRateResult[] = [];
    if (json.data && typeof json.data === 'object') {
      // /order/estimate?courier=all returns an object keyed by courier name, not an array.
      // Single courier returns a flat object (no key wrapper).
      const entries =
        input.courier && input.courier !== 'all'
          ? [[input.courier, json.data] as const]
          : Object.entries(json.data);

      for (const [courierKey, rateData] of entries) {
        if (!rateData || typeof rateData !== 'object') continue;
        // Skip Cargo services — these are bulk/heavy freight, not consumer-facing
        if (/cargo/i.test(courierKey)) continue;
        const item = rateData as Record<string, unknown>;

        const isUnsupported = Boolean(item.unsupported);
        // `price` is the public courier charge. Never bill Mengantar's
        // `estimatedSpecialPrice`, which is the integrator discount.
        const rawPrice = getActualMengantarRatePrice(item);
        if (isUnsupported || rawPrice === null) continue;

        results.push({
          courier_code: courierKey,
          courier_service: courierKey,
          price: rawPrice,
          // /order/estimate does NOT return ETD — only /allEstimatePublic has estimatedDate.
          // Use estimate_delivery (from allEstimatePublic response) or estimatedDate if present,
          // otherwise leave empty to signal "not available" to the UI.
          estimated_days: String(item.estimate_delivery || item.estimatedDate || ''),
          unsupported: isUnsupported,
          unsupported_cod: Boolean(item.unsupported_cod || item.coverage_cod === false),
          cod_fee: Number(item.codFee || 0),
        });
      }
    }

    return results;
  }

  /**
   * Return the receiver's per-courier delivery history.
   */
  async getReceiverPerformance(phone: string) {
    const cleanPhone = phone.replace(/\D/g, '');
    const query = new URLSearchParams({ search: cleanPhone });
    const json = await this.requestJson<Record<string, unknown>>(`/getReceiverScoreByNumberUser?${query.toString()}`);
    return json.data && typeof json.data === 'object' ? json.data : {};
  }


  /**
   * Submit Order / Resi Generation to Mengantar API
   */
  async createShipment(orderPayload: Record<string, unknown>) {
    return await this.requestJson<Record<string, unknown>>('/order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });
  }
  /**
   * Complete payment for unpaid orders after wallet top-up (POST /order/pay-unpaid)
   */
  async payUnpaidOrder(batchId: string, courierCode: string) {
    return await this.requestJson<Record<string, unknown>>('/order/pay-unpaid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        batch_id: batchId,
        courier: courierCode,
      }),
    });
  }
}
