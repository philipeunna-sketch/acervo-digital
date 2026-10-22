import type { Db } from "@/lib/db/client";
import type { IntegrationRecord } from "@/types";

export interface IntegrationRow extends IntegrationRecord {
  access_token: string | null;
  refresh_token: string | null;
  config: Record<string, unknown>;
}

const INTEGRATION_COLUMNS = `
  id, user_id, provider, status, account_label, account_email, expires_at, scopes,
  last_tested_at, last_error, created_at, updated_at, access_token, refresh_token, config
`;

export async function listIntegrations(db: Db, userId: string): Promise<IntegrationRow[]> {
  return db.query<IntegrationRow>(
    `select ${INTEGRATION_COLUMNS} from public.integrations where user_id = $1 order by provider asc`,
    [userId],
  );
}

export async function getIntegration(
  db: Db,
  userId: string,
  provider: IntegrationRecord["provider"],
): Promise<IntegrationRow | null> {
  const rows = await db.query<IntegrationRow>(
    `select ${INTEGRATION_COLUMNS} from public.integrations where user_id = $1 and provider = $2 limit 1`,
    [userId, provider],
  );
  return rows[0] ?? null;
}

export async function upsertIntegration(
  db: Db,
  userId: string,
  provider: IntegrationRecord["provider"],
  patch: {
    status?: IntegrationRecord["status"];
    accountLabel?: string | null;
    accountEmail?: string | null;
    accessToken?: string | null;
    refreshToken?: string | null;
    expiresAt?: string | null;
    scopes?: string | null;
    config?: Record<string, unknown>;
    lastTestedAt?: string | null;
    lastError?: string | null;
  },
): Promise<IntegrationRow> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown): void => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (patch.status !== undefined) push("status", patch.status);
  if (patch.accountLabel !== undefined) push("account_label", patch.accountLabel);
  if (patch.accountEmail !== undefined) push("account_email", patch.accountEmail);
  if (patch.accessToken !== undefined) push("access_token", patch.accessToken);
  if (patch.refreshToken !== undefined) push("refresh_token", patch.refreshToken);
  if (patch.expiresAt !== undefined) push("expires_at", patch.expiresAt);
  if (patch.scopes !== undefined) push("scopes", patch.scopes);
  if (patch.config !== undefined) push("config", JSON.stringify(patch.config));
  if (patch.lastTestedAt !== undefined) push("last_tested_at", patch.lastTestedAt);
  if (patch.lastError !== undefined) push("last_error", patch.lastError);

  if (sets.length === 0) {
    const existing = await getIntegration(db, userId, provider);
    if (existing) return existing;
    const inserted = await db.query<IntegrationRow>(
      `insert into public.integrations (user_id, provider) values ($1, $2) returning ${INTEGRATION_COLUMNS}`,
      [userId, provider],
    );
    return inserted[0]!;
  }

  params.push(userId, provider);
  const updated = await db.query<IntegrationRow>(
    `update public.integrations set ${sets.join(", ")}, updated_at = now()
      where user_id = $${params.length - 1} and provider = $${params.length}
      returning ${INTEGRATION_COLUMNS}`,
    params,
  );
  if (updated[0]) return updated[0];

  const inserted = await db.query<IntegrationRow>(
    `insert into public.integrations (user_id, provider) values ($1, $2) returning ${INTEGRATION_COLUMNS}`,
    [userId, provider],
  );
  return inserted[0]!;
}

export async function deleteIntegration(
  db: Db,
  userId: string,
  provider: IntegrationRecord["provider"],
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `delete from public.integrations where user_id = $1 and provider = $2 returning id`,
    [userId, provider],
  );
  return rows.length > 0;
}
