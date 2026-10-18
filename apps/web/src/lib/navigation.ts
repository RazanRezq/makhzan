import {
  ChartNoAxesCombined,
  ClipboardList,
  House,
  Layers3,
  Package,
  Settings2,
  ShoppingBag,
  Truck,
  Warehouse,
} from "lucide-react";

export const navigationItems = [
  { key: "overview", icon: House, href: "/", group: "workspace" },
  { key: "products", icon: Package, href: "/products", group: "workspace" },
  { key: "inventory", icon: Layers3, href: null, group: "workspace" },
  { key: "purchases", icon: ClipboardList, href: null, group: "workspace" },
  { key: "sales", icon: ShoppingBag, href: null, group: "workspace" },
  { key: "warehouses", icon: Warehouse, href: null, group: "manage" },
  { key: "suppliers", icon: Truck, href: null, group: "manage" },
  { key: "reports", icon: ChartNoAxesCombined, href: null, group: "manage" },
  { key: "settings", icon: Settings2, href: null, group: "manage" },
] as const;
