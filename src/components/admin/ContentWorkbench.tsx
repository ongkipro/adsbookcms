import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const pretty = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

type Target = { key: string; label: string };
type ContentRecord = {
  content_key: string;
  version: number;
  generated_by: string;
  updated_at: string;
  published_at: string | null;
  draft: unknown;
  published: unknown;
};

type IndexData = {
  instructionsConfigured: boolean;
  canManageInstructions: boolean;
  targets: Target[];
};

export function ContentWorkbench() {
  const [index, setIndex] = useState<IndexData | null>(null);
  const [selectedKey, setSelectedKey] = useState("home");
  const [record, setRecord] = useState<ContentRecord | null>(null);
  const [editor, setEditor] = useState("{}");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");

  const loadRecord = async (key: string) => {
    const response = await fetch(`/api/admin/content?key=${encodeURIComponent(key)}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Konten gagal dimuat.");
    }
    const next = (payload.data || null) as ContentRecord | null;
    setRecord(next);
    setEditor(pretty(next?.draft ?? next?.published ?? {}));
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/content", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Workbench konten gagal dimuat.");
        }
        setIndex(payload.data as IndexData);
        await loadRecord("home");
      })
      .catch((error) => {
        if (!(error instanceof Error && error.name === "AbortError")) {
          toast.error(error instanceof Error ? error.message : "Workbench konten gagal dimuat.");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const selectTarget = async (key: string) => {
    setSelectedKey(key);
    setLoading(true);
    try {
      await loadRecord(key);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Konten gagal dimuat.");
    } finally {
      setLoading(false);
    }
  };

  const mutate = async (action: "save-draft" | "generate" | "publish") => {
    setSaving(true);
    try {
      let content: unknown;
      if (action === "save-draft") {
        try {
          content = JSON.parse(editor);
        } catch {
          throw new Error("Draft harus berupa JSON yang valid.");
        }
      }
      const response = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, key: selectedKey, content }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Aksi konten gagal.");
      }
      await loadRecord(selectedKey);
      toast.success(
        action === "publish"
          ? "Konten diterbitkan."
          : action === "generate"
            ? "Draft Workers AI berhasil dibuat."
            : "Draft disimpan.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aksi konten gagal.");
    } finally {
      setSaving(false);
    }
  };

  const saveInstructions = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-instructions", instructions }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Instruksi AI gagal disimpan.");
      }
      setIndex((current) =>
        current ? { ...current, instructionsConfigured: true } : current,
      );
      setInstructions("");
      toast.success("Instruksi tenant tersimpan tanpa ditampilkan kembali.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Instruksi AI gagal disimpan.");
    } finally {
      setSaving(false);
    }
  };

  const uploadMedia = async (event: {
    preventDefault: () => void;
    currentTarget: HTMLFormElement;
  }) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setUploading(true);
    try {
      const response = await fetch("/api/admin/media", {
        method: "POST",
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Media gagal diunggah.");
      }
      setMediaUrl(String(payload.data?.url || ""));
      event.currentTarget.reset();
      toast.success("Media tenant tersimpan di R2.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Media gagal diunggah.");
    } finally {
      setUploading(false);
    }
  };

  if (loading && !index) {
    return <div className="h-96 rounded-xl bg-slate-100" aria-label="Memuat workbench konten" />;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle as="h3" className="text-base font-black">Draft Storefront</CardTitle>
          <p className="text-xs leading-5 text-slate-500">
            D1 adalah source of truth. Generate membuat draft; publish adalah aksi terpisah.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <label className="grid-cols-1 grid gap-2 text-xs font-bold text-slate-700">
            Target konten
            <select
              value={selectedKey}
              onChange={(event) => void selectTarget(event.target.value)}
              disabled={loading || saving}
              className="admin-input-flat h-11 bg-white text-sm"
            >
              {(index?.targets || []).map((target) => (
                <option key={target.key} value={target.key}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
            <span>Versi {record?.version || 0}</span>
            <span>·</span>
            <span>{record?.generated_by || "belum ada draft"}</span>
            {record?.published_at && <span>· Published {record.published_at}</span>}
          </div>
          <label className="grid-cols-1 grid gap-2 text-xs font-bold text-slate-700">
            Draft JSON
            <textarea
              value={editor}
              onChange={(event) => setEditor(event.target.value)}
              spellCheck={false}
              className="admin-input-flat min-h-[30rem] resize-y bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button type="button" variant="outline" disabled={saving} onClick={() => void mutate("generate")}>
              Generate Workers AI
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => void mutate("save-draft")}>
              Simpan Draft
            </Button>
            <Button type="button" disabled={saving || !record?.draft} onClick={() => void mutate("publish")}>
              Publish Draft
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-sm font-black">Batas Operasional</CardTitle>
          </CardHeader>
          <CardContent className="text-xs leading-6 text-slate-600">
            AI hanya mengubah copy dan media reference. Harga, stok, SKU, variant ID, domain,
            provider, dan tracking tetap berasal dari D1/config operator.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-sm font-black">Media Tenant</CardTitle>
            <p className="text-xs leading-5 text-slate-500">
              Upload gambar ke R2 tenant, lalu gunakan URL hasilnya pada field image di draft JSON.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={uploadMedia} className="space-y-3">
              <input
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                required
                className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-bold"
              />
              <Button type="submit" variant="outline" disabled={uploading} className="w-full">
                {uploading ? "Mengunggah..." : "Upload ke R2"}
              </Button>
            </form>
            {mediaUrl && (
              <div className="space-y-2">
                <input readOnly value={mediaUrl} className="admin-input-flat bg-slate-50 font-mono text-xs" />
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => void navigator.clipboard.writeText(mediaUrl)}
                >
                  Salin URL Media
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        {index?.canManageInstructions && (
          <Card>
            <CardHeader>
              <CardTitle as="h3" className="text-sm font-black">Instruksi Tenant</CardTitle>
              <p className="text-xs leading-5 text-slate-500">
                Guardrail dasar berasal dari repository. Isian ini hanya menambah aturan tenant dan tidak pernah ditampilkan kembali.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs font-bold text-slate-600">
                Status: {index.instructionsConfigured ? "sudah dikonfigurasi" : "menggunakan guardrail repository"}
              </p>
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                minLength={20}
                maxLength={8000}
                rows={8}
                placeholder="Tambahkan tone, istilah, dan batas klaim khusus tenant..."
                className="admin-input-flat resize-y bg-white text-sm"
              />
              <Button
                type="button"
                className="w-full"
                disabled={saving || instructions.trim().length < 20}
                onClick={() => void saveInstructions()}
              >
                Simpan Instruksi Tenant
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
