"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { UnreadBadge } from "@/components/messaging/unread-badge";
import { cn } from "@/lib/utils";
import {
  getActiveNavigationHref,
  type WorkspaceNavGroup,
} from "@/lib/workspace-navigation";

interface WorkspaceNavLinksProps {
  groups: WorkspaceNavGroup[];
  pathname: string;
  unreadCount?: number;
  label?: string;
  onNavigate?: () => void;
}

export function WorkspaceNavLinks({
  groups,
  pathname,
  unreadCount,
  label = "Workspace navigation",
  onNavigate,
}: WorkspaceNavLinksProps) {
  const id = useId();
  const activeHref = getActiveNavigationHref(pathname, groups);
  return (
    <nav aria-label={label} className="space-y-3">
      {groups.map((group) => {
        const isActiveGroup = group.items.some(
          (item) => item.href === activeHref,
        );
        const links = (
          <ul className="space-y-1">
            {group.items.map((item) => {
              const count =
                item.href === "/messages" && unreadCount && unreadCount > 0
                  ? unreadCount
                  : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onNavigate={onNavigate}
                    aria-current={activeHref === item.href ? "page" : undefined}
                    aria-label={
                      count
                        ? `${item.title}, ${count} unread messages`
                        : undefined
                    }
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      activeHref === item.href
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                    )}
                  >
                    <item.icon
                      className="h-4 w-4 shrink-0"
                      aria-hidden={true}
                    />
                    <span className="min-w-0">{item.title}</span>
                    {item.badge && (
                      <Badge
                        variant="outline"
                        className="ml-auto shrink-0 border-amber-300 bg-amber-50 text-[10px] text-amber-800"
                      >
                        Pro
                      </Badge>
                    )}
                    {count > 0 && (
                      <span className="ml-auto shrink-0" aria-hidden="true">
                        <UnreadBadge count={count} />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        );
        return group.secondary ? (
          <details
            key={group.id + ":" + (isActiveGroup ? activeHref : "")}
            open={isActiveGroup}
            className="group/nav border-t pt-1"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
              <span>{group.title}</span>
              <ChevronDown
                className="h-4 w-4 shrink-0 transition-transform group-open/nav:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="pb-2 pt-1">{links}</div>
          </details>
        ) : (
          <section key={group.id} aria-labelledby={id + "-" + group.id}>
            <h2
              id={id + "-" + group.id}
              className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground"
            >
              {group.title}
            </h2>
            {links}
          </section>
        );
      })}
    </nav>
  );
}
