"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  List,
  Package,
  ShieldCheck,
  MessageSquare,
  Settings,
  Megaphone,
  Scale,
} from "lucide-react";

interface SidebarItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const adminItems: SidebarItem[] = [
  { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { title: "Finance", href: "/admin/finance", icon: TrendingUp },
  { title: "Users", href: "/admin/users", icon: Users },
  { title: "Listings", href: "/admin/listings", icon: List },
  { title: "Orders", href: "/admin/orders", icon: Package },
  { title: "Disputes", href: "/admin/disputes", icon: Scale },
  { title: "Verifications", href: "/admin/verifications", icon: ShieldCheck },
  { title: "Promotions", href: "/admin/promotions", icon: Megaphone },
  { title: "Feedback", href: "/admin/feedback", icon: MessageSquare },
  { title: "Settings", href: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 flex-col border-r bg-sidebar min-h-[calc(100vh-4rem)]">
      <div className="flex flex-col gap-1 p-4">
        <div className="mb-4 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-white">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Admin Panel</h2>
              <p className="text-xs text-muted-foreground">Platform management</p>
            </div>
          </div>
        </div>
        {adminItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-9",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
