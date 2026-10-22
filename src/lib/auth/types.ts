/**
 * Contrato de autenticacao. A aplicacao nao depende do provedor concreto
 * (Supabase Auth em producao, driver local em desenvolvimento).
 */

export interface AuthUser {
  id: string;
  email: string;
  role: "admin" | "user";
  mustChangePassword: boolean;
  fullName: string | null;
  avatarUrl: string | null;
}

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string; code?: "invalid_credentials" | "not_found" | "weak_password" | "disabled" };

export interface PasswordResetRequest {
  ok: boolean;
  message: string;
  /** Link de redefinicao - preenchido apenas em desenvolvimento. */
  devToken?: string;
}

export interface AuthAdapter {
  readonly name: "supabase" | "local";
  isConfigured(): boolean;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  getUser(): Promise<AuthUser | null>;
  updatePassword(currentPassword: string, newPassword: string): Promise<AuthResult>;
  requestPasswordReset(email: string): Promise<PasswordResetRequest>;
  resetPassword(token: string, newPassword: string): Promise<AuthResult>;
  /** Cria a conta administrativa inicial (usado pelo bootstrap). */
  createAdminUser(email: string, password: string): Promise<AuthResult>;
}
