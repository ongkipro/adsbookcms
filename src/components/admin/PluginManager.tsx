import { useEffect, useState } from "react";
import { Puzzle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { useConfirm } from "./useConfirm";

type PluginItem = {
  id: string;
  name: string;
  description: string;
  settings_href: string;
  installed: boolean;
  enabled: boolean;
};

type Action = "activate" | "deactivate" | "uninstall";

/**
 * /admin/settings/plugins (ADR-028): every compiled-in plugin and its state on
 * this store. Only the owner changes it; the API enforces the same rule.
 */
export function PluginManager({ mayManage }: { mayManage: boolean }) {
  const [plugins, setPlugins] = useState<PluginItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    fetch("/api/admin/plugins", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.error || "Gagal memuat daftar plugin.");
        setPlugins(payload.data.plugins);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Gagal memuat daftar plugin."));
  }, []);

  const act = async (plugin: PluginItem, action: Action) => {
    if (action === "uninstall" && !(await confirm({
      title: `Hapus data ${plugin.name}?`,
      description: "Tabel dan pengaturan plugin ini dihapus dari toko. Order tetap utuh. Tindakan ini tidak bisa dibatalkan.",
      confirmLabel: "Hapus data",
    }))) return;
    setPendingId(plugin.id);
    try {
      const response = await fetch("/api/admin/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plugin.id, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Gagal mengubah plugin.");
      setPlugins(payload.data.plugins);
      toast.success(payload.message || "Plugin diperbarui.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengubah plugin.");
    } finally {
      setPendingId(null);
    }
  };

  if (loadError) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800" role="alert">{loadError}</div>;
  }
  if (!plugins) {
    return (
      <div className="h-40 animate-pulse rounded-xl bg-slate-100" role="status" aria-busy="true">
        <span className="sr-only">Memuat daftar plugin.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
        {plugins.map((plugin) => {
          const busy = pendingId === plugin.id;
          return (
            <li key={plugin.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-500" aria-hidden="true">
                  <Puzzle className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-950">
                    {plugin.name}
                    <Badge variant={plugin.enabled ? "default" : "secondary"}>
                      {plugin.enabled ? "Aktif" : plugin.installed ? "Nonaktif" : "Belum dipasang"}
                    </Badge>
                  </p>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{plugin.description}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
                {plugin.enabled ? (
                  <>
                    <a href={plugin.settings_href} className={buttonVariants({ variant: "default" })}>Pengaturan</a>
                    <Button variant="outline" disabled={!mayManage || busy} onClick={() => void act(plugin, "deactivate")}>
                      {busy ? "Memproses…" : "Nonaktifkan"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button disabled={!mayManage || busy} onClick={() => void act(plugin, "activate")}>
                      {busy ? "Memproses…" : plugin.installed ? "Aktifkan lagi" : "Pasang & aktifkan"}
                    </Button>
                    {plugin.installed && (
                      <Button variant="outline" disabled={!mayManage || busy} onClick={() => void act(plugin, "uninstall")}>
                        Hapus data
                      </Button>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!mayManage && <p className="text-xs font-semibold text-slate-500">Hanya owner yang dapat memasang, menonaktifkan, atau menghapus plugin.</p>}
      {confirmDialog}
    </div>
  );
}
