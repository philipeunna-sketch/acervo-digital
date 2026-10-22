"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, ShieldCheck, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initialsFromName } from "@/lib/utils/format";
import type { AuthUser } from "@/lib/auth/types";

export function UserMenu({ user }: { user: AuthUser }): React.JSX.Element {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  const signOut = async (): Promise<void> => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Menu do usuario">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initialsFromName(user.fullName ?? user.email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium text-foreground">{user.fullName ?? user.email}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          {user.role === "admin" ? (
            <p className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Administrador
            </p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/configuracoes">
            <UserIcon aria-hidden />
            Perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/configuracoes/seguranca">
            <ShieldCheck aria-hidden />
            Seguranca
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/configuracoes">
            <Settings aria-hidden />
            Configuracoes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
          disabled={signingOut}
        >
          <LogOut aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
