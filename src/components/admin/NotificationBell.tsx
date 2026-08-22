import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, PackagePlus, UserPlus, Wallet } from "lucide-react";

type NotificationType = "order" | "lead" | "payment";

type NotificationItem = {
  id: number;
  type: NotificationType;
  order_number: string;
  title: string;
  body: string;
  created_at: string;
  href: string;
  unread: boolean;
};

const POLL_MS = 30_000;
/** Which events this browser has already raised a toast for (REQ-152). */
const SHOWN_KEY = "adsbookcms:notified:v1";
/** Set once the operator has been asked for notification permission. */
const PERMISSION_ASKED_KEY = "adsbookcms:notify-asked:v1";

const ICONS: Record<NotificationType, typeof Bell> = {
  order: PackagePlus,
  lead: UserPlus,
  payment: Wallet,
};

function readShown(): number[] {
  try {
    const raw = window.localStorage.getItem(SHOWN_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "number") : [];
  } catch {
    // A browser with storage disabled still gets the in-app list; it just
    // cannot remember what it already announced.
    return [];
  }
}

function rememberShown(ids: number[]) {
  try {
    // Bounded: only recent ids matter, and this must never grow without limit.
    window.localStorage.setItem(SHOWN_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    /* storage unavailable — announcing twice is better than failing */
  }
}

function relativeTime(iso: string) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

export function NotificationBell() {
  const [unread, setUnread] = React.useState(0);
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const announce = React.useCallback((list: NotificationItem[]) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      return;
    }
    const shown = new Set(readShown());
    const fresh = list.filter((item) => item.unread && !shown.has(item.id));
    // Newest last so the most recent notification is the one left on screen.
    for (const item of fresh.slice(0, 5).reverse()) {
      try {
        new Notification(item.title, { body: item.body, tag: `adsbook-${item.id}` });
      } catch {
        /* the browser refused it; the in-app list still has it */
      }
      shown.add(item.id);
    }
    if (fresh.length) rememberShown([...shown]);
  }, []);

  const load = React.useCallback(
    async (withList: boolean) => {
      try {
        const response = await fetch(
          `/api/admin/notifications${withList ? "" : "?count_only=true"}`,
          { headers: { Accept: "application/json" }, cache: "no-store" },
        );
        // 403 is the advertiser role, not a fault: hide the bell and stop.
        if (response.status === 403) return "forbidden" as const;
        if (!response.ok) throw new Error("notifications unavailable");
        const payload = (await response.json()) as {
          unread?: number;
          notifications?: NotificationItem[];
        };
        setUnread(Number(payload.unread || 0));
        if (payload.notifications) {
          setItems(payload.notifications);
          announce(payload.notifications);
        }
        setFailed(false);
        return "ok" as const;
      } catch {
        setFailed(true);
        return "error" as const;
      }
    },
    [announce],
  );

  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const tick = async () => {
      // Polling, not SSE: an open stream would pin a Worker isolate per tab.
      const result = await load(true);
      // Also checked on every poll, not just at mount: a role downgraded
      // mid-session would otherwise keep polling a 403 forever.
      if (active && result === "forbidden") setHidden(true);
    };
    void tick();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [load]);

  // Asked once per browser, not on every open. A dismissed prompt leaves
  // permission at "default", so re-requesting each time would nag the operator
  // until the browser auto-blocks the origin outright.
  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    try {
      if (window.localStorage.getItem(PERMISSION_ASKED_KEY)) return;
      window.localStorage.setItem(PERMISSION_ASKED_KEY, "1");
    } catch {
      // Storage unavailable: ask anyway rather than never asking.
    }
    await Notification.requestPermission();
  };

  const handleOpenChange = async (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setLoading(true);
    await requestPermission();
    await load(true);
    setLoading(false);
  };

  const mutate = async (body: Record<string, unknown>) => {
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("update failed");
      setUnread(Number(((await response.json()) as { unread?: number }).unread || 0));
    } catch {
      setFailed(true);
    }
  };

  const markAllRead = async () => {
    setItems((current) => current.map((item) => ({ ...item, unread: false })));
    await mutate({ action: "read-all" });
  };

  const openItem = async (item: NotificationItem) => {
    if (item.unread) {
      setItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, unread: false } : row)),
      );
      await mutate({ action: "read", id: item.id });
    }
    window.location.assign(item.href);
  };

  if (hidden) return null;

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          aria-label={
            unread > 0 ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi"
          }
        >
          <Bell className="size-[18px]" aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-5 text-white">
              {badge}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(22rem,calc(100vw-1.5rem))] p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
          <p className="text-xs font-bold text-slate-900">Notifikasi</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="rounded-lg px-2 py-1 text-[11px] font-bold text-blue-600 transition hover:bg-blue-50"
            >
              Tandai semua dibaca
            </button>
          )}
        </div>
        <div className="max-h-[min(26rem,60vh)] overflow-y-auto overscroll-contain">
          {loading && items.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-slate-500">Memuat…</p>
          )}
          {!loading && failed && items.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-slate-500">
              Notifikasi gagal dimuat. Coba buka lagi sebentar.
            </p>
          )}
          {!loading && !failed && items.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-slate-500">
              Belum ada order, lead, atau pembayaran baru.
            </p>
          )}
          {items.map((item) => {
            const Icon = ICONS[item.type] ?? Bell;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openItem(item)}
                className={`flex w-full items-start gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-slate-50 ${
                  item.unread ? "bg-blue-50/40" : ""
                }`}
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-900">
                      {item.title}
                    </span>
                    {item.unread && (
                      <span className="size-1.5 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-600">
                    {item.body}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-medium text-slate-400">
                    {relativeTime(item.created_at)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
