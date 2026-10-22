"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { forgotPasswordSchema, type LoginInput } from "@/lib/validation/schemas";

export function ForgotPasswordForm(): React.JSX.Element {
  const [sent, setSent] = React.useState<string | null>(null);
  const [devLink, setDevLink] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: LoginInput): Promise<void> => {
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await response.json()) as { message?: string; devLink?: string };
      setSent(payload.message ?? "Se o e-mail existir, enviaremos as instrucoes.");
      if (payload.devLink) setDevLink(payload.devLink);
      toast.success(payload.message ?? "Solicitacao registrada.");
    } catch {
      toast.error("Falha ao solicitar a redefinicao.");
    }
  };

  if (sent) {
    return (
      <Card className="border-border/60 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MailCheck className="h-5 w-5" aria-hidden />
            Verifique seu e-mail
          </CardTitle>
          <CardDescription>{sent}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {devLink ? (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              <p className="font-medium">Ambiente de desenvolvimento</p>
              <a href={devLink} className="underline underline-offset-4">
                Abrir link de redefinicao
              </a>
            </div>
          ) : null}
          <Button variant="outline" className="w-full" asChild>
            <Link href="/login">Voltar para o login</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg">Recuperar acesso</CardTitle>
        <CardDescription>Informe seu e-mail para receber o link de redefinicao de senha.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
            {errors.email ? (
              <p id="email-error" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Enviar instrucoes
          </Button>
          <Button variant="ghost" className="w-full" asChild>
            <Link href="/login">Voltar para o login</Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
