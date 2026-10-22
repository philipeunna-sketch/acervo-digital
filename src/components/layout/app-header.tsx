"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { GlobalSearch } from "@/components/layout/global-search";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { UploadButton } from "@/features/uploads/upload-button";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import type { AuthUser } from "@/lib/auth/types";

export function AppHeader({ user }: { user: AuthUser }): React.JSX.Element {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6 lg:px-8">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
            <Menu className="h-5 w-5" aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Menu de navegacao</SheetTitle>
          <AppSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="hidden min-w-0 items-center gap-2 md:flex">
        {current ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{current.label}</p>
            <p className="truncate text-xs text-muted-foreground">{current.description}</p>
          </div>
        ) : (
          <Link href="/dashboard" className="text-sm font-medium">
            Acervo Digital
          </Link>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <GlobalSearch />
        <ThemeToggle />
        <UploadButton />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
