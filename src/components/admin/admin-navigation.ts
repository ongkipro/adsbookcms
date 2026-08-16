import type { LucideIcon } from "lucide-react";
import type { AdminRole } from "../../lib/auth";
export type { AdminRole } from "../../lib/auth";
import {
  BadgeDollarSign,
  Boxes,
  CircleUserRound,
  ClipboardCheck,
  CodeXml,
  CreditCard,
  FilePenLine,
  LayoutDashboard,
  Megaphone,
  Package,
  Settings,
  ShoppingBag,
  Truck,
  UserX,
  Warehouse,
} from "lucide-react";


/** Stable AdsBookCMS visual identity. Storefront tenant theming must not alter admin UI. */
export const ADMIN_ACCENT = "#2563eb";

export type AdminNavItem = {
  id: string;
  href: string;
  label: string;
  shortLabel?: string;
  description: string;
  icon: LucideIcon;
  keywords: string;
  children?: Array<{ href: string; label: string; icon?: LucideIcon }>;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export const adminNavGroups: AdminNavGroup[] = [
  {
    label: "Commerce",
    items: [
      {
        id: "dashboard",
        href: "/admin/dashboard",
        label: "Dashboard",
        description: "Snapshot performa toko",
        icon: LayoutDashboard,
        keywords: "dashboard ringkasan omzet performa",
      },
      {
        id: "orders",
        href: "/admin/orders",
        label: "Order Management",
        shortLabel: "Order",
        description: "Validasi dan proses pesanan",
        icon: ShoppingBag,
        keywords: "orders pesanan transaksi pelanggan terbengkalai abandoned leads",
        children: [
          { href: "/admin/orders?status=abandoned", label: "Pesanan Terbengkalai", icon: UserX },
        ],
      },
      {
        id: "shipping",
        href: "/admin/shipping",
        label: "Pengiriman",
        description: "Dispatch, pickup, dan resi",
        icon: Truck,
        keywords: "shipping pengiriman mengantar pickup resi",
      },
      {
        id: "products",
        href: "/admin/products",
        label: "Katalog",
        description: "Produk, varian, dan landing page",
        icon: Package,
        keywords: "products produk katalog varian stock landing pages",
        children: [
          { href: "/admin/landing-pages", label: "Landing Pages", icon: FilePenLine },
        ],
      },
      {
        id: "content",
        href: "/admin/content",
        label: "Konten Storefront",
        shortLabel: "Konten",
        description: "Copy dan aset toko",
        icon: FilePenLine,
        keywords: "content storefront ai draft publish media",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        id: "expeditions",
        href: "/admin/expeditions",
        label: "Ekspedisi",
        description: "Kurir dan service aktif",
        icon: Boxes,
        keywords: "expedition kurir service rule",
      },
      {
        id: "scoring",
        href: "/admin/check",
        label: "Cek WA & Ongkir",
        description: "Validasi pelanggan dan tarif",
        icon: ClipboardCheck,
        keywords: "check scoring whatsapp ongkir tarif",
      },
    ],
  },
  {
    label: "Growth",
    items: [
      {
        id: "ads",
        href: "/admin/ads",
        label: "Ads & Tracking",
        description: "Signal dan attribution",
        icon: Megaphone,
        keywords: "ads pixel capi google tracking conversion",
        children: [
          { href: "/admin/ads/meta", label: "Meta Pixel & CAPI" },
          { href: "/admin/ads/google", label: "Google Ads" },
        ],
      },
    ],
  },
  {
    label: "Finance & System",
    items: [
      {
        id: "payments",
        href: "/admin/payments",
        label: "Payment AutoLaris",
        shortLabel: "Payment",
        description: "Channel dan rekonsiliasi",
        icon: CreditCard,
        keywords: "payments autolaris bank virtual account qris saldo",
        children: [
          { href: "/admin/balance", label: "Rekonsiliasi", icon: BadgeDollarSign },
        ],
      },
      {
        id: "settings",
        href: "/admin/settings",
        label: "Pengaturan",
        description: "Store, gudang, dan akses",
        icon: Settings,
        keywords: "settings system store warehouse crm access headless developer api",
        children: [
          { href: "/admin/settings/store", label: "Store & CS", icon: ShoppingBag },
          { href: "/admin/settings/developer", label: "Headless API", icon: CodeXml },
          { href: "/admin/settings/warehouse", label: "Gudang", icon: Warehouse },
          { href: "/admin/settings/crm", label: "CRM Templates", icon: FilePenLine },
          { href: "/admin/settings/access", label: "Akses Pengguna", icon: CircleUserRound },
        ],
      },
    ],
  },
];

export const profileNavItem: AdminNavItem = {
  id: "profile",
  href: "/admin/profile",
  label: "Profil & Integrasi",
  shortLabel: "Profil",
  description: "Akun, keamanan, dan API",
  icon: CircleUserRound,
  keywords: "profile akun password mengantar autolaris api domain",
};

export function isAdminNavHrefActive(currentPath: string, href: string) {
  const base = "https://admin.local";
  const current = new URL(currentPath, base);
  const target = new URL(href, base);
  if (current.pathname !== target.pathname) return false;
  for (const [key, value] of target.searchParams) {
    if (current.searchParams.get(key) !== value) return false;
  }
  return true;
}

export function getVisibleNavGroups(role: AdminRole) {
  if (role === "owner") return adminNavGroups;
  const visibleIds = role === "admin"
    ? new Set(adminNavGroups.flatMap((group) => group.items.map((item) => item.id)))
    : role === "advertiser"
      ? new Set(["dashboard", "products", "content", "ads"])
      : new Set(["dashboard", "orders", "shipping", "scoring"]);
  return adminNavGroups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => visibleIds.has(item.id))
        .map((item) => role === "admin" && item.id === "settings"
          ? {
              ...item,
              children: item.children?.filter(
                (child) => child.href !== "/admin/settings/access",
              ),
            }
          : item),
    }))
    .filter((group) => group.items.length > 0);
}

export function getSearchableNavItems(role: AdminRole) {
  const groups = getVisibleNavGroups(role);
  return [
    ...groups.flatMap((group) =>
      group.items.flatMap((item) => [
        { ...item, group: group.label },
        ...(item.children ?? []).map((child) => ({
          ...item,
          href: child.href,
          label: child.label,
          description: item.label,
          icon: child.icon ?? item.icon,
          group: group.label,
        })),
      ]),
    ),
    { ...profileNavItem, group: "Account" },
  ];
}
