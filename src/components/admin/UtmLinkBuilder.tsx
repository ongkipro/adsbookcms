import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildUtmLink, normalizeUtmTag, UTM_MEDIUMS, UTM_SOURCES } from "@/lib/utm-link";

export type UtmLinkPage = { url: string; label: string; kind: "landing" | "product" };

const fieldClass = "flex min-w-0 flex-col gap-1.5";
const labelClass = "text-sm font-medium";
const hintClass = "text-xs text-muted-foreground";

/** PRD A45, REQ-262: compose a tagged link to one of the store's pages. Nothing is stored. */
export function UtmLinkBuilder({ pages }: { pages: UtmLinkPage[] }) {
  const [page, setPage] = useState("");
  const [source, setSource] = useState<string>(UTM_SOURCES[0].value);
  const [medium, setMedium] = useState<string>(UTM_SOURCES[0].medium);
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const result = buildUtmLink({ page, source, medium, campaign, content });
  const groups = [
    { kind: "landing", label: "Landing page" },
    { kind: "product", label: "Halaman produk" },
  ] as const;

  const copy = async () => {
    if (!result.ok) return;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard tidak tersedia di browser ini. Salin link secara manual.");
      await navigator.clipboard.writeText(result.url);
      toast.success("Link UTM disalin.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Link gagal disalin.");
    }
  };

  if (pages.length === 0) {
    return <div className="rounded-lg border border-border bg-card p-4 text-sm">
      <h2 className="text-base font-semibold">Belum ada halaman aktif</h2>
      <p className="mt-2 text-muted-foreground">Aktifkan produk atau landing page dulu, lalu kembali ke sini untuk membuat link.</p>
    </div>;
  }

  return <div className="flex min-w-0 flex-col gap-5">
    <section className="grid min-w-0 grid-cols-1 gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
      <div className={`${fieldClass} md:col-span-2`}>
        <label htmlFor="utm-page" className={labelClass}>Halaman tujuan</label>
        <Select items={Object.fromEntries(pages.map((item) => [item.url, item.label]))} value={page} onValueChange={(value) => setPage(value ?? "")}>
          <SelectTrigger id="utm-page" className="w-full min-w-0"><SelectValue placeholder="Pilih landing page atau produk" /></SelectTrigger>
          <SelectContent>
            {groups.map((group) => {
              const items = pages.filter((item) => item.kind === group.kind);
              return items.length ? <SelectGroup key={group.kind}><SelectLabel>{group.label}</SelectLabel>
                {items.map((item) => <SelectItem key={item.url} value={item.url}>{item.label}</SelectItem>)}
              </SelectGroup> : null;
            })}
          </SelectContent>
        </Select>
      </div>
      <div className={fieldClass}>
        <label htmlFor="utm-source" className={labelClass}>Sumber (utm_source)</label>
        <Select items={Object.fromEntries(UTM_SOURCES.map((item) => [item.value, item.label]))} value={source} onValueChange={(value) => {
          const next = UTM_SOURCES.find((item) => item.value === value);
          if (!next) return;
          setSource(next.value);
          setMedium(next.medium);
        }}>
          <SelectTrigger id="utm-source" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{UTM_SOURCES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className={fieldClass}>
        <label htmlFor="utm-medium" className={labelClass}>Medium (utm_medium)</label>
        <Select items={Object.fromEntries(UTM_MEDIUMS.map((item) => [item.value, item.label]))} value={medium} onValueChange={(value) => setMedium(value ?? medium)}>
          <SelectTrigger id="utm-medium" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{UTM_MEDIUMS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className={hintClass}>Terisi otomatis sesuai sumber; ganti bila perlu.</p>
      </div>
      <div className={fieldClass}>
        <label htmlFor="utm-campaign" className={labelClass}>Nama kampanye (utm_campaign)</label>
        <Input id="utm-campaign" value={campaign} onChange={(event) => setCampaign(event.target.value)} placeholder="Contoh: Promo Oktober Kopi" autoComplete="off" aria-describedby="utm-campaign-hint" />
        <p id="utm-campaign-hint" className={hintClass}>Disimpan sebagai <code className="break-all">{normalizeUtmTag(campaign) || "…"}</code></p>
      </div>
      <div className={fieldClass}>
        <label htmlFor="utm-content" className={labelClass}>Konten iklan (utm_content, opsional)</label>
        <Input id="utm-content" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Contoh: Video A" autoComplete="off" aria-describedby="utm-content-hint" />
        <p id="utm-content-hint" className={hintClass}>Untuk membedakan materi iklan di Analitik › UTM.</p>
      </div>
    </section>

    <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-4" aria-live="polite">
      <h2 id="utm-result-title" className={labelClass}>Link siap pakai</h2>
      {result.ok ? <>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <Input id="utm-result" readOnly value={result.url} onFocus={(event) => event.currentTarget.select()} aria-labelledby="utm-result-title" className="min-w-0 flex-1 font-mono" />
          <Button type="button" onClick={copy}><Copy aria-hidden="true" />Salin link</Button>
        </div>
        <p className={hintClass}>Tempel di URL tujuan iklan atau pesan WhatsApp. Pesanannya akan terbaca di Analitik › UTM.</p>
      </> : <p className="text-sm text-muted-foreground">{result.reason}</p>}
    </section>
  </div>;
}
