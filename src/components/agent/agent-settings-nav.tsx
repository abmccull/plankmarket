"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Settings, BarChart3 } from "lucide-react";

const NAV_ITEMS = [
  {
    label: "Settings",
    href: "/settings/agent",
    icon: Settings,
  },
  {
    label: "Value Dashboard",
    href: "/settings/agent/dashboard",
    icon: BarChart3,
  },
] as const;

export function AgentSettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Agent settings navigation" className="flex gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
