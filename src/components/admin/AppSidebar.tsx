import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight, LogOut } from "lucide-react";
import {
  ADMIN_ACCENT,
  getVisibleNavGroups,
  isAdminNavHrefActive,
  type AdminRole,
} from "./admin-navigation";
import { CMS_VERSION } from "@/lib/version";

export function AppSidebar({
  activeMenu,
  currentPath,
  siteUrl = "",
  adminName,
  siteName,
  adminRole,
}: {
  activeMenu: string;
  currentPath: string;
  siteUrl?: string;
  adminName: string;
  siteName?: string;
  adminRole: AdminRole;
}) {
  const rawName = siteName || adminName;
  const storeName = rawName
    .replace(/\s+preview\s+ops$/i, "")
    .replace(/\s+preview$/i, "")
    .replace(/\s+ops$/i, "")
    .replace(/\s+dashboard$/i, "")
    .replace(/\s+cms$/i, "")
    .trim();
  const displayDomain = siteUrl.replace(/^https?:\/\//, "") || "adsbook.internal";
  const groups = getVisibleNavGroups(adminRole);
  const [openItem, setOpenItem] = React.useState<string | null>(activeMenu);
  const itemRefs = React.useRef(new Map<string, HTMLDivElement>());

  React.useEffect(() => {
    if (!openItem) return;
    const frame = requestAnimationFrame(() => {
      itemRefs.current.get(openItem)?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [openItem]);

  React.useEffect(() => {
    if (activeMenu) {
      setOpenItem(activeMenu);
    }
  }, [activeMenu]);

  const toggleItem = (id: string, open: boolean) => {
    setOpenItem(open ? id : null);
  };

  return (
    <Sidebar variant="sidebar" collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-3 pb-2 pt-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={`${storeName} Dashboard`} className="h-14 rounded-xl px-2 hover:bg-sidebar-accent">
              <a href="/admin/dashboard" aria-label={`Buka dashboard ${storeName}`}>
                <img
                  src="/images/logo.webp"
                  alt="CMS Logo"
                  className="size-9 shrink-0 object-contain"
                />
                <span className="grid-cols-1 grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-extrabold tracking-tight text-sidebar-foreground">{storeName}</span>
                  <span className="truncate text-[10px] font-medium text-slate-500">{displayDomain}</span>
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="py-2">
            <SidebarGroupLabel className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = activeMenu === item.id;
                const children = item.children ?? [];
                const itemStyle = active
                  ? {
                      backgroundColor: `${ADMIN_ACCENT}12`,
                      color: ADMIN_ACCENT,
                    }
                  : undefined;

                if (children.length > 0) {
                  const hasActiveChild = children.some((child) =>
                    isAdminNavHrefActive(currentPath, child.href),
                  );
                  const isOverviewActive =
                    !hasActiveChild && isAdminNavHrefActive(currentPath, item.href);
                  return (
                    <Collapsible
                      key={item.id}
                      ref={(node) => {
                        if (node) itemRefs.current.set(item.id, node);
                        else itemRefs.current.delete(item.id);
                      }}
                      open={openItem === item.id}
                      onOpenChange={(open) => toggleItem(item.id, open)}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger
                          render={
                            <SidebarMenuButton
                              tooltip={item.label}
                              isActive={active}
                              className="h-10 rounded-lg px-2.5 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950 data-[active=true]:font-bold"
                              style={itemStyle}
                            />
                          }
                        >
                          <item.icon className="size-[17px]" aria-hidden="true" />
                          <span>{item.label}</span>
                          <ChevronRight className="ml-auto size-3.5 text-slate-400 transition-transform duration-150 group-data-[state=open]/collapsible:rotate-90" aria-hidden="true" />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub className="mr-0 border-slate-200 py-1">
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={isOverviewActive}>
                                <a href={item.href}>
                                  {item.id === "orders" ? "Semua Order" : item.id === "products" ? "Semua Produk" : "Overview"}
                                </a>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            {children.map((child) => {
                              const isChildActive = isAdminNavHrefActive(
                                currentPath,
                                child.href,
                              );
                              return (
                                <SidebarMenuSubItem key={child.href}>
                                  <SidebarMenuSubButton asChild isActive={isChildActive}>
                                    <a
                                      href={child.href}
                                      aria-current={isChildActive ? "page" : undefined}
                                    >
                                      {child.label}
                                    </a>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className="h-10 rounded-lg px-2.5 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950 data-[active=true]:font-bold"
                      style={itemStyle}
                    >
                      <a href={item.href}>
                        <item.icon className="size-[17px]" aria-hidden="true" />
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-slate-200/70 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <form method="POST" action="/api/admin/logout" data-logout-form>
              <SidebarMenuButton asChild tooltip="Keluar dari sistem" className="h-10 text-slate-500 hover:bg-rose-50 hover:text-rose-700">
                <button type="submit" className="w-full justify-start font-semibold">
                  <LogOut className="size-[17px]" aria-hidden="true" />
                  <span>Keluar</span>
                </button>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50/80 px-2.5 py-1.5 text-[11px] font-medium text-slate-500 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-slate-700">CMS Core</span>
          </div>
          <span className="rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600">
            v{CMS_VERSION.version}
          </span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
