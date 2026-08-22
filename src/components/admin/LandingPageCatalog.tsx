import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Input } from "../ui/input";
import { Button, buttonVariants } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type LandingPageRow = {
  id: string;
  slug: string;
  title: string;
  product_id: string;
  product_title?: string | null;
  is_active: number | boolean;
  /** 1 when this page serves `/produk/<product-slug>` instead of its own slug. */
  is_product_page?: number | boolean;
  product_slug?: string | null;
  created_at: string;
  updated_at?: string;
};

export default function LandingPageCatalog() {
  const [pages, setPages] = useState<LandingPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "native" | "static" | "manual" | "ai" | "injected">("all");
  const [pageToDelete, setPageToDelete] = useState<LandingPageRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [duplicatingPageId, setDuplicatingPageId] = useState<string | null>(
    null
  );
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [productPagePageId, setProductPagePageId] = useState<string | null>(
    null
  );

  useEffect(() => {
    fetchPages();
  }, []);

  async function fetchPages() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/landing-pages");
      if (!res.ok) throw new Error("Failed to fetch landing pages");
      const { data } = await res.json();
      setPages(data || []);
    } catch (err) {
      toast.error("Gagal memuat katalog landing page");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!pageToDelete) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/admin/landing-pages/${pageToDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success(`Landing page "${pageToDelete.title}" berhasil dihapus`);
      setPages((prev) => prev.filter((p) => p.id !== pageToDelete.id));
    } catch (err) {
      toast.error("Gagal menghapus landing page");
    } finally {
      setIsDeleting(false);
      setPageToDelete(null);
    }
  }

  async function handleToggleProductPage(page: LandingPageRow) {
    if (productPagePageId || page.id.startsWith("static:")) return;
    const claim = !Number(page.is_product_page);

    setProductPagePageId(page.id);
    try {
      const response = await fetch("/api/admin/landing-pages", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "set-product-page",
          id: page.id,
          is_product_page: claim,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        data?: LandingPageRow;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Status halaman produk gagal diubah.");
      }
      // Only one landing page may hold a product's page, so releasing the
      // claim locally on every other page for the same product keeps the list
      // honest without a refetch.
      setPages((current) =>
        current.map((row) =>
          row.id === page.id
            ? { ...row, is_product_page: claim ? 1 : 0 }
            : row.product_id === page.product_id && claim
              ? { ...row, is_product_page: 0 }
              : row,
        ),
      );
      toast.success(payload.message || "Status halaman produk diperbarui.");
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : "Status halaman produk gagal diubah.",
      );
    } finally {
      setProductPagePageId(null);
    }
  }

  async function handleDuplicate(source: LandingPageRow) {
    if (duplicatingPageId || source.id.startsWith("static:")) return;

    setDuplicatingPageId(source.id);
    try {
      const response = await fetch("/api/admin/landing-pages", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "duplicate", id: source.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        data?: LandingPageRow;
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Landing page gagal diduplikasi.");
      }

      const duplicatedPage: LandingPageRow = {
        ...payload.data,
        product_title: payload.data.product_title ?? source.product_title,
      };
      setPages((current) => [duplicatedPage, ...current]);
      toast.success(
        payload.message ||
          `Landing page berhasil diduplikasi sebagai /${duplicatedPage.slug}`
      );
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : "Landing page gagal diduplikasi."
      );
    } finally {
      setDuplicatingPageId(null);
    }
  }

  /**
   * The address a page actually answers on, or null when it cannot be known.
   *
   * A claimed page lives at its product's URL, and `listLandingPages` swallows
   * a products-table read failure — so `product_slug` can be missing. Falling
   * back to the landing slug there would hand the operator an address that
   * merely redirects, which is the exact thing this helper exists to prevent,
   * and it would do so silently.
   */
  function publicPathOf(page: LandingPageRow): string | null {
    if (!Number(page.is_product_page)) return `/${page.slug}`;
    return page.product_slug ? `/produk/${page.product_slug}` : null;
  }

  function handleCopyLink(page: LandingPageRow) {
    const path = publicPathOf(page);
    if (!path) {
      toast.error(
        "URL produk untuk halaman ini belum bisa dibaca. Muat ulang daftar dulu.",
      );
      return;
    }
    navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setCopiedSlug(page.slug);
    toast.success("URL Landing Page disalin ke clipboard!");
    setTimeout(() => setCopiedSlug(null), 2000);
  }

  /** Content lives in a deployed file, so the CMS may record but not edit it. */
  function isFileBacked(page: LandingPageRow) {
    return page.id.startsWith("static:") || page.id.startsWith("native:");
  }

  function getSourceType(id: string, slug: string, title: string) {
    if (id.startsWith("native:")) {
      return {
        type: "native",
        label: "Native Astro",
        color: "bg-sky-50 text-sky-700 border-sky-200",
      };
    }
    if (id.startsWith("static:")) {
      return { type: "static", label: "Static Astro", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }
    const s = slug.toLowerCase();
    const t = title.toLowerCase();
    if (s.includes("ai-") || t.includes("ai") || t.includes("prompt")) {
      return { type: "ai", label: "AI Generated", color: "bg-purple-50 text-purple-700 border-purple-200" };
    }
    if (s.includes("ext-") || s.includes("inject") || t.includes("external") || t.includes("import")) {
      return { type: "injected", label: "External Injected", color: "bg-amber-50 text-amber-800 border-amber-200" };
    }
    return { type: "manual", label: "CMS Manual", color: "bg-blue-50 text-blue-700 border-blue-200" };
  }

  const filtered = pages.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase()) ||
      (p.product_title && p.product_title.toLowerCase().includes(search.toLowerCase()));

    const isActive = Boolean(p.is_active);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "published" && isActive) ||
      (statusFilter === "draft" && !isActive);

    const src = getSourceType(p.id, p.slug, p.title).type;
    const matchesSource = sourceFilter === "all" || sourceFilter === src;

    return matchesSearch && matchesStatus && matchesSource;
  });

  const itemsPerPage = 20;
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sourceFilter]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const publishedCount = pages.filter((p) => Boolean(p.is_active)).length;
  const draftCount = pages.length - publishedCount;

  return (
    <div className="space-y-4">
      {/* Control Bar & Filter Header */}
      <div className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" aria-hidden="true" />
            <Input
              type="search"
              placeholder="Cari judul, slug, atau produk..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 shadow-xs focus-visible:border-slate-300 focus-visible:ring-1 focus-visible:ring-slate-300"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-md hover:bg-slate-100"
                aria-label="Hapus kata kunci pencarian"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <a
              href="/admin/landing-pages/new"
              className={`${buttonVariants({ variant: "default" })} h-9 text-xs font-medium shrink-0 bg-blue-600 hover:bg-blue-700 text-white`}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Buat Landing Page
            </a>
          </div>
        </div>

        {/* Filter Sub-bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          {/* Status Tabs Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              aria-pressed={statusFilter === "all"}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                statusFilter === "all"
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Semua
              <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-700">
                {pages.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("published")}
              aria-pressed={statusFilter === "published"}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                statusFilter === "published"
                  ? "bg-white text-emerald-700 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Published
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] tabular-nums text-emerald-800">
                {publishedCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("draft")}
              aria-pressed={statusFilter === "draft"}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                statusFilter === "draft"
                  ? "bg-white text-amber-700 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Draft
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] tabular-nums text-amber-800">
                {draftCount}
              </span>
            </button>
          </div>

          {/* Source Tabs Filter */}
          <div className="flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-1 text-[11px] font-medium sm:w-auto">
            <span className="px-2 text-slate-400 font-bold uppercase text-[9px]">Sumber:</span>
            <button
              type="button"
              onClick={() => setSourceFilter("all")}
              className={`px-2 py-0.5 rounded transition-all ${
                sourceFilter === "all" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("manual")}
              className={`px-2 py-0.5 rounded transition-all ${
                sourceFilter === "manual" ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              CMS Manual
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("native")}
              className={`px-2 py-0.5 rounded transition-all ${
                sourceFilter === "native" ? "bg-white text-sky-700 shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Native Astro
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("static")}
              className={`px-2 py-0.5 rounded transition-all ${
                sourceFilter === "static" ? "bg-white text-emerald-700 shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Static Astro
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("ai")}
              className={`px-2 py-0.5 rounded transition-all ${
                sourceFilter === "ai" ? "bg-white text-purple-700 shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              AI Generated
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("injected")}
              className={`px-2 py-0.5 rounded transition-all ${
                sourceFilter === "injected" ? "bg-white text-amber-700 shadow-xs font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Injected / External
            </button>
          </div>
        </div>
      </div>

      {/* Main Catalog Card */}
      <Card className="border border-slate-200 shadow-xs overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-xs font-medium">Memuat katalog landing page...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center">
              {search || statusFilter !== "all" || sourceFilter !== "all" ? (
                <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-2">
                  <Search className="w-8 h-8 text-slate-300 stroke-[1.5]" />
                  <p className="text-sm font-medium text-slate-800">Tidak ada landing page yang cocok</p>
                  <p className="text-xs text-slate-500">
                    Coba ubah kata kunci pencarian atau filter status yang dipilih.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("all");
                      setSourceFilter("all");
                    }}
                    className="mt-2 min-h-11 text-xs"
                  >
                    Reset Filter
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-3 py-4">
                  <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Globe className="w-6 h-6 stroke-[1.5]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Belum ada Landing Page</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs">
                      Buat landing page native pertama Anda untuk mempromosikan produk katalog secara efektif.
                    </p>
                  </div>
                  <a
                    href="/admin/landing-pages/new"
                    className={cn(
                      buttonVariants({ variant: "default" }),
                      "min-h-11 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white mt-1"
                    )}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Buat Landing Page Baru
                  </a>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Mobile landing page card list.
                  grid-cols-1 is load-bearing: it expands to minmax(0, 1fr). Without an
                  explicit column the implicit track is sized `auto`, whose minimum is the
                  card's min-content — driven by the truncated (white-space: nowrap) slug —
                  so the track grows past the viewport while the Card's overflow-hidden
                  clips it, putting the action row physically off-screen. Every unbounded
                  string below (slug, product id, title) is additionally constrained by
                  min-w-0 + truncate / break-all so the card's own min-content stays inside
                  the track. Do not rely on either half alone. */}
              <div
                className="grid grid-cols-1 gap-3 p-4 lg:hidden"
                aria-label="Daftar landing page mobile"
              >
                {paginated.map((page) => {
                  const isActive = Boolean(page.is_active);
                  const isStatic = isFileBacked(page);
                  const srcBadge = getSourceType(page.id, page.slug, page.title);

                  return (
                    <article
                      key={page.id}
                      className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
                    >
                      {/* Title + status — desktop columns 1 and 4 */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
                          <a
                            href={isStatic ? `/${page.slug}` : `/admin/landing-pages/${page.id}/edit`}
                            className="line-clamp-2 break-words hover:text-blue-600 transition-colors"
                          >
                            {page.title}
                          </a>
                        </h3>
                        {isActive ? (
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Published
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Draft
                          </span>
                        )}
                      </div>

                      {/* Slug + salin link — desktop column 1 */}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate rounded bg-slate-100 px-1.5 py-1 font-mono text-[11px] text-slate-500">
                          /{page.slug}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(page)}
                          title="Salin URL lengkap"
                          aria-label={`Salin URL /${page.slug}`}
                          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
                        >
                          {copiedSlug === page.slug ? (
                            <Check className="size-4 text-emerald-600" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </button>
                      </div>

                      {/* Sumber + produk — desktop columns 2 and 3 */}
                      <dl className="mt-3 space-y-2 rounded-lg bg-slate-50/80 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-[10px] font-semibold uppercase text-slate-500">
                            Tipe Sumber
                          </dt>
                          <dd>
                            <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${srcBadge.color}`}>
                              {srcBadge.label}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-semibold uppercase text-slate-500">
                            Produk Terkait
                          </dt>
                          <dd className="mt-0.5 break-words text-xs font-medium text-slate-800">
                            {page.product_title || (isStatic ? "Static Landing Page" : "Unknown Product")}
                          </dd>
                          {page.product_id && (
                            <dd className="mt-1 break-all font-mono text-[10px] text-slate-500">
                              ID: {page.product_id}
                            </dd>
                          )}
                        </div>
                      </dl>

                      {/* Aksi — desktop column 5, every action reachable without scrolling */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <a
                          href={`/${page.slug}?preview=1`}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            buttonVariants({ variant: "outline" }),
                            "min-h-11 flex-1 text-xs font-semibold"
                          )}
                          title="Preview Live"
                        >
                          <ExternalLink className="size-3.5" />
                          Preview
                        </a>
                        {!isStatic && (
                          <a
                            href={`/admin/landing-pages/${page.id}/edit`}
                            className={cn(
                              buttonVariants({ variant: "outline" }),
                              "min-h-11 flex-1 text-xs font-semibold"
                            )}
                            title="Edit Builder"
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </a>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="min-h-11 min-w-11 shrink-0 text-slate-500"
                              aria-label={`Aksi lain untuk ${page.title}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem asChild>
                              <a href={`/${page.slug}?preview=1`} target="_blank" rel="noreferrer">
                                <ExternalLink className="w-3.5 h-3.5 mr-2 text-slate-500" />
                                Preview Live
                              </a>
                            </DropdownMenuItem>
                            {!isStatic && (
                              <DropdownMenuItem asChild>
                                <a href={`/admin/landing-pages/${page.id}/edit`}>
                                  <Pencil className="w-3.5 h-3.5 mr-2 text-slate-500" />
                                  Edit Layout
                                </a>
                              </DropdownMenuItem>
                            )}
                            {!page.id.startsWith("static:") && (
                              <DropdownMenuItem
                                disabled={productPagePageId === page.id}
                                onClick={() => handleToggleProductPage(page)}
                              >
                                <Package className="w-3.5 h-3.5 mr-2 text-slate-500" />
                                {Number(page.is_product_page)
                                  ? "Lepas dari halaman produk"
                                  : "Jadikan halaman produk"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleCopyLink(page)}>
                              <Copy className="w-3.5 h-3.5 mr-2 text-slate-500" />
                              Salin Link
                            </DropdownMenuItem>
                            {!isStatic && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                  onClick={() => setPageToDelete(page)}
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                                  Hapus Landing Page
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {!isStatic && (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-2 min-h-11 w-full gap-1.5 text-xs font-semibold"
                          disabled={duplicatingPageId !== null}
                          aria-busy={duplicatingPageId === page.id}
                          aria-label={`Duplikasi Page ${page.title}`}
                          onClick={() => void handleDuplicate(page)}
                          title="Duplikasi landing page"
                        >
                          {duplicatingPageId === page.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                          {duplicatingPageId === page.id ? "Menduplikasi..." : "Duplikasi Page"}
                        </Button>
                      )}
                    </article>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block" aria-label="Tabel landing page desktop">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold text-slate-700">Landing Page & Slug</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700">Tipe Sumber</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700">Produk Terkait</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700 text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((page) => {
                        const isActive = Boolean(page.is_active);
                        const isStatic = isFileBacked(page);
                        const srcBadge = getSourceType(page.id, page.slug, page.title);

                        return (
                          <TableRow key={page.id} className="hover:bg-slate-50/60 transition-colors">
                            {/* Title & Slug */}
                            <TableCell className="py-3">
                              <div className="flex flex-col">
                                <a
                                  href={isStatic ? `/${page.slug}` : `/admin/landing-pages/${page.id}/edit`}
                                  className="font-semibold text-sm text-slate-900 hover:text-blue-600 transition-colors line-clamp-1"
                                >
                                  {page.title}
                                </a>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                    /{page.slug}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyLink(page)}
                                    title="Salin URL lengkap"
                                    className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
                                  >
                                    {copiedSlug === page.slug ? (
                                      <Check className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </TableCell>

                            {/* Source Badge */}
                            <TableCell className="py-3">
                              <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${srcBadge.color}`}>
                                {srcBadge.label}
                              </span>
                            </TableCell>

                            {/* Product */}
                            <TableCell className="py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-slate-800">
                                  {page.product_title || (isStatic ? "Static Landing Page" : "Unknown Product")}
                                </span>
                                {page.product_id && (
                                  <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                    ID: {page.product_id}
                                  </span>
                                )}
                              </div>
                            </TableCell>

                            {/* Status */}
                            <TableCell className="py-3">
                              {isActive ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Published
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  Draft
                                </span>
                              )}
                            </TableCell>

                            {/* Quick Actions */}
                            <TableCell className="py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <a
                                  href={`/${page.slug}?preview=1`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`${buttonVariants({ variant: "ghost", size: "icon" })} w-8 h-8 text-slate-500 hover:text-slate-900`}
                                  title="Preview Live"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                                {!isStatic && (
                                  <a
                                    href={`/admin/landing-pages/${page.id}/edit`}
                                    className={`${buttonVariants({ variant: "ghost", size: "icon" })} w-8 h-8 text-slate-500 hover:text-slate-900`}
                                    title="Edit Builder"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                {!isStatic && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 px-2 text-[11px] font-semibold"
                                    disabled={duplicatingPageId !== null}
                                    aria-busy={duplicatingPageId === page.id}
                                    aria-label={`Duplikasi Page ${page.title}`}
                                    onClick={() => void handleDuplicate(page)}
                                    title="Duplikasi landing page"
                                  >
                                    {duplicatingPageId === page.id ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                      <Copy className="size-3.5" />
                                    )}
                                    <span className="hidden xl:inline">
                                      {duplicatingPageId === page.id
                                        ? "Menduplikasi..."
                                        : "Duplikasi Page"}
                                    </span>
                                  </Button>
                                )}

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="w-8 h-8 text-slate-500 hover:text-slate-900">
                                      <MoreHorizontal className="w-3.5 h-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-44">
                                    <DropdownMenuItem asChild>
                                      <a href={`/${page.slug}?preview=1`} target="_blank" rel="noreferrer">
                                        <ExternalLink className="w-3.5 h-3.5 mr-2 text-slate-500" />
                                        Preview Live
                                      </a>
                                    </DropdownMenuItem>
                                    {!isStatic && (
                                      <DropdownMenuItem asChild>
                                        <a href={`/admin/landing-pages/${page.id}/edit`}>
                                          <Pencil className="w-3.5 h-3.5 mr-2 text-slate-500" />
                                          Edit Layout
                                        </a>
                                      </DropdownMenuItem>
                                    )}
                                    {!page.id.startsWith("static:") && (
                                      <DropdownMenuItem
                                        disabled={productPagePageId === page.id}
                                        onClick={() => handleToggleProductPage(page)}
                                      >
                                        <Package className="w-3.5 h-3.5 mr-2 text-slate-500" />
                                        {Number(page.is_product_page)
                                          ? "Lepas dari halaman produk"
                                          : "Jadikan halaman produk"}
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => handleCopyLink(page)}>
                                      <Copy className="w-3.5 h-3.5 mr-2 text-slate-500" />
                                      Salin Link
                                    </DropdownMenuItem>
                                    {!isStatic && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                          onClick={() => setPageToDelete(page)}
                                        >
                                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                                          Hapus Landing Page
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border border-slate-200 bg-white rounded-xl px-5 py-3.5 shadow-xs">
          <p className="text-xs text-slate-500 font-medium">
            Menampilkan <span className="font-bold text-slate-900">{(page - 1) * itemsPerPage + 1}</span>–
            <span className="font-bold text-slate-900">{Math.min(page * itemsPerPage, filtered.length)}</span> dari{" "}
            <span className="font-bold text-slate-900">{filtered.length}</span> landing page
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-3 text-xs bg-white"
            >
              Sebelumnya
            </Button>
            <div className="flex items-center gap-1 px-2 text-xs font-bold text-slate-700">
              Halaman {page} dari {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-3 text-xs bg-white"
            >
              Selanjutnya
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={!!pageToDelete} onOpenChange={(open) => !open && setPageToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-600" />
              Hapus Landing Page
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              Apakah Anda yakin ingin menghapus landing page ini? URL publik tidak dapat diakses lagi setelah dihapus.
            </DialogDescription>
          </DialogHeader>

          {pageToDelete && (
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1 my-1">
              <div className="font-semibold text-slate-900">{pageToDelete.title}</div>
              <div className="text-slate-500 font-mono">/{pageToDelete.slug}</div>
              {pageToDelete.product_title && (
                <div className="text-slate-600 pt-1 border-t border-slate-200/80">
                  Produk: <span className="font-medium text-slate-800">{pageToDelete.product_title}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageToDelete(null)}
              disabled={isDeleting}
              className="text-xs"
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-xs bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Menghapus..." : "Ya, Hapus Landing Page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
