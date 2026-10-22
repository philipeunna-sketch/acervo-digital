import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/supabase";

/**
 * Callback do Supabase Auth (confirmacao de e-mail e recuperacao de senha).
 * Troca o `code` pela sessao e redireciona para o destino solicitado.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const target = new URL("/login", url.origin);
      target.searchParams.set("erro", error.message);
      return NextResponse.redirect(target);
    }
  } catch {
    const target = new URL("/login", url.origin);
    target.searchParams.set("erro", "Falha ao confirmar a sessao.");
    return NextResponse.redirect(target);
  }

  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/dashboard", url.origin));
}
