import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { Input } from "../ui/input";
import { formatContentId } from "../../lib/catalog-feed";
type Variant = {
  key: string;
  id?: number | string;
  sku: string;
  title: string;
  price: string;
  compare_price: string;
  weight_grams: string;
  stock: string;
};
type ProductPayload = {
  id?: number | string;
  title: string;
  slug: string;
  category: string;
  image_url: string;
  is_active: boolean;
  variants: Array<{
    id?: number | string;
    sku: string;
    title: string;
    price: number;
    compare_price?: number;
    weight_grams: number;
    stock: number;
  }>;
};
type ProductVariantResponse = {
  id: number | string;
  sku: string;
  title: string;
  price: number;
  compare_price: number | null;
  weight_grams: number;
  stock: number;
};
type ProductResponse = {
  id: number | string;
  title: string;
  slug: string;
  category: string | null;
  image_url: string | null;
  is_active: number | boolean;
  variants: ProductVariantResponse[];
};
const emptyVariant = (key: string): Variant => ({
  key,
  sku: "",
  title: "",
  price: "",
  compare_price: "",
  weight_grams: "1000",
  stock: "1000",
});
const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function ProductForm({ productId }: { productId?: string }) {
  const editing = Boolean(productId);
  const nextVariantKey = useRef(1);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const category = "Umum";
  const [active, setActive] = useState(!editing);
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [variants, setVariants] = useState<Variant[]>(() => [
    emptyVariant("new-0"),
  ]);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"idle" | "error" | "success">(
    "idle",
  );

  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    void fetch(`/api/admin/products?id=${encodeURIComponent(productId)}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success)
          throw new Error(payload.error || "Produk gagal dimuat.");
        return payload.data as ProductResponse;
      })
      .then((product) => {
        setTitle(product.title || "");
        setSlug(product.slug || "");
        setImageUrl(product.image_url || "");
        setActive(product.is_active !== undefined ? Boolean(product.is_active) : true);
        setVariants(
          Array.isArray(product.variants) && product.variants.length
            ? product.variants.map((variant: ProductVariantResponse) => ({
                key: `saved-${variant.id}`,
                id: variant.id,
                sku: variant.sku || "",
                title: variant.title || "",
                price: String(variant.price ?? ""),
                compare_price: String(variant.compare_price ?? ""),
                weight_grams: String(variant.weight_grams ?? ""),
                stock: String(variant.stock ?? 0),
              }))
            : [emptyVariant("new-0")],
        );
      })
      .catch((reason) => {
        if (!(reason instanceof Error && reason.name === "AbortError")) {
          setLoadError(
            reason instanceof Error ? reason.message : "Produk gagal dimuat.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [productId]);

  const updateVariant = (index: number, field: keyof Variant, value: string) =>
    setVariants((current) =>
      current.map((variant, itemIndex) =>
        itemIndex === index ? { ...variant, [field]: value } : variant,
      ),
    );
  const capitalizeTitle = (text: string) =>
    text
      .split(" ")
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ""))
      .join(" ");

  const onTitleChange = (value: string) => {
    const formatted = capitalizeTitle(value);
    setTitle(formatted);
    setSlug(slugify(formatted));
  };

  const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

  const convertImageToWebP = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      if (file.type === "image/webp" && file.size <= MAX_IMAGE_SIZE) {
        return resolve(file);
      }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Gagal mengolah canvas gambar."));
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Gagal konversi gambar ke WebP."));
            if (blob.size > MAX_IMAGE_SIZE) {
              return reject(new Error("Ukuran file terkompresi masih melebihi 2 MB."));
            }
            const webpFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, "") + ".webp",
              { type: "image/webp" },
            );
            resolve(webpFile);
          },
          "image/webp",
          0.85,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("File gambar tidak dapat dibaca."));
      };
      img.src = url;
    });
  };

  const uploadImage = async (file: File) => {
    if (file.size > MAX_IMAGE_SIZE) {
      setStatusTone("error");
      setStatus("Ukuran file maksimal 2 MB.");
      return;
    }
    setUploading(true);
    setStatusTone("idle");
    setStatus("Mengonversi & mengunggah gambar WebP…");
    try {
      const webpFile = await convertImageToWebP(file);
      const formData = new FormData();
      formData.set("file", webpFile);
      const response = await fetch("/api/admin/upload-r2", {
        method: "POST",
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success || !result.url) {
        throw new Error(result.error || "Gambar gagal diunggah.");
      }
      setImageUrl(String(result.url));
      setStatusTone("success");
      setStatus("Gambar berhasil diunggah dalam format WebP.");
    } catch (reason) {
      setStatusTone("error");
      setStatus(
        reason instanceof Error ? reason.message : "Gambar gagal diunggah.",
      );
    } finally {
      setUploading(false);
    }
  };
  const submit = async (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setSaving(true);
    setStatusTone("idle");
    setStatus("Menyimpan produk…");
    const payloadVariants = variants.map((variant) => ({
      ...(variant.id ? { id: variant.id } : {}),
      sku: variant.sku.trim().toUpperCase(),
      title: variant.title.trim(),
      price: Number(variant.price),
      ...(variant.compare_price
        ? { compare_price: Number(variant.compare_price) }
        : {}),
      weight_grams: Number(variant.weight_grams),
      stock: Number(variant.stock),
    }));

    const invalidVariant = payloadVariants.find((v) => v.title.length > 15);
    if (invalidVariant) {
      setStatusTone("error");
      setStatus(`Nama varian "${invalidVariant.title}" melebihi batas maksimal 15 karakter.`);
      setSaving(false);
      return;
    }

    const payload: ProductPayload = {
      ...(productId ? { id: productId } : {}),
      title: title.trim(),
      slug: slug.trim(),
      category: category.trim(),
      image_url: imageUrl,
      is_active: active,
      variants: payloadVariants,
    };
    try {
      const response = await fetch("/api/admin/products", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success)
        throw new Error(result.error || "Produk gagal disimpan.");
      setStatusTone("success");
      setStatus(result.message || "Produk berhasil disimpan.");
      window.location.assign("/admin/products");
    } catch (reason) {
      setStatusTone("error");
      setStatus(
        reason instanceof Error ? reason.message : "Produk gagal disimpan.",
      );
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div
        className="h-96 animate-pulse rounded-xl bg-slate-100"
        aria-label="Memuat formulir produk"
        aria-busy="true"
      />
    );
  if (loadError)
    return (
      <section
        className="rounded-xl border border-rose-200 bg-slate-50 p-8 text-center shadow-sm"
        role="alert"
      >
        <h2 className="text-lg font-black text-slate-950">
          Produk gagal dimuat
        </h2>
        <p className="mt-2 text-sm text-slate-600">{loadError}</p>
        <a
          href="/admin/products"
          className="btn-primary mt-5 min-h-11 !bg-emerald-700 px-5 text-xs hover:!bg-emerald-800 focus-visible:!outline-emerald-700"
        >
          Kembali ke katalog
        </a>
      </section>
    );

  return (
    <form
      onSubmit={submit}
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
      noValidate
    >
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-base font-black text-slate-950">
              Informasi produk
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Identitas katalog dan status storefront.
            </p>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-black text-slate-700">
                Nama produk
              </span>
              <Input
                required
                maxLength={160}
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                className="admin-input-flat h-11 border-slate-300 bg-slate-50 text-base shadow-none focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20 md:text-sm"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-black text-slate-700">
                Slug
              </span>
              <Input
                required
                maxLength={180}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                value={slug}
                onChange={(event) => {
                  setSlug(slugify(event.target.value));
                }}
                className="admin-input-flat h-11 border-slate-300 bg-slate-50 font-mono text-base shadow-none focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20 md:text-sm"
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                Huruf kecil, angka, dan tanda hubung.
              </span>
            </label>
            <div className="md:col-span-2">
              <label
                htmlFor="product-image"
                className="mb-1.5 block text-xs font-black text-slate-700"
              >
                Foto produk
              </label>
              <div className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[112px_1fr] sm:items-center">
                <div className="flex aspect-square items-center justify-center overflow-hidden bg-slate-50">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={`Pratinjau ${title || "produk"}`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="px-2 text-center text-[11px] font-bold text-slate-400">
                      Belum ada foto
                    </span>
                  )}
                </div>
                <div>
                  <Input
                    id="product-image"
                    aria-describedby="product-image-hint"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(file);
                      event.target.value = "";
                    }}
                    className="block min-h-11 w-full border-slate-300 bg-slate-50 text-base text-slate-700 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20 file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-emerald-700 file:px-4 file:text-xs file:font-bold file:text-white file:hover:bg-emerald-800 md:text-sm"
                  />
                  <p
                    id="product-image-hint"
                    className="mt-2 text-[11px] leading-5 text-slate-500"
                  >
                    Format WebP (ototmatis dikonversi & dibuang file originalnya). Maksimal 2 MB.
                  </p>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl("")}
                      className="mt-2 min-h-11 text-xs font-black text-rose-700 hover:underline"
                    >
                      Hapus foto dari produk
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-950">
                Varian produk
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Variant ID dibuat otomatis; kelola SKU, harga IDR, dan berat.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setVariants((current) => [
                  ...current,
                  emptyVariant(`new-${nextVariantKey.current++}`),
                ])
              }
              className="btn-secondary min-h-11 px-4 text-xs"
            >
              Tambah varian
            </button>
          </div>
          <div className="space-y-4 p-5">
            {variants.map((variant, index) => (
              <fieldset
                key={variant.key}
                className="rounded-xl border border-slate-200 p-4"
              >
                <legend className="px-2 text-xs font-black text-slate-700">
                  Varian {index + 1}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600">
                        Nama varian
                      </span>
                      <span className={`text-[10px] font-medium ${variant.title.length > 15 ? 'font-bold text-red-600' : 'text-slate-400'}`}>
                        {variant.title.length}/15
                      </span>
                    </div>
                    <Input
                      required
                      maxLength={15}
                      value={variant.title}
                      placeholder="500ml / 1 Liter"
                      onChange={(event) =>
                        updateVariant(index, "title", event.target.value)
                      }
                      className="admin-input-flat h-11 border-slate-300 bg-slate-50 text-base shadow-none focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20 md:text-sm"
                    />
                    <span className="mt-1 block text-[10px] text-slate-400">
                      Maks. 15 karakter (contoh: 500ml, 1 Liter, Beli 2)
                    </span>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold text-slate-600">
                      SKU
                    </span>
                    <Input
                      required
                      maxLength={80}
                      value={variant.sku}
                      onChange={(event) =>
                        updateVariant(
                          index,
                          "sku",
                          event.target.value.toUpperCase(),
                        )
                      }
                      className="admin-input-flat h-11 border-slate-300 bg-slate-50 font-mono text-base uppercase shadow-none focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20 md:text-sm"
                    />
                  </label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <span className="block text-xs font-bold text-slate-600">
                      Variant ID
                    </span>
                    <span className="mt-1 block font-mono text-sm text-slate-700">
                      {variant.id || "Dibuat otomatis saat disimpan"}
                    </span>
                  </div>
                  <label>
                    <span className="mb-1 block text-xs font-bold text-slate-600">
                      Harga (IDR)
                    </span>
                    <Input
                      required
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={variant.price}
                      onChange={(event) =>
                        updateVariant(index, "price", event.target.value)
                      }
                      className="admin-input-flat h-11 border-slate-300 bg-slate-50 text-base shadow-none focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20 md:text-sm"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold text-slate-600">
                      Harga Coret (IDR)
                    </span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={variant.compare_price}
                      onChange={(event) =>
                        updateVariant(
                          index,
                          "compare_price",
                          event.target.value,
                        )
                      }
                      className="admin-input-flat h-11 border-slate-300 bg-slate-50 text-base shadow-none focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20 md:text-sm"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold text-slate-600">
                      Berat (gram)
                    </span>
                    <Input
                      required
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={variant.weight_grams}
                      onChange={(event) =>
                        updateVariant(index, "weight_grams", event.target.value)
                      }
                      className="admin-input-flat h-11 border-slate-300 bg-slate-50 text-base shadow-none focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20 md:text-sm"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={variants.length === 1}
                  onClick={() =>
                    setVariants((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  className="mt-4 inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:text-slate-400"
                >
                  Hapus varian {index + 1}
                </button>
              </fieldset>
            ))}
          </div>
        </section>
      </div>
      <aside className="xl:sticky xl:top-6 xl:self-start">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {imageUrl && (
            <div className="flex aspect-[16/9] items-center justify-center border-b border-slate-100 bg-slate-50 p-4">
              <img
                src={imageUrl}
                alt=""
                className="h-full w-full object-contain"
              />
            </div>
          )}
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Ringkasan
                </p>
                <h2 className="mt-2 break-words text-xl font-black text-slate-950">
                  {title || (editing ? "Produk tanpa nama" : "Produk baru")}
                </h2>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
              >
                {active ? "Aktif" : "Draft"}
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-slate-500">Content ID</dt>
                <dd className="mt-1 font-mono font-black text-slate-900">
                  {productId ? formatContentId(productId) : "Otomatis"}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-slate-500">Varian</dt>
                <dd className="mt-1 font-black text-slate-900">
                  {variants.length}
                </dd>
              </div>
              <div className="col-span-2 rounded-lg bg-slate-50 p-3">
                <dt className="text-slate-500">Slug</dt>
                <dd className="mt-1 break-all font-mono font-bold text-slate-900">
                  {slug || "Belum diisi"}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-slate-500">Kategori</dt>
                <dd className="mt-1 font-black text-slate-900">
                  {category || "Umum"}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-slate-500">Foto</dt>
                <dd className="mt-1 font-black text-slate-900">
                  {imageUrl ? "Tersimpan" : "Belum ada"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              Product ID menjadi <code>content_id</code> untuk tracking Meta
              dan Google.
            </p>
            <button
              type="submit"
              disabled={saving || uploading}
              className="btn-primary mt-6 min-h-11 w-full !bg-emerald-700 px-5 text-xs hover:!bg-emerald-800 focus-visible:!outline-emerald-700"
            >
              {saving ? "Menyimpan…" : "Simpan Produk"}
            </button>
            <a
              href="/admin/products"
              className="btn-secondary mt-2 min-h-11 w-full px-5 text-xs"
            >
              Batal
            </a>
            <p
              className={`mt-4 min-h-5 text-xs font-bold ${statusTone === "error" ? "text-rose-700" : statusTone === "success" ? "text-emerald-700" : "text-slate-500"}`}
              role="status"
              aria-live="polite"
            >
              {status}
            </p>
          </div>
        </section>
      </aside>
    </form>
  );
}
