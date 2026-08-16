import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
  CheckCircle2,
  Package,
  Eye,
  Code,
  Sparkles,
  Settings,
  Smartphone,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { formatIdr } from "../../lib/format-idr";

type Variant = {
  id: number;
  sku?: string;
  title: string;
  price: number;
  compare_price?: number | null;
};

type Product = {
  id: number | string;
  title: string;
  slug: string;
  category?: string;
  image_url?: string | null;
  is_active?: boolean;
  variants?: Variant[];
};

type FormConfig = {
  mode?: "hybrid" | "middle" | "full";
  selected_variant_id?: string;
  section_title?: string;
  button_text?: string;
};

type Section = {
  id: string;
  type: "html" | "form";
  content_html?: string;
  form_config?: FormConfig;
};

type Props = {
  landingPageId?: string;
};

const SHORTCODES = [
  { code: "{{product_name}}", label: "Nama Produk" },
  { code: "{{product_price}}", label: "Harga Promo" },
  { code: "{{compare_price}}", label: "Harga Coret" },
  { code: "{{discount_percent}}", label: "Diskon %" },
  { code: "{{cs_whatsapp}}", label: "No. WA CS" },
];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function sanitizePreviewHtml(value: string) {
  if (typeof DOMParser === "undefined") return escapeHtml(value);

  const parsedDocument = new DOMParser().parseFromString(value, "text/html");
  parsedDocument
    .querySelectorAll(
      "script, style, template, iframe, object, embed, link, meta, base, form, input, button, select, textarea",
    )
    .forEach((element) => element.remove());

  const allowedTags: Record<string, true> = {
    a: true,
    abbr: true,
    b: true,
    blockquote: true,
    br: true,
    div: true,
    em: true,
    figcaption: true,
    figure: true,
    h1: true,
    h2: true,
    h3: true,
    h4: true,
    h5: true,
    h6: true,
    hr: true,
    i: true,
    img: true,
    li: true,
    ol: true,
    p: true,
    section: true,
    small: true,
    span: true,
    strong: true,
    sub: true,
    sup: true,
    table: true,
    tbody: true,
    td: true,
    th: true,
    thead: true,
    tr: true,
    u: true,
    ul: true,
  };
  const commonAttributes: Record<string, true> = {
    class: true,
    role: true,
    title: true,
  };
  const attributesByTag: Record<string, Record<string, true>> = {
    a: { href: true },
    img: {
      alt: true,
      decoding: true,
      height: true,
      loading: true,
      src: true,
      width: true,
    },
    td: { colspan: true, rowspan: true },
    th: { colspan: true, rowspan: true, scope: true },
  };

  for (const element of Array.from(parsedDocument.body.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();
    if (!allowedTags[tag]) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const allowed =
        commonAttributes[name] ||
        name.startsWith("aria-") ||
        attributesByTag[tag]?.[name];
      if (!allowed) element.removeAttribute(attribute.name);
    }

    if (tag === "a" || tag === "img") {
      const urlAttribute = tag === "a" ? "href" : "src";
      const rawUrl = element.getAttribute(urlAttribute);
      if (rawUrl) {
        try {
          const url = new URL(rawUrl, window.location.href);
          if (!["http:", "https:"].includes(url.protocol)) {
            element.removeAttribute(urlAttribute);
          }
        } catch {
          element.removeAttribute(urlAttribute);
        }
      }
    }

    if (tag === "a" && element.hasAttribute("href")) {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  }

  return parsedDocument.body.innerHTML;
}

// Both preview strips spelled out the reference store's domain, so an operator
// was shown a URL that belongs to someone else's shop. This island is mounted
// `client:only`, so it already runs on the store's own origin — no prop needs
// threading through two pages to say so.
const previewOrigin =
  typeof window === "undefined" ? "" : window.location.origin;

export default function LandingPageEditor({ landingPageId }: Props) {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [productId, setProductId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [sections, setSections] = useState<Section[]>([]);

  // Section editing states inside 480px canvas
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
    if (landingPageId) fetchLandingPage();
  }, [landingPageId]);

  async function fetchProducts() {
    try {
      const res = await fetch("/api/admin/products");
      if (!res.ok) throw new Error("Failed to fetch products");
      const { data } = await res.json();
      setProducts(data || []);
    } catch (err) {
      toast.error("Gagal memuat daftar produk");
    }
  }

  async function fetchLandingPage() {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/landing-pages/${landingPageId}`);
      if (!res.ok) throw new Error("Failed to fetch landing page");
      const { data } = await res.json();

      setTitle(data.title || "");
      setSlug(data.slug || "");
      setProductId(String(data.product_id || ""));
      setIsActive(data.is_active === 1 || data.is_active === true);
      setMetaTitle(data.meta_title || "");
      setMetaDescription(data.meta_description || "");

      if (Array.isArray(data.sections)) {
        setSections(
          data.sections.map((s: { type: "html" | "form"; content_html?: string; form_config?: FormConfig }) => ({
            id: crypto.randomUUID(),
            type: s.type,
            content_html: s.content_html || "",
            form_config: s.form_config || {},
          }))
        );
      }
    } catch (err) {
      toast.error("Gagal memuat data landing page");
    } finally {
      setLoading(false);
    }
  }

  const generateSlug = (val: string) => {
    return val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!landingPageId) {
      setSlug(generateSlug(val));
    }
  };

  const addHtmlSection = () => {
    const newId = crypto.randomUUID();
    setSections([...sections, { id: newId, type: "html", content_html: "" }]);
    setEditingSectionId(newId);
  };

  const addFormSection = () => {
    const newId = crypto.randomUUID();
    setSections([
      ...sections,
      { id: newId, type: "form", form_config: { mode: "hybrid" } },
    ]);
    setEditingSectionId(newId);
  };

  const moveSection = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index > 0) {
      const newSections = [...sections];
      const temp = newSections[index - 1];
      newSections[index - 1] = newSections[index];
      newSections[index] = temp;
      setSections(newSections);
    } else if (direction === "down" && index < sections.length - 1) {
      const newSections = [...sections];
      const temp = newSections[index + 1];
      newSections[index + 1] = newSections[index];
      newSections[index] = temp;
      setSections(newSections);
    }
  };

  const removeSection = (index: number) => {
    const newSections = [...sections];
    newSections.splice(index, 1);
    setSections(newSections);
  };

  const updateSection = (id: string, partial: Partial<Section>) => {
    setSections(sections.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  };

  async function handleSave() {
    if (!title.trim() || !slug.trim() || !productId) {
      return toast.error("Mohon lengkapi Judul, Slug, dan Produk Terkait di panel kiri.");
    }

    try {
      setLoading(true);
      const payload = {
        title: title.trim(),
        slug: slug.trim(),
        product_id: productId,
        is_active: isActive ? 1 : 0,
        meta_title: metaTitle.trim(),
        meta_description: metaDescription.trim(),
        sections: sections.map(({ type, content_html, form_config }) => ({
          type,
          content_html,
          form_config,
        })),
      };

      const url = landingPageId
        ? `/api/admin/landing-pages/${landingPageId}`
        : `/api/admin/landing-pages`;
      const method = landingPageId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const { data, error } = await res.json();
      if (!res.ok) throw new Error(error || "Gagal menyimpan landing page");

      toast.success("Landing page berhasil disimpan!");
      if (!landingPageId && data?.id) {
        window.location.assign(`/admin/landing-pages/${data.id}/edit`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const selectedProduct = products.find((p) => String(p.id) === productId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24 text-slate-900">
      {/* Fixed Top Action Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
            480
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
              {title || (landingPageId ? "Edit Landing Page" : "Buat Landing Page Baru")}
              {isActive ? (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-2 py-0.5">
                  Published
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5">Draft</Badge>
              )}
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {slug ? `${previewOrigin}/${slug}` : "Lengkapi konfigurasi judul & produk di panel kiri"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {slug && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs bg-white border-slate-300"
              onClick={() => window.open(`/${slug}?preview=1`, "_blank")}
            >
              <Eye className="w-4 h-4 mr-1.5 text-slate-600" /> Live Preview
            </Button>
          )}

          <Button
            onClick={handleSave}
            disabled={loading}
            size="sm"
            className="h-9 text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium px-4"
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            {loading ? "Menyimpan..." : "Simpan Landing Page"}
          </Button>
        </div>
      </div>

      {/* Unified 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Metadata & Product Settings */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="bg-slate-50/50 pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-600" />
                Metadata & Produk Catalog
              </CardTitle>
              <CardDescription className="text-xs">
                Hubungkan landing page ini dengan produk katalog D1 dan set URL slug.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* Judul Halaman */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Judul Landing Page <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="Contoh: Promo Spesial Asahan Portable"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="text-xs h-9 bg-white"
                />
              </div>

              {/* URL Slug */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  URL Slug <span className="text-red-500">*</span>
                </label>
                <div className="flex rounded-md shadow-xs">
                  <span className="inline-flex items-center px-2.5 rounded-l-md border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-xs font-mono">
                    /
                  </span>
                  <Input
                    className="rounded-l-none font-mono text-xs h-9 bg-white"
                    placeholder="promo-asahan-portable"
                    value={slug}
                    onChange={(e) => setSlug(generateSlug(e.target.value))}
                  />
                </div>
              </div>

              {/* Product Select Dropdown (Shadcn Select - Unclipped Portal) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-blue-600" />
                  Produk Katalog (D1) <span className="text-red-500">*</span>
                </label>
                <Select
                  value={productId}
                  onValueChange={(value) => {
                    if (value) setProductId(value);
                  }}
                >
                  <SelectTrigger className={`w-full h-11 text-xs bg-white rounded-xl ${!productId ? "border-amber-300 bg-amber-50/30" : "border-slate-300"}`}>
                    <SelectValue placeholder="-- Pilih Produk Katalog (D1) --" />
                  </SelectTrigger>
                  <SelectContent className="max-h-96 w-[var(--anchor-width)] min-w-[340px] sm:min-w-[480px] p-1.5 shadow-2xl rounded-2xl border border-slate-200 bg-white">
                    {products.map((p) => {
                      const prices = p.variants?.map((v) => v.price) || [];
                      const minPrice = prices.length ? Math.min(...prices) : 0;
                      const maxPrice = prices.length ? Math.max(...prices) : 0;
                      const priceLabel =
                        minPrice === 0
                          ? `ID: #${p.id}`
                          : minPrice === maxPrice
                          ? formatIdr(minPrice)
                          : `${formatIdr(minPrice)} - ${formatIdr(maxPrice)}`;

                      return (
                        <SelectItem
                          key={p.id}
                          value={String(p.id)}
                          className="text-xs py-2.5 px-3 border-b border-slate-100/90 last:border-b-0 cursor-pointer focus:bg-slate-100/90 rounded-xl transition-colors my-0.5"
                        >
                          <div className="flex items-start justify-between w-full gap-3 min-w-0 py-0.5">
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              {p.image_url ? (
                                <img
                                  src={p.image_url}
                                  alt=""
                                  className="w-9 h-9 rounded-lg border border-slate-200 object-cover shrink-0 mt-0.5 shadow-2xs"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                                  <Package className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1 text-left">
                                <div
                                  className="font-semibold text-slate-900 leading-snug line-clamp-2 whitespace-normal break-words"
                                  title={p.title}
                                >
                                  {p.title}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 font-normal flex items-center gap-1.5">
                                  {p.category && <span className="capitalize">{p.category}</span>}
                                  {p.category && <span>•</span>}
                                  <span>{p.variants?.length || 0} Varian</span>
                                </div>
                              </div>
                            </div>
                            <span className="shrink-0 font-mono font-extrabold text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg shadow-2xs self-start mt-0.5">
                              {priceLabel}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {selectedProduct && (
                  <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200/90 text-xs flex items-center gap-3 mt-2 shadow-2xs">
                    {selectedProduct.image_url ? (
                      <img
                        src={selectedProduct.image_url}
                        alt={selectedProduct.title}
                        className="w-10 h-10 rounded-lg border border-slate-200 object-cover shrink-0 shadow-2xs"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-200/80 flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 line-clamp-1" title={selectedProduct.title}>
                        {selectedProduct.title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                        <span className="font-mono text-[10px] bg-slate-200/70 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                          /{selectedProduct.slug}
                        </span>
                        <span>•</span>
                        <span>{selectedProduct.variants?.length || 0} Varian Aktif</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Switch */}
              <div className="pt-2 border-t flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-700 block">Status Terbit</span>
                  <span className="text-[11px] text-slate-500">Aktifkan untuk akses publik</span>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </CardContent>
          </Card>

          {/* SEO Metadata Card */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="bg-slate-50/50 pb-3 border-b border-slate-100">
              <CardTitle className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-slate-500" /> SEO & Social Share (Opsional)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-600">Meta Title</label>
                <Input
                  placeholder="Judul SEO Google..."
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  className="text-xs h-8 bg-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-600">Meta Description</label>
                <Textarea
                  placeholder="Deskripsi singkat untuk pencarian Google & WhatsApp preview..."
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  className="text-xs min-h-[60px] bg-white"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: 480px Mobile Canvas Viewport Editor */}
        <div className="lg:col-span-8">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <Smartphone className="w-4 h-4 text-blue-600" />
                WYSIWYG Mobile Canvas (<strong>480px</strong>)
              </span>
              <span className="text-[11px] text-slate-400">100% Canvas Parity</span>
            </div>

            {/* Stable Centered Mobile Device Mockup Frame */}
            <div className="w-full max-w-[480px] mx-auto bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden min-h-[680px] flex flex-col">
              {/* Device Header Bar */}
              <div className="bg-slate-900 px-4 py-2 text-white flex items-center justify-between text-[11px] font-mono">
                <span className="truncate max-w-[300px] text-slate-300">
                  {previewOrigin}/{slug || "preview"}
                </span>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-slate-800 text-slate-200 border-slate-700">
                  480px Storefront
                </Badge>
              </div>

              {/* Sections Canvas Body */}
              <div className="p-3 space-y-3 flex-1 bg-slate-50/60">
                {sections.map((section, index) => {
                  const isEditing = editingSectionId === section.id;

                  return (
                    <div
                      key={section.id}
                      className={`rounded-xl border bg-white shadow-sm transition-all overflow-hidden ${
                        isEditing ? "border-blue-400 ring-4 ring-blue-50" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {/* Section Header */}
                      <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                          <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] flex items-center justify-center font-bold">
                            {index + 1}
                          </span>
                          {section.type === "html" ? (
                            <span className="flex items-center gap-1 text-blue-700">
                              <Code className="w-3.5 h-3.5" /> HTML Content
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-emerald-700">
                              <Sparkles className="w-3.5 h-3.5" /> Native Form COD
                            </span>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => moveSection(index, "up")}
                            disabled={index === 0}
                            className="p-1.5 hover:bg-slate-200/50 rounded-md disabled:opacity-30 text-slate-500 hover:text-slate-900 transition-colors"
                            title="Geser Ke Atas"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSection(index, "down")}
                            disabled={index === sections.length - 1}
                            className="p-1.5 hover:bg-slate-200/50 rounded-md disabled:opacity-30 text-slate-500 hover:text-slate-900 transition-colors"
                            title="Geser Ke Bawah"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSectionId(isEditing ? null : section.id)}
                            className={`p-1.5 rounded-md transition-colors ${
                              isEditing ? "bg-blue-100 text-blue-700" : "hover:bg-slate-200/50 text-slate-500 hover:text-slate-900"
                            }`}
                            title="Edit Section"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSection(index)}
                            className="p-1.5 hover:bg-red-50 rounded-md text-slate-500 hover:text-red-600 transition-colors"
                            title="Hapus Section"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Section Content */}
                      <div className="p-3">
                        {section.type === "html" && (
                          <div className="space-y-2">
                            {isEditing && (
                              <div className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-100">
                                {SHORTCODES.map((item) => (
                                  <button
                                    key={item.code}
                                    type="button"
                                    onClick={() => {
                                      const el = document.getElementById(`html-${section.id}`) as HTMLTextAreaElement;
                                      if (el) {
                                        const start = el.selectionStart;
                                        const end = el.selectionEnd;
                                        const currentVal = section.content_html || "";
                                        const newContent = currentVal.substring(0, start) + item.code + currentVal.substring(end);
                                        updateSection(section.id, { content_html: newContent });
                                      } else {
                                        updateSection(section.id, { content_html: (section.content_html || "") + item.code });
                                      }
                                    }}
                                    className="text-[10px] px-2 py-1 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-md font-mono border border-slate-200 shadow-sm transition-colors cursor-pointer"
                                  >
                                    {item.code}
                                  </button>
                                ))}
                              </div>
                            )}

                            {isEditing ? (
                              <Textarea
                                id={`html-${section.id}`}
                                placeholder="<div class='py-4 text-center'><h2>{{product_name}}</h2></div>"
                                className="font-mono text-[13px] min-h-[160px] bg-slate-900 text-slate-100 p-3 rounded-md border-slate-800 focus:ring-blue-500/20"
                                value={section.content_html || ""}
                                onChange={(e) => updateSection(section.id, { content_html: e.target.value })}
                              />
                            ) : (
                              <div
                                className="text-xs text-slate-800 p-2 rounded bg-slate-50/80 border border-slate-100 min-h-[48px] overflow-hidden"
                                dangerouslySetInnerHTML={{
                                  __html: sanitizePreviewHtml(
                                    (section.content_html || "<span class='text-slate-400 italic'>HTML Section Kosong</span>")
                                      .replace(/\{\{product_name\}\}/g, selectedProduct?.title || "Nama Produk")
                                      .replace(/\{\{product_price\}\}/g, "Rp149.000"),
                                  ),
                                }}
                              />
                            )}
                          </div>
                        )}

                        {section.type === "form" && (
                          <div className="space-y-3">
                            {isEditing ? (
                              <div className="space-y-2 text-xs">
                                <div>
                                  <label className="text-[11px] font-semibold text-slate-600">Layout Mode</label>
                                  <Select
                                    value={section.form_config?.mode || "hybrid"}
                                    onValueChange={(value) => {
                                      if (!value) return;
                                      updateSection(section.id, {
                                        form_config: { ...section.form_config, mode: value },
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs bg-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="hybrid">Hybrid (Accordion Varian Auto-detect)</SelectItem>
                                      <SelectItem value="middle">Middle (Form Ringkas Instant)</SelectItem>
                                      <SelectItem value="full">Full (Form Detail Lengkap)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div>
                                  <label className="text-[11px] font-semibold text-slate-600">Varian Default</label>
                                  <Select
                                    value={section.form_config?.selected_variant_id || "none"}
                                    onValueChange={(value) =>
                                      updateSection(section.id, {
                                        form_config: {
                                          ...section.form_config,
                                          selected_variant_id:
                                            !value || value === "none" ? undefined : value,
                                        },
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs bg-white">
                                      <SelectValue placeholder="Semua varian" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-64 p-1 shadow-lg rounded-xl border border-slate-200">
                                      <SelectItem value="none" className="text-xs py-2 px-3 font-medium text-slate-700">
                                        Semua Varian Tersedia
                                      </SelectItem>
                                      {selectedProduct?.variants?.map((v) => (
                                        <SelectItem
                                          key={v.id}
                                          value={String(v.id)}
                                          className="text-xs py-2 px-3 border-b border-slate-100/80 last:border-b-0 cursor-pointer focus:bg-slate-100/90 rounded-lg transition-colors my-0.5"
                                        >
                                          <div className="flex items-start justify-between w-full gap-3 min-w-0">
                                            <span className="font-medium text-slate-900 line-clamp-2 whitespace-normal break-words leading-snug">{v.title}</span>
                                            <span className="shrink-0 font-mono font-bold text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md self-start">
                                              {formatIdr(v.price)}
                                            </span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <div>
                                    <span className="font-semibold">Native Form Checkout COD</span>
                                    <div className="text-[10px] text-emerald-700">
                                      Mode: {section.form_config?.mode || "hybrid"} • Anchor: #checkout-form
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {sections.length === 0 && (
                  <div className="text-center py-20 border border-dashed rounded-xl bg-white space-y-2">
                    <Package className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-500 font-medium">Canvas Halaman Masih Kosong</p>
                    <p className="text-[11px] text-slate-400">Klik tombol di bawah untuk menambah section</p>
                  </div>
                )}
              </div>

              {/* Add Section Buttons */}
              <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addHtmlSection}
                  className="h-8 text-xs bg-white border-slate-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Plus className="w-3.5 h-3.5 mr-1 text-blue-600" /> + HTML Section
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addFormSection}
                  className="h-8 text-xs bg-white border-slate-300 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  <Plus className="w-3.5 h-3.5 mr-1 text-emerald-600" /> + Form COD
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
