"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SecurityView(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forced = searchParams.get("trocaObrigatoria") === "1";

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async (): Promise<void> => {
    if (newPassword !== confirmPassword) {
      toast.error("As senhas nao conferem.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao alterar a senha.");
      toast.success("Senha alterada com sucesso. Entre novamente com a nova senha.");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao alterar a senha.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Seguranca</h1>
        <p className="text-sm text-muted-foreground">Altere sua senha e revise o acesso a sua conta.</p>
      </header>

      {forced ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-warning" aria-hidden />
            <div>
              <p className="font-medium">Troca de senha obrigatoria</p>
              <p className="mt-1 text-muted-foreground">
                Esta conta foi criada com a senha inicial de bootstrap. Defina uma senha pessoal antes de continuar.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" aria-hidden /> Alterar senha
          </CardTitle>
          <CardDescription>
            Minimo de 10 caracteres, com letra maiuscula, minuscula, numero e simbolo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="sec-current">Senha atual</Label>
            <Input
              id="sec-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sec-new">Nova senha</Label>
            <Input
              id="sec-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sec-confirm">Confirmar nova senha</Label>
            <Input
              id="sec-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          <Button onClick={() => void submit()} loading={saving}>
            Alterar senha
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
