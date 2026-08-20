import { formatIdr } from "../lib/format-idr";
import { pushGtmEcomEvent } from "../lib/gtm";
import { isValidWa62 } from "../lib/validation";
import { navigateAfterCheckout } from "../lib/checkout-navigation";
import {
  AbandonedLeadCaptureGate,
  createAbandonedLeadFingerprint,
  readAbandonedLeadFingerprints,
  writeAbandonedLeadFingerprint,
} from "../lib/abandoned-lead-session";

type MiddleFormConfig = {
  instanceId: string;
  productSlug: string;
  productId: string;
  productName: string;
  province: string;
  codDisabledProvinceCodes: string[];
};

function readStablePromoStock(productSlug: string) {
  const fallback = 11;
  try {
    const stockKey = `promo_stock_${productSlug}`;
    const existing = Number(sessionStorage.getItem(stockKey) || "");
    if (Number.isFinite(existing) && existing >= 5 && existing <= 18)
      return existing;
    const generated = Math.floor(Math.random() * 14) + 5;
    sessionStorage.setItem(stockKey, String(generated));
    return generated;
  } catch {
    return fallback;
  }
}

function applyPromoStock(root: Document | HTMLElement, productSlug: string) {
  const stockLeft = readStablePromoStock(productSlug);
  const stockEl = root.querySelector<HTMLElement>("[data-stock-left]");
  const progressEl = root.querySelector<HTMLElement>("[data-stock-progress]");
  if (stockEl) stockEl.textContent = String(stockLeft);
  if (progressEl) {
    const progressWidth = `${Math.max(10, Math.min(95, Math.round((stockLeft / 18) * 100)))}%`;
    progressEl.style.width = progressWidth;
  }
}

const findMiddleConfigEl = (formRoot: HTMLElement | null) => {
  if (!formRoot) return null;
  const scoped = formRoot.querySelector("[data-middle-form-config]");
  if (scoped) return scoped;
  const instanceId = formRoot.dataset.instanceId || "";
  return instanceId ? document.getElementById(`${instanceId}-config`) : null;
};

export function initPromoSessionStock(root?: Document | HTMLElement) {
  const scope = root || document;
  const formRoot = scope.querySelector<HTMLElement>("[data-middle-form-root]");
  const configEl = findMiddleConfigEl(formRoot);
  const parsedConfig = configEl?.textContent
    ? (JSON.parse(configEl.textContent) as MiddleFormConfig)
    : null;
  if (!formRoot || !parsedConfig) return;
  applyPromoStock(formRoot, parsedConfig.productSlug);
}

export function initMiddleOrderForm(
  config?: MiddleFormConfig,
  root?: Document | HTMLElement,
) {
  const scope = root || document;
  const formRoot = scope.querySelector<HTMLElement>("[data-middle-form-root]");
  const configEl = findMiddleConfigEl(formRoot || null);
  const parsedConfig =
    config ||
    (configEl?.textContent
      ? (JSON.parse(configEl.textContent) as MiddleFormConfig)
      : null);
  if (!parsedConfig) return;
  const { productSlug, productId, productName, province } = parsedConfig;
  const fmt = formatIdr;
  const normalizePhone = (raw: string) => {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("620")) return `62${digits.slice(3)}`;
    if (digits.startsWith("0")) return `62${digits.slice(1)}`;
    if (digits.startsWith("8")) return `62${digits}`;
    if (digits.startsWith("62")) return digits;
    return digits;
  };
  const isValidName = (value: string) =>
    /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{2,119}$/.test(value) &&
    /[A-Za-zÀ-ÿ]{2}/.test(value);
  const isValidAddress = (value: string) =>
    value.length >= 15 && /[A-Za-zÀ-ÿ]/.test(value) && /\s/.test(value);
  const createId = (prefix: string) =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const hashSha256Hex = async (input: string) => {
    const normalized = String(input || "")
      .trim()
      .toLowerCase();
    if (!normalized || !globalThis.crypto?.subtle) return "";
    const bytes = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };
  const trackedFlags = new Set<string>();
  const getCookieValue = (name: string) =>
    document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${name}=`))
      ?.split("=")[1] || "";
  const buildAdvancedMatching = async (
    extraUserData?: Record<string, unknown>,
  ) => {
    const normalizedPhone = String(extraUserData?.customer_phone || "").replace(
      /\D/g,
      "",
    );
    const normalizedName = String(extraUserData?.customer_name || "").trim();
    const firstName = normalizedName.split(/\s+/)[0] || "";
    const lastName = normalizedName.split(/\s+/).slice(1).join(" ");
    return {
      ph: normalizedPhone ? await hashSha256Hex(normalizedPhone) : undefined,
      fn: firstName ? await hashSha256Hex(firstName) : undefined,
      ln: lastName ? await hashSha256Hex(lastName) : undefined,
      external_id: normalizedPhone
        ? await hashSha256Hex(normalizedPhone)
        : undefined,
      client_user_agent: navigator.userAgent,
    };
  };
  const ensureMetaAdvancedMatching = async (
    extraUserData?: Record<string, unknown>,
  ) => {
    const pixelId = (window as any).__META_PIXEL_ID__;
    if (!(window as any).fbq || !pixelId) return;
    const advancedMatching = await buildAdvancedMatching(extraUserData);
    const signature = JSON.stringify(advancedMatching);
    if ((window as any).__META_AM_SIGNATURE__ === signature) return;
    (window as any).__META_AM_SIGNATURE__ = signature;
    (window as any).fbq("init", pixelId, advancedMatching);
  };
  const postMetaEvent = (payload: Record<string, unknown>) =>
    fetch("/api/meta-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  const trackMeta = async (
    eventName: "AddToCart" | "InitiateCheckout",
    extraUserData?: Record<string, unknown>,
  ) => {
    if (trackedFlags.has(eventName)) return;
    trackedFlags.add(eventName);
    const eventId = createId(`${eventName.toLowerCase()}_${productSlug}`);
    const selected = form?.querySelector<HTMLInputElement>(
      'input[name="variant"]:checked',
    );
    const contentName = String(selected?.dataset.label || productName);
    // content_ids Meta harus product ID (match katalog + funnel ViewContent), bukan variant unique id.
    const contentId = String(productId || '');
    const variantUniqueId = String(selected?.value || "");
    const value = Number(selected?.dataset.price || 1);
    if ((window as any).fbq) {
      await ensureMetaAdvancedMatching(extraUserData);
      (window as any).fbq(
        "track",
        eventName,
        {
          content_name: contentName,
          content_ids: contentId ? [contentId] : undefined,
          content_type: "product",
          value,
          currency: "IDR",
        },
        { eventID: eventId },
      );
    }
    postMetaEvent({
      event_name: eventName,
      event_id: eventId,
      lp_name: productSlug,
      product_id: contentId || undefined,
      content_name: contentName,
      value,
      currency: "IDR",
      content_type: "product",
      event_source_url: window.location.href,
      user_data: {
        ...extraUserData,
        fbp: getCookieValue("_fbp"),
        fbc: getCookieValue("_fbc"),
      },
    });
    pushGtmEcomEvent(
      eventName === "AddToCart" ? "add_to_cart" : "begin_checkout",
      {
        currency: "IDR",
        value,
        item_id: contentId,
        item_name: contentName,
        item_variant: variantUniqueId || undefined,
        event_id: eventId,
      },
    );
    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
      try {
        const parentOrigin = document.referrer ? new URL(document.referrer).origin : "*";
        window.parent.postMessage(
          {
            type: eventName === "AddToCart" ? "adsbook:add-to-cart" : "adsbook:initiate-checkout",
            content_name: contentName,
            content_ids: contentId ? [contentId] : undefined,
            content_type: "product",
            value,
            currency: "IDR",
            eventId,
          },
          parentOrigin,
        );
      } catch {}
    }
  };
  const hasQualifiedIdentity = () => {
    const customerName = String(nameInput?.value || "").trim();
    const customerPhone = normalizePhone(String(phoneInput?.value || ""));
    return customerName.length >= 3 && isValidWa62(customerPhone);
  };
  const maybeTrackAddToCart = (force = false) => {
    if (!force && !hasQualifiedIdentity()) return;
    const customerName = String(nameInput?.value || "").trim();
    const customerPhone = normalizePhone(String(phoneInput?.value || ""));
    void trackMeta("AddToCart", {
      ...(customerName ? { customer_name: customerName } : {}),
      ...(customerPhone ? { customer_phone: customerPhone } : {}),
      country: "id",
    });
  };
  const abandonedCapture = new AbandonedLeadCaptureGate(
    readAbandonedLeadFingerprints(sessionStorage),
  );
  let abandonedTimer: number | undefined;

  const maybeRecordAbandonedLead = () => {
    const customerName = String(nameInput?.value || "").trim();
    const customerPhone = normalizePhone(String(phoneInput?.value || ""));
    if (customerName.length < 3 || !isValidWa62(customerPhone)) return;

    const fingerprint = createAbandonedLeadFingerprint({
      customerName,
      customerPhone,
      productId,
    });
    if (!abandonedCapture.shouldStart(fingerprint)) return;

    // The capture used to send product_id and product_title and no variant. The
    // endpoint reads neither of those - only variant_id - so every lead from
    // this form landed with no order_items at all, and the operator saw "Produk
    // belum dipilih" on a lead that was filled in on a product page. The full
    // form always sent it; this one did not.
    const selectedVariant = formRoot?.querySelector<HTMLInputElement>(
      'input[name="variant"]:checked',
    );
    const abandonedVariantId = Number(selectedVariant?.value);
    const abandonedPrice = Number(selectedVariant?.dataset.price || 0);

    window.clearTimeout(abandonedTimer);
    abandonedTimer = window.setTimeout(() => {
      if (!abandonedCapture.start(fingerprint)) return;
      void fetch("/api/record-abandoned-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website: String(
            formRoot?.querySelector<HTMLInputElement>(
              '[name="contact_url_confirm"]',
            )?.value || "",
          ),
          customer_name: customerName,
          customer_phone: customerPhone,
          product_id: productId,
          product_title: productName,
          variant_id:
            Number.isInteger(abandonedVariantId) && abandonedVariantId > 0
              ? abandonedVariantId
              : undefined,
          total_amount: abandonedPrice > 0 ? abandonedPrice : undefined,
          address: addressInput ? addressInput.value.trim() : "",
          province,
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Abandoned capture rejected.");
          abandonedCapture.finish(fingerprint, true);
          writeAbandonedLeadFingerprint(sessionStorage, fingerprint);
        })
        .catch(() => {
          abandonedCapture.finish(fingerprint, false);
        });
    }, 600);
  };

  const timerKey = `promo_end_${productSlug}_middle`;
  const now = Date.now();
  const stored = Number(localStorage.getItem(timerKey) || 0);
  const end = stored > now ? stored : now + 30 * 60 * 1000;
  localStorage.setItem(timerKey, String(end));

  const form = formRoot?.querySelector("form") as HTMLFormElement | null;
  const nameInput = formRoot?.querySelector(
    "#customer-name",
  ) as HTMLInputElement | null;
  const phoneInput = formRoot?.querySelector(
    "#middle-phone",
  ) as HTMLInputElement | null;
  const errorEl = formRoot?.querySelector(
    "#middle-error",
  ) as HTMLParagraphElement | null;
  const submitButton = formRoot?.querySelector(
    "#submit-button",
  ) as HTMLButtonElement | null;
  const submitButtonLabel = submitButton?.querySelector(".submit-main-label");
  const summaryLabel = formRoot?.querySelector("#summary-label");
  const summaryCompare = formRoot?.querySelector("#summary-compare");
  const summaryDiscount = formRoot?.querySelector("#summary-discount");
  const summaryCompareRow = formRoot?.querySelector<HTMLElement>("#summary-compare-row");
  const summaryDiscountRow = formRoot?.querySelector<HTMLElement>("#summary-discount-row");
  const summaryTotal = formRoot?.querySelector("#summary-total");
  const summaryTotalNote = formRoot?.querySelector("#summary-total-note");

  if (
    !formRoot ||
    !form ||
    !nameInput ||
    !phoneInput ||
    !errorEl ||
    !submitButton
  )
    return;

  let submitting = false;

  const ensureFieldFeedback = (
    field: HTMLInputElement | HTMLTextAreaElement,
  ) => {
    const wrapper = field.closest(".form-field") || field.parentElement;
    if (!wrapper) return null;
    let feedback = wrapper.querySelector(
      ".field-feedback",
    ) as HTMLElement | null;
    if (!feedback) {
      feedback = document.createElement("small");
      feedback.className = "field-feedback";
      feedback.hidden = true;
      wrapper.appendChild(feedback);
    }
    return feedback;
  };

  const setFieldError = (
    field: HTMLInputElement | HTMLTextAreaElement,
    message = "",
  ) => {
    const feedback = ensureFieldFeedback(field);
    const wrapper = field.closest(".form-field");
    const hasValue = Boolean(String(field.value || "").trim());
    field.classList.toggle("field-invalid", Boolean(message));
    field.classList.toggle("field-valid", !message && hasValue);
    wrapper?.classList.toggle("has-error", Boolean(message));
    wrapper?.classList.toggle("has-success", !message && hasValue);
    field.setAttribute("aria-invalid", message ? "true" : "false");
    if (!feedback) return;
    feedback.textContent = message;
    feedback.hidden = !message;
  };

  const setIdValidationMessage = (
    field: HTMLInputElement | HTMLTextAreaElement,
  ) => {
    const name = field.getAttribute("name");
    const value = String(field.value || "").trim();

    if (name === "customer_name") {
      if (!value) field.setCustomValidity("Maaf, nama Anda belum terisi.");
      else if (!isValidName(value))
        field.setCustomValidity(
          "Maaf, nama lengkap hanya boleh berisi huruf dan minimal 3 karakter.",
        );
      else field.setCustomValidity("");
      return;
    }

    if (name === "customer_phone") {
      if (!value)
        field.setCustomValidity("Maaf, nomor WhatsApp Anda belum terisi.");
      else if (/[^\d]/.test(value))
        field.setCustomValidity(
          "Maaf, nomor WhatsApp Anda harus berupa angka saja.",
        );
      else if (!value.startsWith("62"))
        field.setCustomValidity("Maaf, nomor WhatsApp harus diawali 62.");
      else if (!isValidWa62(value))
        field.setCustomValidity(
          "Maaf, nomor WhatsApp harus nomor mobile Indonesia yang aktif. Contoh: 6281234567890.",
        );
      else field.setCustomValidity("");
      return;
    }

    if (name === "address") {
      if (!value)
        field.setCustomValidity("Maaf, alamat lengkap Anda belum terisi.");
      else if (!isValidAddress(value))
        field.setCustomValidity(
          "Maaf, alamat masih terlalu singkat. Isi jalan/dusun/desa dan patokan jika ada.",
        );
      else field.setCustomValidity("");
      return;
    }

    if (!value) {
      field.setCustomValidity("Maaf, kolom ini masih perlu dilengkapi.");
      return;
    }

    field.setCustomValidity("");
  };

  const validateField = (field: HTMLInputElement | HTMLTextAreaElement) => {
    setIdValidationMessage(field);
    const message = field.validationMessage || "";
    setFieldError(field, message);
    return !message;
  };

  const focusFieldWithScroll = (
    field: HTMLInputElement | HTMLTextAreaElement | null | undefined,
  ) => {
    if (!field) return;
    requestAnimationFrame(() => {
      field.scrollIntoView({ behavior: "smooth", block: "center" });
      field.focus({ preventScroll: true });
    });
  };

  const tick = () => {
    const minutesEl = formRoot.querySelector("[data-countdown-minutes]");
    const secondsEl = formRoot.querySelector("[data-countdown-seconds]");
    if (!minutesEl || !secondsEl) return;
    const diff = Math.max(0, Math.floor((end - Date.now()) / 1000));
    minutesEl.textContent = String(Math.floor((diff % 3600) / 60)).padStart(
      2,
      "0",
    );
    secondsEl.textContent = String(diff % 60).padStart(2, "0");
  };

  const addressInput = form.querySelector<HTMLTextAreaElement>(
    'textarea[name="address"]',
  );
  const getSelectedVariant = () =>
    form.querySelector<HTMLInputElement>('input[name="variant"]:checked');
  const setNodeText = (el: Element | null | undefined, text: string) => {
    if (el && el.textContent !== text) el.textContent = text;
  };

  const getSubmitState = () => {
    if (submitting)
      return {
        disabled: true,
        label: submitButton.dataset.loadingLabel || "Memproses Pesanan...",
      };
    const hasName = Boolean(nameInput && nameInput.value.trim().length >= 3);
    const hasPhone = Boolean(phoneInput && phoneInput.value.trim().length >= 8);
    const hasAddress = Boolean(
      addressInput && addressInput.value.trim().length >= 3,
    );

    if (!hasName)
      return { disabled: true, label: "Lengkapi Nama Terlebih Dahulu" };
    if (!hasPhone)
      return { disabled: true, label: "Lengkapi No. WA Terlebih Dahulu" };
    if (!hasAddress)
      return { disabled: true, label: "Lengkapi Alamat Terlebih Dahulu" };

    return { disabled: false, label: "Buat Order Sekarang" };
  };

  const syncSubmitState = () => {
    const next = getSubmitState();
    submitButton.disabled = next.disabled;
    submitButton.dataset.state = submitting
      ? "loading"
      : next.disabled
        ? "disabled"
        : "ready";
    if (submitButtonLabel) submitButtonLabel.textContent = next.label;
  };

  const setSubmitting = (isSubmitting: boolean, text = "") => {
    submitting = isSubmitting;
    submitButton.dataset.loadingLabel = text || "Memproses Pesanan...";
    syncSubmitState();
  };

  const syncVariant = () => {
    const checked = getSelectedVariant();
    if (!checked) return;
    const price = Number(checked.dataset.price || 0);
    const compare = Number(checked.dataset.compare || price);
    const hasDiscount = compare > price;
    const total = price;
    summaryCompareRow?.toggleAttribute("hidden", !hasDiscount);
    summaryDiscountRow?.toggleAttribute("hidden", !hasDiscount);
    setNodeText(summaryLabel, checked.dataset.label || productName);
    setNodeText(summaryCompare, fmt(compare));
    setNodeText(summaryDiscount, `- ${fmt(Math.max(0, compare - price))}`);
    setNodeText(
      summaryTotalNote,
      "Ongkir & admin dikonfirmasi via CS",
    );
    setNodeText(summaryTotal, fmt(total));
    syncSubmitState();
  };


  const applyQueryPrefill = () => {
    const params = new URLSearchParams(window.location.search);
    const variantId = String(
      params.get("variant_id") || params.get("variant") || "",
    ).trim();
    const customerName = String(params.get("customer_name") || "").trim();
    const customerPhone = String(params.get("customer_phone") || "").trim();
    const address = String(params.get("address") || "").trim();

    if (variantId) {
      const variantInput = form.querySelector<HTMLInputElement>(
        `input[name="variant"][value="${CSS.escape(variantId)}"]`,
      );
      if (variantInput) {
        variantInput.checked = true;
      }
    }

    if (customerName) {
      nameInput.value = customerName
        .replace(/[^A-Za-zÀ-ÿ\s'.-]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    if (customerPhone) {
      phoneInput.value = normalizePhone(customerPhone);
    }

    if (addressInput && address) {
      addressInput.value = address.trim();
    }

    syncVariant();
  };

  applyQueryPrefill();

  applyPromoStock(formRoot, productSlug);
  tick();
  if (
    formRoot.querySelector("[data-countdown-minutes]") &&
    formRoot.querySelector("[data-countdown-seconds]")
  ) {
    setInterval(tick, 1000);
  }

  form
    .querySelectorAll<HTMLInputElement>('input[name="variant"]')
    .forEach((el) =>
      el.addEventListener("change", () => {
        syncVariant();
        maybeTrackAddToCart(true);
      }),
    );
  nameInput.addEventListener("input", () => {
    nameInput.value = String(nameInput.value || "")
      .replace(/[^A-Za-zÀ-ÿ\s'.-]/g, "")
      .replace(/\s{2,}/g, " ");
    setIdValidationMessage(nameInput);
    syncSubmitState();
    maybeTrackAddToCart();
  });
  nameInput.addEventListener("blur", () => {
    nameInput.value = String(nameInput.value || "").trim();
    validateField(nameInput);
    syncSubmitState();
    maybeTrackAddToCart();
    maybeRecordAbandonedLead();
  });
  nameInput.addEventListener("invalid", () => {
    validateField(nameInput);
    syncSubmitState();
  });

  phoneInput.addEventListener("input", () => {
    const digits = String(phoneInput.value || "").replace(/\D/g, "");
    if (!digits) {
      phoneInput.value = "";
      phoneInput.setCustomValidity("");
      setFieldError(phoneInput, "");
      syncSubmitState();
      return;
    }
    if (digits.startsWith("620")) phoneInput.value = `62${digits.slice(3)}`;
    else if (digits.startsWith("0")) phoneInput.value = `62${digits.slice(1)}`;
    else if (digits.startsWith("8")) phoneInput.value = `62${digits}`;
    else if (digits.startsWith("62")) phoneInput.value = digits;
    else phoneInput.value = digits;
    setIdValidationMessage(phoneInput);
    syncSubmitState();
    maybeTrackAddToCart();
  });
  phoneInput.addEventListener("blur", () => {
    phoneInput.value = normalizePhone(phoneInput.value);
    validateField(phoneInput);
    syncSubmitState();
    maybeTrackAddToCart();
    maybeRecordAbandonedLead();
  });
  phoneInput.addEventListener("invalid", () => {
    validateField(phoneInput);
    syncSubmitState();
  });

  addressInput?.addEventListener("input", () => {
    addressInput.value = String(addressInput.value || "").replace(
      /\s{3,}/g,
      "  ",
    );
    setIdValidationMessage(addressInput);
    syncSubmitState();
  });
  addressInput?.addEventListener("blur", () => {
    addressInput.value = String(addressInput.value || "")
      .replace(/\s+/g, " ")
      .trim();
    validateField(addressInput);
    syncSubmitState();
  });
  addressInput?.addEventListener("invalid", () => {
    validateField(addressInput);
    syncSubmitState();
  });

  form
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input[required], textarea[required]",
    )
    .forEach((field) => {
      ensureFieldFeedback(field);
      field.addEventListener("blur", () => {
        validateField(field);
        syncSubmitState();
      });
      field.addEventListener("input", () => {
        if (field === nameInput) return;
        if (field === phoneInput) return;
        if (field === addressInput) return;
        field.setCustomValidity("");
        setFieldError(field, "");
        syncSubmitState();
      });
    });

  let sessionGuardToken = createId(`tg_${productSlug}`);
  syncSubmitState();
  submitButton.addEventListener("click", () => {
    maybeTrackAddToCart();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    setSubmitting(true, "Memvalidasi Data...");

    const fd = new FormData(form);
    const customerName = String(fd.get("customer_name") || "").trim();
    const customerPhone = normalizePhone(
      String(fd.get("customer_phone") || ""),
    );
    const address = String(fd.get("address") || "").trim();
    const checked = form.querySelector<HTMLInputElement>(
      'input[name="variant"]:checked',
    );
    const requiredFields = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input[required], textarea[required]",
      ),
    );
    const invalidField = requiredFields.find((field) => !validateField(field));
    if (
      invalidField ||
      !checked ||
      !isValidName(customerName) ||
      !isValidWa62(customerPhone) ||
      !isValidAddress(address)
    ) {
      errorEl.textContent =
        "Maaf, masih ada data yang perlu dilengkapi dengan benar.";
      errorEl.hidden = false;
      focusFieldWithScroll(invalidField);
      setSubmitting(false);
      return;
    }

    phoneInput.value = customerPhone;
    maybeTrackAddToCart();
    if (hasQualifiedIdentity()) {
      void trackMeta("InitiateCheckout", {
        customer_name: customerName,
        customer_phone: customerPhone,
        country: "id",
      });
    }
    const price = Number(checked.dataset.price || 0);
    const label = String(checked.dataset.label || productName);
    const eventId = createId(`middle_${productSlug}`);
    const guardToken = sessionGuardToken;
    let order: any = null;
    try {
      const response = await fetch("/api/submit-middle-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submit_token: guardToken,
          website: String(fd.get("contact_url_confirm") || ""),
          customer_name: customerName,
          customer_phone: customerPhone,
          address,
          province,
          payment_method: "cod",
          product_name: productName,
          quantity: 1,
          variant_unique_id: String(checked.value || ""),
          variant_id: String(checked.value || ""),
          shipping_cost: 0,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as any;
      if (!response.ok || payload?.success === false) {
        if (
          payload?.code === "AREA_REQUIRES_HYBRID" ||
          payload?.code === "AREA_REQUIRES_FULL" ||
          payload?.code === "COD_NOT_AVAILABLE_FOR_REGION"
        ) {
          errorEl.textContent =
            payload?.error ||
            "Wilayah Anda membutuhkan form pengiriman lengkap. Mengalihkan...";
          errorEl.hidden = false;
          setSubmitting(true, "Mengalihkan ke Form Lengkap...");
          const target = new URL(window.location.href);
          if (target.pathname === "/embed/form" || target.pathname === "/embed/form/") {
            target.searchParams.set("mode", "full");
            window.setTimeout(() => {
              window.location.assign(target.toString());
            }, 1800);
          } else {
            target.pathname = "/full-form";
            target.searchParams.delete("form");
            window.setTimeout(() => {
              navigateAfterCheckout(target.toString());
            }, 1800);
          }
          return;
        }
        errorEl.textContent =
          payload?.message ||
          payload?.error ||
          "Maaf, order belum berhasil dibuat. Silakan coba lagi.";
        errorEl.hidden = false;
        setSubmitting(false);
        return;
      }
      const rawOrder = payload?.data?.order || payload?.order || null;
      order =
        rawOrder?.data && typeof rawOrder.data === "object"
          ? rawOrder.data
          : rawOrder;
      const normalizedOrderId = String(
        payload?.data?.order_id || payload?.order_id || order?.order_id || "",
      ).trim();
      const normalizedOrderPk = String(
        payload?.data?.order_pk ||
          payload?.order_pk ||
          order?.unique_id ||
          order?.id ||
          "",
      ).trim();
      if (order && typeof order === "object") {
        if (normalizedOrderId) order.order_id = normalizedOrderId;
        if (normalizedOrderPk) order.order_pk = normalizedOrderPk;
      }
    } catch {
      errorEl.textContent =
        "Maaf, koneksi ke server sedang bermasalah. Silakan coba lagi.";
      errorEl.hidden = false;
      setSubmitting(false);
      return;
    }

    // eventId hanya untuk lead/funnel awal. Purchase di thanks page memakai
    // order_number - nilai yang sama dengan event_id server CAPI - supaya Meta
    // dedup jadi 1 conversion, bukan id acak yang tidak pernah cocok.
    const orderId = String(
      order?.order_id ||
        order?.invoice_number ||
        order?.order_number ||
        order?.unique_id ||
        order?.id ||
        `MID-${Date.now().toString().slice(-8)}`,
    );
    const orderPk = String(
      order?.order_pk || order?.unique_id || order?.id || "",
    );
    const statusToken = String(order?.status_token || "");
    const orderStatus = String(order?.status || "pending").toLowerCase();
    const paymentStatus = String(
      order?.payment_status || "unpaid",
    ).toLowerCase();
    const totalPayment = price;
    const state = {
      order_id: orderId,
      order_pk: orderPk,
      status_token: statusToken,
      payment_method: "cod",
      lead_only: true,
      order_status: orderStatus,
      payment_status: paymentStatus,
      event_id: eventId,
      value: price,
      name: customerName,
      phone: customerPhone,
      address,
      product_id: String(productId || ''),
      product_name: productName,
      product_price: price,
      quantity: 1,
      shipping_cost: 0,
      payment_admin_fee: 0,
      total_payment: totalPayment,
      variant_unique_id: String(checked.value || ""),
      variant_label: label,
      guard_token: guardToken,
    };
    sessionStorage.setItem("thanks_state", JSON.stringify(state));
    setSubmitting(true, "Mengalihkan...");

    navigateAfterCheckout("/thanks");
  });
}
