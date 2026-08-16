# Google Ads Conversion Signal & Merchant Center Setup Guide

> Verified against disk: 2026-08-17 @ `8111d24`

> **Product:** AdsBookCMS (single) — one installer, one Worker, one store.
> **Repository role:** product. Examples below name `permatamall.shop`, the first install, which lives in its own repository (`ongkipro/permatamall`); substitute your own install's domain.
> **Engine stack:** Astro SSR + Cloudflare Workers + Google Tag (`gtag.js`) + GTM + Enhanced Conversions + Consent Mode v2 + Merchant Center XML feed.

Deeper technical contract: [`../TRACKING_SPECS.md`](../TRACKING_SPECS.md). System architecture and gap register: [`../ARCHITECTURE.md`](../ARCHITECTURE.md). Decisions: [`../DECISIONS.md`](../DECISIONS.md).

**Convention used below:** text in **bold** that you must literally find in the Google Ads or Merchant Center interface is marked as a *UI label* and left exactly as Google renders it. Everything else is English instructional prose.

---

## 1. Signal Architecture Overview

The conversion signal path, in order:

$$\text{Ad click (gclid, gbraid, wbraid)} \longrightarrow \text{Consent Mode v2 + Conversion Linker} \longrightarrow \text{Enhanced Conversions} \longrightarrow \text{Google Ads / Merchant Center feed}$$

```text
┌──────────────────────┐    ┌──────────────────────┐    ┌────────────────────────────┐
│  Landing Page Click  │───>│  Click-ID Storage    │───>│  Consent Mode v2 Matrix    │
│ (gclid/gbraid/wbraid)│    │ (zanoby_click_ids)   │    │ (32 EEA/UK/CH: denied      │
│                      │    │  90-day cookie       │    │  everywhere else: granted) │
└──────────────────────┘    └──────────────────────┘    └────────────────────────────┘
                                                                       │
                                                                       ▼
┌──────────────────────┐    ┌──────────────────────┐    ┌────────────────────────────┐
│ Merchant Center Feed │    │ Enhanced Conversions │    │  Conversion Deduplication  │
│ /feed/google-catalog │    │ (SHA-256 phone/name) │    │ (transaction_id: INV-N)    │
└──────────────────────┘    └──────────────────────┘    └────────────────────────────┘
```

---

## 2. Step-by-Step Setup

### Step 1 — Create the purchase conversion action

1. Open Google Ads (`https://ads.google.com`).
2. Go to *UI label* **Goals** → **Conversions** → **Summary**.
3. Click *UI label* **+ New conversion action**, then select *UI label* **Website**.
4. Enter your store domain (for the reference instance, `https://permatamall.shop`) and click *UI label* **Scan**.
5. Scroll to *UI label* **Add a conversion action manually** and configure:
   - **Goal category** — select *UI label* **Purchase**.
   - **Conversion name** — use a name that identifies your own store and the surface, for example `<Your Store> Purchase - Website`. Do not copy a name from another merchant's account; it becomes the reporting label you will read for the life of the account.
   - **Value** — select *UI label* **Use different values for each conversion**. Set a default value matching a typical order and default currency `IDR`.
   - **Count** — select *UI label* **Every**. Every purchase is counted, which is the correct setting for ecommerce transactions.
   - **Click-through conversion window** — `30 days`.
   - **Attribution model** — `Data-driven`. This is Google's own recommended default.
6. Click *UI label* **Done**, then *UI label* **Save and continue**.
7. Record the **conversion ID** (format `AW-123456789`) and **conversion label** (format `AbCd_EFGHIJKlm`).
8. Enter both in the store admin under Ads & Tracking → Google. They are stored in D1 and take effect on the next request without a rebuild. The Google tag renders **only when both are present**; either one alone renders nothing.

### Step 2 — Enable Enhanced Conversions for Web

1. On the conversion action detail page, expand *UI label* **Enhanced conversions**.
2. Check *UI label* **Turn on enhanced conversions**.
3. Select *UI label* **Google tag** or *UI label* **Google Tag Manager** as the implementation method.
4. The storefront hashes first-party data client-side before dispatch, in `MetaThanksTracker.astro`:
   - `sha256_phone_number` — the phone normalized to E.164 **including the leading `+`** (for example `+6281234567890`), then SHA-256 hashed. Note that the Meta leg hashes the same number **without** the `+`; the two hashes are deliberately different and must not be shared.
   - `sha256_first_name` — first whitespace-delimited token of the name, trimmed, SHA-256 hashed.
   - `sha256_last_name` — remaining name tokens joined by a space, SHA-256 hashed.
   - Email is **not** currently included in the browser Enhanced Conversions payload.
5. Click *UI label* **Save**.

### Step 3 — Configure the GTM container (optional, recommended)

If using Google Tag Manager (`GTM-XXXXXXX`), configure it in the store admin under Ads & Tracking → Google. GTM is validated and loaded independently of the Google Ads conversion pair, so one can be configured without the other.

In the GTM workspace:

- **Tag 1 — Conversion Linker**
  - Tag type: *UI label* **Conversion Linker**
  - Trigger: *UI label* **All Pages**
- **Tag 2 — Google Tag**
  - Tag type: *UI label* **Google Tag**
  - Tag ID: your `AW-` conversion ID
  - Trigger: *UI label* **All Pages**
- **Tag 3 — Google Ads Conversion Tracking**
  - Tag type: *UI label* **Google Ads Conversion Tracking**
  - Conversion ID: your `AW-` ID, or a variable such as `{{Google Ads ID}}`
  - Conversion label: your label, or a variable such as `{{Google Ads Label}}`
  - Value: `{{dlv - total_price}}`
  - Currency code: `IDR`
  - Transaction ID: `{{dlv - order_id}}`
  - Enable enhanced conversions: checked, with user-data variable `{{dlv - user_data}}`
  - Trigger: custom event `purchase`

The storefront pushes `page_view`, `view_item`, `add_to_cart`, `begin_checkout`, and `purchase` to `window.dataLayer` using the GA4/GTM ecommerce schema.

### Step 4 — Submit the Merchant Center catalog feed

1. Open Google Merchant Center (`https://merchants.google.com`).
2. Go to *UI label* **Products** → **Feeds**, then click *UI label* **+ Primary feed**.
3. Target country: **Indonesia**. Language: **Indonesian**.
4. Select *UI label* **Scheduled fetch**.
5. Name the feed after your own store.
6. Feed URL: `https://<your-domain>/feed/google-catalog.xml` (served by `src/pages/feed/google-catalog.xml.ts`). A Meta catalog feed is served in parallel at `/feed/meta-catalog.xml`.
7. Fetch frequency: **Daily**.

#### Automatic taxonomy engine

`src/lib/ad-taxonomy.ts` derives the Google Product Category (GPC) ID, the GPC path, the Meta commerce category path, and an internal product-type path from the product's category, title, and description — no manual mapping by the merchant.

Matching is a **keyword-count** scan: for each rule, count how many of its keywords appear in the combined lowercased `category + title + description`, and take the rule with the highest count. Ties resolve to the earliest rule in the list. Empty text, or no keyword match at all, falls back to the default.

The nine rules as they ship, in source order:

| GPC ID | Google / Meta category path | Internal product type | Sample keywords |
| --- | --- | --- | --- |
| `6551` | `Apparel & Accessories > Handbags, Wallets & Cases > Handbags` | `Fashion Wanita > Tas & Aksesori` | tas, tote, bag, dompet, selempang, handbag, clutch, ransel, sling |
| `2863` | `Home & Garden > Lawn & Garden > Gardening > Fertilizer` | `Pertanian > Pupuk & Nutrisi` | pupuk, fertilizer, sawit, padi, cabai, jagung, ganoderma |
| `2849` | `Home & Garden > Lawn & Garden > Gardening` | `Pertanian > Perkebunan & Benih` | benih, biji, bibit, kebun, media tanam, pot |
| `2547` | `Health & Beauty > Personal Care > Cosmetics > Skin Care` | `Kecantikan & Perawatan > Skincare` | skincare, serum, lotion, krim, toner, sunscreen |
| `567` | `Health & Beauty > Personal Care > Soap` | `Kecantikan & Perawatan > Sabun & Mandi` | sabun, soap, body wash, cleanser |
| `642` | `Health & Beauty > Health Care > Biotherapy & Alternative Medicine > Herbal Supplements` | `Kesehatan > Suplemen Herbal` | herbal, madu, stamina, jamu, suplemen, kapsul |
| `1604` | `Apparel & Accessories > Clothing` | `Fashion & Pakaian > Pakaian` | baju, kaos, celana, jaket, dress, gamis |
| `1630` | `Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils` | `Perkakas & Rumah Tangga > Alat Dapur` | pisau, asahan, alat dapur, pengasah, perkakas |
| `222` | `Electronics` | `Elektronik & Gadget` | elektronik, gadget, charger, kabel, headset, lampu |

Default when nothing matches: GPC `6551`, the handbags path. When a category name is present but no rule matched, the product type becomes `Umum > <category>`.

#### Known gap — the taxonomy carries rules for merchants this install does not serve

The live catalog for the reference instance is women's handbags (`Tote Bag`, `Tas Selempang` — see `scripts/seed-catalog.sql`), and rule `6551` covers exactly that, both as the first rule and as the fallback default. The handbag path is correct.

What is stale is the **rest** of the table. Rules `2863`, `2849`, `2547`, `567`, `642`, and `1630` were calibrated for earlier merchants selling agricultural inputs, skincare, herbal supplements, and knives/sharpeners. They are dead weight for a handbag catalog, and worse, they are live misclassification risk: because matching is a raw keyword count over title **and description**, a handbag listing whose description happens to mention `kulit`, `organik`, `buah`, or `potong` can outscore the handbag rule and be submitted to Merchant Center under a fertilizer or skincare category. There is no minimum score, no category whitelist, and no per-store configuration.

Treat this as a known gap, not as a finished taxonomy engine:

- audit the GPC ID actually emitted for each live SKU in the feed before submitting it to Merchant Center;
- when adding a product, avoid description wording that collides with the legacy keyword sets;
- the durable fix is to make the rule set store-configurable rather than compiled in. It is not implemented.

### Step 5 — Verify live signals

1. Install the *UI label* **Google Tag Assistant Companion** browser extension.
2. Open the storefront in Tag Assistant debug mode.
3. Confirm **both** Consent Mode default calls appear, in this order: the region-scoped `denied` default, then the unscoped `granted` default (see §3).
4. Perform a test purchase.
5. Verify the `conversion` event payload. Note the `transaction_id` format — `INV-` plus the order sequence, never `ORD-`:

   ```json
   {
     "send_to": "AW-123456789/AbCd_EFGHIJKlm",
     "value": 249000,
     "currency": "IDR",
     "transaction_id": "INV-10042",
     "user_data": {
       "sha256_phone_number": "<sha256 of +62… including the plus>",
       "sha256_first_name": "<sha256 of first name>",
       "sha256_last_name": "<sha256 of last name>"
     }
   }
   ```

6. Reload `/thanks` and confirm no second conversion fires.

---

## 3. Core Contract & Consent Rules

| Parameter | Value / behavior |
| --- | --- |
| **Consent default — 32 listed regions** | `ad_storage: denied`, `ad_user_data: denied`, `ad_personalization: denied`, `analytics_storage: denied`, with `wait_for_update: 500` |
| **Consent default — everywhere else** | `ad_storage: granted`, `ad_user_data: granted`, `ad_personalization: granted`, `analytics_storage: granted` |
| **Deduplication key** | `transaction_id`, set to the backend order number (`INV-<10000 + id>`). Prevents count spikes from a reloaded thank-you page. Omitted entirely when no order number exists, because an empty string would make every order collide instead of dedupe. |
| **Click-ID storage** | `gclid`, `gbraid`, `wbraid` captured in middleware from the landing URL into the `zanoby_click_ids` first-party cookie, `Max-Age` 90 days, `SameSite=None; Secure` on HTTPS. Persisted to `orders.ad_click_ids` at checkout. |
| **Conversion value** | Item price × quantity, in IDR. COD qualifies on persisted order success; prepaid qualifies only after authenticated `is_paid: true` reconciliation. |

### The Consent Mode region list

`src/components/tracking/GoogleAdsBase.astro` issues the region-scoped `denied` default **first**, then the unscoped `granted` default. Google applies the most specific matching rule, so visitors in the listed regions are denied and everyone else is granted.

The list holds **32** ISO codes — the 27 EU member states plus Iceland, Liechtenstein, and Norway (completing the EEA), plus the United Kingdom and Switzerland:

`AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR, DE, GR, HU, IS, IE, IT, LV, LI, LT, LU, MT, NL, NO, PL, PT, RO, SK, SI, ES, SE, GB, CH`

The rationale recorded in the source: the consent requirement is EEA/UK law, this storefront sells to Indonesia and ships no consent management platform, and a global `denied` default would destroy the store's own conversion signal to satisfy a rule that does not govern its traffic.

**Two consequences you must accept before advertising into those regions.** No consent management platform exists in this repository, so nothing ever calls `gtag('consent', 'update', …)`; the 500 ms `wait_for_update` window expires unanswered and visitors from the 32 listed regions stay denied for the entire session. If the store ever targets the EEA or UK, install a real CMP and wire the `update` call first — otherwise that traffic cannot be measured at all. The region list is compiled into the component and is not configurable per store.

### Click-ID cookie naming and the legacy read fallback

The cookie is `adsbook_click_ids`, defined as `CLICK_ID_COOKIE` in `src/lib/click-ids.ts`. It was renamed from `zanoby_click_ids` — a brand carried over from an earlier deployment — on 2026-08-16.

The rename shipped **with** a read fallback rather than as a find-and-replace, because a bare rename would have silently dropped attribution mid-funnel for every visitor who clicked an ad in the previous 90 days:

- `readClickIdCookie()` matches `adsbook_click_ids` first and falls back to `zanoby_click_ids` only when the current cookie is absent;
- nothing writes the legacy name, so it expires naturally and the fallback can be deleted once 90 days have passed since deploy;
- the `sessionStorage` key in `src/lib/checkout-navigation.ts` needed no fallback — its writer and reader ship in the same page load and cannot straddle a deploy.

The embed `postMessage` prefix moved from `cmsads:` to `adsbook:` in the same change. That one **is** breaking for already-published embeds; see `TRACKING_SPECS.md` §8.

---

## 4. Verification Commands

```bash
npm test
npm run check
npm run build
```

A green build proves neither Google acceptance, Merchant Center feed health, attribution, nor campaign performance. Record observed browser evidence and any live-platform results separately, in `STATUS.md` and `BUILD-LOG.md`.
