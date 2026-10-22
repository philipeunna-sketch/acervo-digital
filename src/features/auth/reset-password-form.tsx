"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resetPasswordSchema } from "@/lib/validation/schemas";

type ResetInput = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "" },
  });

  const onSubmit = async (values: ResetInput): Promise<void> => {
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(payload.error ?? "Nao foi possivel redefinir a senha.");
        return;
      }
      toast.success("Senha redefinida. Entre com a nova senha.");
      router.replace("/login");
    } catch {
      toast.error("Falha ao redefinir a senha.");
    }
  };

  return (
    <Card className="border-border/60 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5" aria-hidden />
          Nova senha
        </CardTitle>
        <CardDescription>
          Defina uma nova senha com pelo menos 10 caracteres, maiuscula, minuscula, numero e simbolo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <input type="hidden" {...register("token")} />
          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
            {errors.password ? (
              <p id="password-error" className="text-xs text-destructive">
                {errors.password.message}
              </p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Salvar nova senha
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
