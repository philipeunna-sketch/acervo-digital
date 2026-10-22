"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Save, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function SettingsView(): React.JSX.Element {
  const [fullName, setFullName] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [savingPassword, setSavingPassword] = React.useState(false);

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async (): Promise<{ user: { id: string; email: string; fullName: string | null; role: string } | null }> => {
      const response = await fetch("/api/auth/session");
      return (await response.json()) as { user: { id: string; email: string; fullName: string | null; role: string } | null };
    },
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (session?.user) setFullName(session.user.fullName ?? "");
  }, [session]);

  const saveProfile = async (): Promise<void> => {
    setSavingProfile(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao salvar o perfil.");
      toast.success("Perfil atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (): Promise<void> => {
    if (newPassword !== confirmPassword) {
      toast.error("As senhas nao conferem.");
      return;
    }
    setSavingPassword(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao alterar a senha.");
      toast.success("Senha alterada. Faca login novamente.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao alterar a senha.");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configuracoes</h1>
        <p className="text-sm text-muted-foreground">Perfil, seguranca e preferencias da interface.</p>
      </header>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" aria-hidden /> Perfil
          </CardTitle>
          <CardDescription>
            {session?.user?.email ?? "-"} · {session?.user?.role === "admin" ? "Administrador" : "Usuario"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Nome de exibicao</Label>
            <Input
              id="profile-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              maxLength={120}
            />
          </div>
          <Button onClick={() => void saveProfile()} loading={savingProfile}>
            <Save aria-hidden /> Salvar perfil
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" aria-hidden /> Alterar senha
          </CardTitle>
          <CardDescription>
            Use pelo menos 10 caracteres com maiuscula, minuscula, numero e simbolo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="current-password">Senha atual</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
          </div>
          <Button onClick={() => void savePassword()} loading={savingPassword}>
            <ShieldCheck aria-hidden /> Alterar senha
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Aparencia</CardTitle>
          <CardDescription>O tema escuro e o padrao da aplicacao.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <ThemeToggle />
          <Separator orientation="vertical" className="h-6" />
          <p className="text-sm text-muted-foreground">Alternar tema claro/escuro</p>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Seguranca da conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Os arquivos privados sao acessados por URLs assinadas de curta duracao, geradas no servidor.</p>
          <p>Credenciais de integracoes ficam cifradas no banco e nunca sao enviadas ao navegador.</p>
        </CardContent>
      </Card>
    </div>
  );
}
