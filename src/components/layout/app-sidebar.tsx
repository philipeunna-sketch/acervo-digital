"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { NAV_ITEMS, APP_NAME } from "@/components/layout/nav-items";
import { useUploadQueue } from "@/features/uploads/upload-provider";
import { Boxes } from "lucide-react";

interface AppSidebarProps {
  onNavigate?: () => void;
  className?: string;
}

export function AppSidebar({ onNavigate, className }: AppSidebarProps): React.JSX.Element {
  const pathname = usePathname();
  const { activeCount } = useUploadQueue();

  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
      )}
      aria-label="Navegacao principal"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Boxes className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge === "uploads" && activeCount > 0 ? (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      {activeCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border px-5 py-4 text-[11px] text-muted-foreground">
        <p>Acervo Digital</p>
        <p className="text-muted-foreground/70">Armazenamento privado com URLs assinadas</p>
      </div>
    </aside>
  );
}
