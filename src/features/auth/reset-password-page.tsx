"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";

/**
 * Mesma rota para os dois fluxos:
 * - sem `token` -> solicita o e-mail de recuperacao;
 * - com `token` -> define a nova senha.
 */
export function ResetPasswordPage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  return token ? <ResetPasswordForm /> : <ForgotPasswordForm />;
}
