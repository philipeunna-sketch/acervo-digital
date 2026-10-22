import { NextResponse, type NextRequest } from "next/server";

/**
 * Protecao de rotas no edge/middleware.
 *
 * O middleware apenas verifica a *presenca* da cookie de sessao (barato, sem
 * acesso ao banco). A validacao real acontece no servidor, em cada layout e
 * Route Handler (`requireUser`).
 */

const PUBLIC_PATHS = ["/login", "/reset-password", "/auth/callback", "/api/auth/login", "/api/auth/session"];

const SESSION_COOKIE_PATTERN = /^(acervo_session|sb-[a-z0-9]+-auth-token)$/i;

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => SESSION_COOKIE_PATTERN.test(cookie.name));
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (isPublic) return NextResponse.next();

  const authenticated = hasSessionCookie(request);

  if (!authenticated && !pathname.startsWith("/api")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!authenticated && pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/storage/local|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
