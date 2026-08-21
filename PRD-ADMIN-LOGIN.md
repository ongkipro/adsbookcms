# PRD — Admin Login and First-Run Access

> Verified against disk: 2026-08-17 @ `5cb1d32` + current A10 working tree

Scope: everything between an operator opening the admin and reaching a working dashboard — the login screen at `/hello`, the first-run credential, the forced password rotation, and the session that carries them. It does not cover the dashboard itself.

Requirement IDs continue the `PRD.md` scheme and do not overlap it.

---

## 1. Why this document exists

Two things made this worth specifying rather than assuming.

**A fresh install could not be opened.** The seeded credential accepted only a password supplied through `BOOTSTRAP_ADMIN_PASSWORD`, and nothing sets that on a new Worker. A brand-new install therefore had an admin account that no password could open. Fixed 2026-08-16; **LOGIN-1** now pins it.

**The login screen is the product's first impression** and the only screen a merchant sees before deciding whether the rest is trustworthy. It is also the only unauthenticated admin surface, so its failure modes are security-relevant in a way the dashboard's are not.

---

## 2. First-run access

| ID | Requirement | Status |
| --- | --- | --- |
| LOGIN-1 | A newly installed store shall be openable with the documented default credential `admin` / `admin` without any environment configuration. | Implemented |
| LOGIN-2 | Where `BOOTSTRAP_ADMIN_PASSWORD` is configured, it shall replace the default entirely rather than sit alongside it, and a value shorter than 16 characters shall be rejected outright rather than degrading to the default. | Implemented |
| LOGIN-3 | A session created from the default credential shall reach nothing except password rotation and logout — no order, customer, payment, provider key or setting. | Implemented — enforced in `src/middleware.ts`, not by convention |
| LOGIN-4 | The replacement password shall not be the default, the username, or shorter than 8 characters. | Implemented |
| LOGIN-5 | Once rotated, the default shall no longer open the account. | Implemented |
| LOGIN-6 | The login screen shall state, before the operator asks, that the default credential is `admin` / `admin` on a fresh install and must be replaced immediately. | Implemented — shown only while all three hold: a database binding exists, no `BOOTSTRAP_ADMIN_PASSWORD` is configured, and the stored hash is still the seeded one. The copy is built from the same constants that open the account, so it cannot announce a credential that does not work |
| LOGIN-7 | The install shall make the un-rotated state visible to the operator wherever they look — not only on the profile screen they are redirected to. | Implemented — middleware passes the state into the shell; a persistent security banner is shown and navigation is reduced to Profile plus Logout |

**On the risk.** A known default on a publicly reachable admin is a real exposure, and it is accepted deliberately. The mitigation is that it opens nothing: LOGIN-3 confines the session to changing its own password, so the window is an operator inconvenience rather than a data exposure. The window is closed on the normal path: the install wizard (`PRD.md` REQ-6, ADR-004) collects the operator's own password during installation and writes it with `must_change_password = 0`, so LOGIN-1 is now the fallback for an install whose credential was never claimed, not the way in.

---

## 3. The login screen

Route `/hello`, deliberately not `/admin/login`, and disallowed in `robots.txt`.

| ID | Requirement | Status |
| --- | --- | --- |
| LOGIN-10 | The screen shall render its own identity — store name and logo resolved at runtime — never a placeholder or another store's brand. | Implemented — was half done: the card hardcoded `/images/logo.webp` with a hardcoded alt. Now resolved from `Astro.locals.tenant` per request, and the product default is a neutral AdsBookCMS mark rather than a store's |
| LOGIN-11 | Username and password shall be a single form submitting in one action, with no multi-step reveal. | Implemented |
| LOGIN-12 | The password field shall offer a show/hide toggle that is reachable by keyboard and labelled for a screen reader. | Implemented |
| LOGIN-13 | A failed attempt shall say that the credential is wrong without revealing which half was wrong, and shall not disclose whether the username exists. | Implemented — the message was already generic but the **timing was not**: an unknown username returned immediately while a known one paid for PBKDF2, so fast meant "no such operator". Every branch now performs one verification. Measured over HTTP: unknown 188/193/272 ms, known 194/198/193 ms |
| LOGIN-14 | An error shall be announced to assistive technology, not only rendered. | Implemented — `role="alert"` |
| LOGIN-15 | Every interactive target shall be at least 44×44 px, and every input at least 16 px, so a mobile browser does not zoom on focus. | Implemented — unlayered floors outrank utilities; Chromium touch-size validation covered 320 and 390 CSS px |
| LOGIN-16 | The screen shall be usable at 320 px wide without horizontal scrolling, and shall respect `env(safe-area-inset-*)`. | Implemented — safe-area insets apply on all four sides at every width; real Chromium measured document width equal to viewport width at 320/390/768/1280 |
| LOGIN-17 | Submission shall be disabled while in flight and shall show that it is working, so a slow network does not produce a double submit. | Implemented — the lock existed but a page restored from the back/forward cache kept the button disabled, locking the operator out of their own login. A `pageshow` handler now resets it |
| LOGIN-18 | The screen shall carry no marketing, no third-party assets, and no imagery that cannot be shipped to a merchant's own customers. | Implemented 2026-08-16 — **this was recorded as done before it was.** The vendor advertisement had been replaced, but with the *reference store's* brand mark, which every install would then have worn. The stage is now colour only. The page also loaded a Google Fonts stylesheet and two preconnects for a family it never applied, announcing every operator's address to a third party for no rendering benefit; removed |
| LOGIN-19 | Repeated failures shall be rate-limited per identifier and per address, and no ceiling shall be reachable by someone who knows only the username. | Implemented — three buckets over a 15-minute window: the pair `username\|ip` at 5 is the brake, the address at 20 absorbs Indonesian mobile CGNAT, the identifier at 50 backstops a distributed attempt. Spent only on failure, so a correct password never costs an attempt. **The identifier ceiling was reachable and did lock operators out** — ten addresses spending their pair allowance is exactly 50 — so it now denies only an address that has itself failed for that account (ADR-014). Known ceiling: the KV counter is not atomic, so a parallel guesser is damped rather than braked (A-71) |

---

## 4. Session

| ID | Requirement | Status |
| --- | --- | --- |
| LOGIN-20 | The session shall be a signed token in an `HttpOnly`, `SameSite=Lax` cookie, never in storage a script can read. The cookie shall carry `Secure` whenever the request is HTTPS and shall omit it only for an explicitly plain-HTTP local development request, where a browser would otherwise reject the session entirely. | Implemented — cookie security derives from `Astro.url.protocol`; unit coverage pins HTTP and HTTPS, and the built Tailscale Worker stores the HTTP cookie and reaches `/admin/profile` |
| LOGIN-21 | Rotating a credential shall invalidate every existing session for it. | Implemented — `admin_credentials.updated_at` is the revision |
| LOGIN-22 | A corrupt or foreign cookie shall degrade to "no session", never to an error page. | Implemented — 15 malformed shapes covered by test |
| LOGIN-23 | A session shall not outlive 24 hours regardless of the token's own claims. | Implemented |
| LOGIN-24 | After login the operator shall land on the default route for their role, and on the rotation screen when rotation is due. | Implemented |

---

## 5. What "done" looks like

All login and first-run requirements in this document are implemented locally.

One was found to be *unreachable rather than wrong*: LOGIN-3's rotation gate is a
correct default-deny allowlist and could not be walked past — but middleware
classified paths from the raw request URL, so `//admin/...` never reached the
gate at all. Fixed 2026-08-17 (ADR-013); the gate itself needed no change.

Verification on 2026-08-17 used the built Worker, not source-only rendering. Chromium exercised `/hello`, forced password rotation, the normal dashboard, search, mobile menu, and logout at 320, 390, 768, and 1280 CSS px. Every measured document width equalled its viewport; runtime and network failure lists were empty. A manual screen-reader pass on physical hardware remains useful release QA, but it is not an unimplemented product requirement.

The transport contract also requires two executable cases: an HTTPS request
must emit `Secure`, while a plain-HTTP local request must establish a session
without it. `import.meta.env.PROD` is not evidence of the request transport:
`wrangler dev` serves a production build over HTTP, which is the exact shape
that made Tailscale login loop back to `/hello`.

---

## 6. Non-goals

- Single sign-on, OAuth, or an identity provider.
- Two-factor authentication. Worth doing later; it is not what stands between this product and its first install.
- Self-service password reset by email. There is no mail transport, and an installable product should not require one to be reachable.
- A separate mobile login screen. One responsive screen, not two.
