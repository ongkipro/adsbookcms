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
} from "@/components/ui/sidebar";
import { ChevronRight, LogOut } from "lucide-react";
import {
  ADMIN_ACCENT,
  getVisibleNavGroups,
  isAdminNavHrefActive,
  profileNavItem,
  type AdminRole,
} from "./admin-navigation";
import { CMS_VERSION } from "@/lib/version";

// A store that has not set its own logo gets the product's neutral mark,
// never another store's wordmark. /images/logo.webp was the demo store's,
// and it was hardcoded here, so every install wore it. Same defect as
// LOGIN-10, one surface over.
const PRODUCT_MARK = "/images/adsbook-mark.webp";

export function AppSidebar({
  activeMenu,
  currentPath,
  siteUrl = "",
  adminName,
  siteName,
  siteLogo,
  adminRole,
  restricted = false,
}: {
  activeMenu: string;
  currentPath: string;
  siteUrl?: string;
  adminName: string;
  siteName?: string;
  siteLogo?: string;
  adminRole: AdminRole;
  restricted?: boolean;
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
  const groups = restricted ? [] : getVisibleNavGroups(adminRole);

  return (
    <Sidebar variant="sidebar" collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-3 pb-2 pt-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={`${storeName} Dashboard`} className="h-14 rounded-xl px-2 hover:bg-sidebar-accent">
              <a href={restricted ? profileNavItem.href : "/admin/dashboard"} aria-label={restricted ? "Buka keamanan akun" : `Buka dashboard ${storeName}`}>
                <img
                  src={siteLogo || PRODUCT_MARK}
                  alt={storeName}
                  className="size-9 shrink-0 object-contain"
                />
                <span className="grid-cols-1 grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">{storeName}</span>
                  <span className="truncate text-[10px] text-slate-500">{displayDomain}</span>
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {restricted && (
          <SidebarGroup className="py-1">
            <SidebarGroupLabel className="mb-0.5 h-6 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
              Keamanan akun
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive tooltip={profileNavItem.label} className="h-9 rounded-lg px-2.5 font-medium group-data-[collapsible=icon]:size-10!" style={{ backgroundColor: `${ADMIN_ACCENT}12`, color: ADMIN_ACCENT }}>
                  <a href={profileNavItem.href} aria-current="page">
                    <profileNavItem.icon className="size-[17px]" aria-hidden="true" />
                    <span>{profileNavItem.label}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className="mb-0.5 h-6 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = activeMenu === item.id;
                const children = item.children ?? [];
                const activeChild = children.find((child) =>
                  isAdminNavHrefActive(currentPath, child.href),
                );
                const overviewActive = !activeChild && isAdminNavHrefActive(currentPath, item.href);
                const itemStyle = active
                  ? {
                      backgroundColor: `${ADMIN_ACCENT}12`,
                      color: ADMIN_ACCENT,
                    }
                  : undefined;

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={children.length > 0 ? `${item.label} · memiliki submenu` : item.label}
                      className="relative h-9 rounded-lg px-2.5 font-normal text-slate-600 hover:bg-slate-100 hover:text-slate-950 data-[active=true]:font-medium group-data-[collapsible=icon]:size-10!"
                      style={itemStyle}
                    >
                      <a
                        href={item.href}
                        aria-current={overviewActive ? "page" : undefined}
                      >
                        <item.icon className="size-[17px]" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                          {children.length > 0 && <span className="sr-only"> · memiliki submenu</span>}
                        </span>
                        {children.length > 0 && (
                          <ChevronRight
                            className={`ml-auto size-3.5 shrink-0 group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:right-0.5 group-data-[collapsible=icon]:top-0.5 group-data-[collapsible=icon]:size-2.5 ${active ? "rotate-90" : ""}`}
                            aria-hidden="true"
                          />
                        )}
                      </a>
                    </SidebarMenuButton>
                    {active && children.length > 0 && (
                      <SidebarMenuSub className="mr-0 gap-0.5 border-slate-200/90 py-1">
                        {children.map((child) => {
                          const childActive = isAdminNavHrefActive(currentPath, child.href);

                          return (
                            <SidebarMenuSubItem key={child.href}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={childActive}
                                className="h-8 rounded-md px-2 text-xs font-normal text-slate-500 hover:bg-slate-100 hover:text-slate-950 data-[active=true]:font-medium data-[active=true]:text-blue-700"
                              >
                                <a
                                  href={child.href}
                                  aria-current={childActive ? "page" : undefined}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`size-1.5 shrink-0 rounded-full ${childActive ? "bg-blue-600" : "bg-slate-300"}`}
                                  />
                                  <span>{child.label}</span>
                                </a>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    )}
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
                <button type="submit" className="w-full justify-start font-normal">
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
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
            </span>
            <span className="font-medium text-slate-700">CMS Core</span>
          </div>
          <span className="rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600">
            v{CMS_VERSION.version}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
