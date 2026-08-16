import { useEffect, useState, type SubmitEvent } from "react";
import { Check, Copy, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type DeveloperApiKey = {
  id: number;
  name: string;
  key_preview: string;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  active: boolean;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
};

type KeyListData = { keys: DeveloperApiKey[] };
type KeyCreationData = { key: DeveloperApiKey; secret: string };

const DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  return (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Belum digunakan";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : DATE_FORMATTER.format(date);
}

export function HeadlessApiManagement() {
  const [keys, setKeys] = useState<DeveloperApiKey[]>([]);
  const [name, setName] = useState("");
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/admin/settings/developer", {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const payload = await readEnvelope<KeyListData>(response);
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error || "Daftar API key gagal dimuat.");
        }
        if (!cancelled) setKeys(payload.data.keys);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Daftar API key gagal dimuat.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const createKey = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setGeneratedSecret(null);
    setCopied(false);

    try {
      const response = await fetch("/api/admin/settings/developer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await readEnvelope<KeyCreationData>(response);
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "API key gagal dibuat.");
      }

      const creation = payload.data;
      setKeys((current) => [creation.key, ...current]);
      setGeneratedSecret(creation.secret);
      setName("");
      toast.success(payload.message || "API key berhasil dibuat.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "API key gagal dibuat.");
    } finally {
      setCreating(false);
    }
  };

  const copySecret = async () => {
    if (!generatedSecret) return;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard tidak tersedia di browser ini.");
      await navigator.clipboard.writeText(generatedSecret);
      setCopied(true);
      toast.success("API key disalin ke clipboard.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "API key gagal disalin.");
    }
  };

  const revokeKey = async (key: DeveloperApiKey) => {
    if (!window.confirm(`Cabut API key “${key.name}”? Integrasi yang memakainya akan langsung berhenti.`)) {
      return;
    }

    setRevokingId(key.id);
    try {
      const response = await fetch("/api/admin/settings/developer", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: key.id }),
      });
      const payload = await readEnvelope<Record<string, never>>(response);
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "API key gagal dicabut.");
      }
      setKeys((current) => current.filter((item) => item.id !== key.id));
      toast.success(payload.message || "API key berhasil dicabut.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "API key gagal dicabut.");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle as="h3" className="flex items-center gap-2 text-base font-black">
                <KeyRound className="size-4 text-blue-600" aria-hidden="true" />
                API Key Aktif
              </CardTitle>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Gunakan key server-side untuk integrasi privat. Secret lengkap hanya ditampilkan saat dibuat.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {keys.length} aktif
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3" role="status" aria-label="Memuat API key">
              <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
            </div>
          ) : keys.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
              <KeyRound className="mx-auto size-7 text-slate-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-black text-slate-800">Belum ada API key aktif</p>
              <p className="mt-1 text-xs text-slate-500">Buat key pertama untuk menghubungkan backend eksternal.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Nama</th>
                    <th scope="col" className="px-4 py-3">Key</th>
                    <th scope="col" className="px-4 py-3">Dibuat</th>
                    <th scope="col" className="px-4 py-3">Terakhir digunakan</th>
                    <th scope="col" className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {keys.map((key) => (
                    <tr key={key.id} className="bg-white">
                      <td className="px-4 py-3">
                        <p className="font-black text-slate-900">{key.name}</p>
                        <span className="mt-1 inline-flex items-center gap-1.5 font-bold text-emerald-700">
                          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                          Aktif
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{key.key_preview}</td>
                      <td className="px-4 py-3 text-slate-600">
                        <span className="block">{formatTimestamp(key.created_at)}</span>
                        <span className="mt-0.5 block text-[10px]">oleh {key.created_by}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatTimestamp(key.last_used_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={revokingId !== null}
                          onClick={() => void revokeKey(key)}
                          className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                          aria-label={`Cabut API key ${key.name}`}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          {revokingId === key.id ? "Mencabut…" : "Cabut"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h3" className="text-sm font-black">Buat API Key Instan</CardTitle>
          <p className="text-xs leading-5 text-slate-500">Beri nama sesuai aplikasi atau lingkungan pemakai.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={createKey} className="space-y-3">
            <label className="grid-cols-1 grid gap-2 text-xs font-bold text-slate-700">
              Nama key
              <Input
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Contoh: Storefront Production"
                autoComplete="off"
              />
            </label>
            <Button type="submit" disabled={creating} className="w-full">
              <KeyRound className="size-4" aria-hidden="true" />
              {creating ? "Membuat…" : "Generate API Key"}
            </Button>
          </form>

          {generatedSecret && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3" role="status" aria-live="polite">
              <p className="text-xs font-black text-amber-900">Salin sekarang — key tidak akan ditampilkan lagi.</p>
              <div className="mt-2 flex gap-2">
                <Input
                  readOnly
                  value={generatedSecret}
                  className="min-w-0 bg-white font-mono text-[11px]"
                  aria-label="API key baru"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => void copySecret()}
                  className={copied ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "bg-white"}
                  aria-label={copied ? "API key sudah disalin" : "Salin API key"}
                >
                  {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                </Button>
              </div>
              <p className="mt-2 min-h-4 text-[11px] font-bold text-emerald-700">{copied ? "Tersalin ke clipboard." : ""}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
