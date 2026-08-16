import * as React from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import {
  ArrowUpRight,
  ChevronRight,
  LogOut,
  Menu,
  Search,
  UserRound,
} from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import {
  ADMIN_ACCENT,
  getSearchableNavItems,
  getVisibleNavGroups,
  isAdminNavHrefActive,
  profileNavItem,
  type AdminRole,
} from "./admin-navigation";

interface AdminShellProps {
  children: React.ReactNode;
  title: string;
  adminName: string;
  siteName?: string;
  activeMenu: string;
  currentPath: string;
  siteUrl: string;
  adminRole: AdminRole;
}

export function AdminShell({
  children,
  title,
  adminName,
  siteName,
  activeMenu,
  currentPath,
  siteUrl,
  adminRole,
}: AdminShellProps) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(false);
  const groups = getVisibleNavGroups(adminRole);
  const searchItems = getSearchableNavItems(adminRole);
  const allItems = groups.flatMap((group) => group.items);
  const currentItem = [...allItems, profileNavItem].find(
    (item) => item.id === activeMenu,
  );
  const mobilePrimaryIds = adminRole === "advertiser"
    ? ["dashboard", "products", "content", "ads"]
    : adminRole === "customer_service"
      ? ["dashboard", "orders", "shipping", "scoring"]
      : ["dashboard", "orders", "shipping", "products"];
  const mobilePrimary = mobilePrimaryIds
    .map((id) => [...allItems, profileNavItem].find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const menuIsActive = !mobilePrimary.some((item) => item.id === activeMenu);

  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const updateViewport = () => setIsDesktop(media.matches);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    updateViewport();
    media.addEventListener("change", updateViewport);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      media.removeEventListener("change", updateViewport);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const handleSearchOpenChange = (open: boolean) => {
    setSearchOpen(open);
    if (!open) setSearchQuery("");
  };

  const searchContent = (
    <>
      <div className="border-b border-slate-200 bg-slate-50/70 p-2">
        <div className="rounded-lg border border-slate-300 bg-white shadow-sm focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-200">
          <CommandInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            aria-label="Cari halaman admin"
            placeholder="Ketik nama halaman atau tugas…"
            className="h-11"
            autoFocus
          />
        </div>
      </div>
      <CommandList className="max-h-none flex-1 overflow-y-auto px-2 py-2 sm:max-h-[min(55vh,28rem)]">
        <CommandEmpty className="px-4 py-14 text-center">
          <p className="font-bold text-slate-900">Tidak ada halaman yang cocok</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Coba istilah seperti order, resi, gudang, CRM, Meta, atau payment.
          </p>
        </CommandEmpty>
        {Array.from(new Set(searchItems.map((item) => item.group))).map((groupName) => (
          <CommandGroup key={groupName} heading={groupName}>
            {searchItems.filter((item) => item.group === groupName).map((item) => (
              <CommandItem
                key={`${item.href}-${item.label}`}
                value={`${item.label} ${item.description} ${item.keywords} ${item.group}`}
                onSelect={() => {
                  handleSearchOpenChange(false);
                  window.location.assign(item.href);
                }}
                className="min-h-14 px-3 py-2.5"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                  <item.icon className="size-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">{item.label}</span>
                  <span className="block truncate text-[11px] text-slate-500">{item.description}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-300" aria-hidden="true" />
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      <div className="hidden items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-semibold text-slate-500 sm:flex">
        <span>↑↓ Pilih hasil</span>
        <span>Enter untuk buka · Esc untuk tutup</span>
      </div>
    </>
  );

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          adminName={adminName}
          siteName={siteName}
          activeMenu={activeMenu}
          currentPath={currentPath}
          siteUrl={siteUrl}
          adminRole={adminRole}
        />
        <SidebarInset className="min-w-0 bg-transparent">
          <header className="admin-topbar sticky top-0 z-30 flex h-[60px] shrink-0 items-center border-b border-slate-200/80 bg-white/95 px-3 backdrop-blur-xl md:h-[68px] md:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 md:gap-3">
              <SidebarTrigger className="hidden size-9 rounded-lg text-slate-500 hover:bg-slate-100 md:inline-flex" />
              <a href="/admin/dashboard" className="flex size-9 shrink-0 items-center justify-center md:hidden" aria-label={`Dashboard ${adminName}`}>
                <img src="/images/logo.webp" alt="Logo" className="size-8 object-contain" />
              </a>
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-extrabold tracking-[-0.02em] text-slate-950 md:text-base">
                  <span className="md:hidden">{currentItem?.shortLabel ?? currentItem?.label ?? title}</span>
                  <span className="hidden md:inline">{title}</span>
                </h1>
                <p className="hidden truncate text-[11px] font-medium text-slate-500 lg:block">
                  {currentItem?.description ?? "Workspace operasional"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="group mx-4 hidden min-h-10 w-full max-w-lg flex-1 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-left text-sm font-medium text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 md:flex xl:mx-6"
            >
              <Search className="size-4 text-slate-400" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">Cari halaman atau pengaturan</span>
              <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-400">⌘K</kbd>
            </button>

            <div className="flex flex-1 items-center justify-end gap-1.5 md:gap-2">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="grid size-10 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 md:hidden"
                aria-label="Cari halaman admin"
              >
                <Search className="size-[18px]" aria-hidden="true" />
              </button>
              <a href="/" target="_blank" rel="noopener noreferrer" className="hidden min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 xl:inline-flex">
                Lihat storefront <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
              <a
                href="/admin/profile"
                aria-current={activeMenu === "profile" ? "page" : undefined}
                className={`grid size-10 place-items-center rounded-xl border shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
                  activeMenu === "profile"
                    ? "border-blue-600 bg-blue-50 text-blue-600 font-bold"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
                aria-label="Buka profil & integrasi admin"
                title="Profil & Integrasi"
              >
                <UserRound className="size-[18px]" aria-hidden="true" />
              </a>
            </div>
          </header>

          <div id="admin-main" tabIndex={-1} className="admin-main min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-3 sm:px-3 md:px-6 md:pb-8 md:pt-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1560px]">{children}</div>
          </div>

          <nav aria-label="Navigasi utama mobile" className="admin-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="grid h-16 items-stretch" style={{ gridTemplateColumns: `repeat(${mobilePrimary.length + 1}, minmax(0, 1fr))` }}>
              {mobilePrimary.map((item) => {
                const active = activeMenu === item.id;
                return (
                  <a key={item.href} href={item.href} aria-current={isAdminNavHrefActive(currentPath, item.href) ? "page" : undefined} className={`group flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300 ${active ? "text-slate-950" : "text-slate-500"}`}>
                    <span className="relative grid size-8 place-items-center rounded-xl transition-colors" style={active ? { backgroundColor: `${ADMIN_ACCENT}14`, color: ADMIN_ACCENT } : undefined}>
                      <item.icon className="size-[19px]" aria-hidden="true" />
                      {active && <span className="absolute -bottom-1 h-0.5 w-3 rounded-full" style={{ backgroundColor: ADMIN_ACCENT }} aria-hidden="true" />}
                    </span>
                    <span className="w-full truncate text-center">{item.shortLabel ?? item.label}</span>
                  </a>
                );
              })}
              <button type="button" onClick={() => setMenuOpen(true)} aria-current={menuIsActive ? "page" : undefined} className={`flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300 ${menuIsActive ? "text-slate-950" : "text-slate-500"}`} aria-label="Buka semua menu">
                <span className="relative grid size-8 place-items-center rounded-xl" style={menuIsActive ? { backgroundColor: `${ADMIN_ACCENT}14`, color: ADMIN_ACCENT } : undefined}>
                  <Menu className="size-[19px]" aria-hidden="true" />
                  {menuIsActive && <span className="absolute -bottom-1 h-0.5 w-3 rounded-full" style={{ backgroundColor: ADMIN_ACCENT }} aria-hidden="true" />}
                </span>
                <span>Menu</span>
              </button>
            </div>
          </nav>
        </SidebarInset>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="bottom" className="max-h-[86dvh] gap-0 overflow-hidden rounded-t-[1.25rem] border-slate-200 bg-white p-0 md:hidden">
            <SheetHeader className="border-b border-slate-200 px-4 pb-3 pt-4 text-left">
              <SheetTitle className="text-base font-extrabold tracking-tight text-slate-950">Semua menu</SheetTitle>
              <SheetDescription className="text-xs">Pilih workspace yang ingin dikelola.</SheetDescription>
            </SheetHeader>
            <div className="overflow-y-auto overscroll-contain px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
              {groups.map((group) => (
                <section key={group.label} className="mb-3">
                  <h2 className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{group.label}</h2>
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {group.items.map((item) => {
                      const active = activeMenu === item.id;
                      const activeChild = item.children?.find((child) =>
                        isAdminNavHrefActive(currentPath, child.href),
                      );
                      return (
                        <div key={item.id} className="border-b border-slate-100 last:border-b-0">
                          <a href={item.href} aria-current={!activeChild && isAdminNavHrefActive(currentPath, item.href) ? "page" : undefined} className="flex min-h-13 items-center gap-3 px-3 py-2 active:bg-slate-50">
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600" style={active ? { backgroundColor: `${ADMIN_ACCENT}14`, color: ADMIN_ACCENT } : undefined}>
                              <item.icon className="size-4" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-slate-900">{item.label}</span>
                              <span className="block truncate text-[11px] text-slate-500">{item.description}</span>
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-slate-300" aria-hidden="true" />
                          </a>
                          {item.children && item.children.length > 0 && (
                            <div className="bg-slate-50/50 pb-1.5 pl-14 pr-3 pt-0">
                              {item.children.map((child) => {
                                const childActive = isAdminNavHrefActive(
                                  currentPath,
                                  child.href,
                                );
                                return (
                                  <a key={child.href} href={child.href} aria-current={childActive ? "page" : undefined} className={`flex min-h-11 items-center justify-between gap-3 border-t border-slate-100/60 py-1.5 text-sm font-semibold active:bg-slate-100/50 ${childActive ? "text-slate-950" : "text-slate-600"}`}>
                                    <span className="truncate">{child.label}</span>
                                    <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
              <a href={profileNavItem.href} className="mb-2 flex min-h-13 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><profileNavItem.icon className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{profileNavItem.label}</span><span className="block truncate text-[11px] text-slate-500">{profileNavItem.description}</span></span>
                <ChevronRight className="size-4 text-slate-300" aria-hidden="true" />
              </a>
              <form method="POST" action="/api/admin/logout" data-logout-form className="mb-2">
                <button type="submit" className="flex min-h-13 w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-left text-rose-700 active:bg-rose-100">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-rose-100">
                    <LogOut className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">Keluar</span>
                    <span className="block truncate text-[11px] text-rose-600">Akhiri sesi admin di perangkat ini</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-rose-300" aria-hidden="true" />
                </button>
              </form>
            </div>
          </SheetContent>
        </Sheet>

        {isDesktop ? (
          <CommandDialog
            open={searchOpen}
            onOpenChange={handleSearchOpenChange}
            title="Pencarian admin"
            description="Cari halaman dan pengaturan yang tersedia untuk akun ini."
            showCloseButton
          >
            <div className="border-b border-slate-200 px-4 py-3 pr-12">
              <h2 className="text-sm font-extrabold tracking-tight text-slate-950">Pencarian admin</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Cari order, pengiriman, produk, tracking, atau pengaturan.
              </p>
            </div>
            {searchContent}
          </CommandDialog>
        ) : (
          <Sheet open={searchOpen} onOpenChange={handleSearchOpenChange}>
            <SheetContent side="bottom" style={{ height: "min(82dvh, 42rem)" }} className="max-h-[calc(100dvh-env(safe-area-inset-top))] gap-0 overflow-hidden rounded-t-[1.25rem] border-slate-200 bg-white p-0">
              <SheetHeader className="border-b border-slate-200 px-4 pb-3 pt-4 pr-12 text-left">
                <SheetTitle className="text-base font-extrabold tracking-tight text-slate-950">Pencarian admin</SheetTitle>
                <SheetDescription className="text-xs">
                  Cari order, pengiriman, produk, tracking, atau pengaturan.
                </SheetDescription>
              </SheetHeader>
              <Command className="h-auto! min-h-0 flex-1 rounded-none!">
                {searchContent}
              </Command>
            </SheetContent>
          </Sheet>
        )}
        <Toaster position="top-center" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
