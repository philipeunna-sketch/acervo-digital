import { cookies } from "next/headers";
import { randomToken, signPayload, verifySignedPayload } from "@/lib/security/crypto";
import { getSessionSecret } from "@/lib/env";

/** Estado do fluxo OAuth (anti-CSRF) guardado em cookie httpOnly. */
export const OAUTH_STATE_COOKIE = "acervo_drive_state";

export async function createOAuthState(): Promise<string> {
  const state = signPayload(randomToken(16), getSessionSecret());
  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return state;
}

export async function consumeOAuthState(received: string | null): Promise<boolean> {
  const store = await cookies();
  const stored = store.get(OAUTH_STATE_COOKIE)?.value;
  if (!stored || !received || stored !== received) return false;
  if (!verifySignedPayload(received, getSessionSecret())) return false;
  store.delete(OAUTH_STATE_COOKIE);
  return true;
}
