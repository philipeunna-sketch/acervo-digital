import type { Db } from "@/lib/db/client";

export interface AuditInput {
  userId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Registro de auditoria. Nao deve receber credenciais nem conteudo sensivel:
 * apenas metadados (nomes de arquivo, ids, acoes).
 */
export async function logAudit(db: Db, input: AuditInput): Promise<void> {
  try {
    await db.query(
      `insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.userId,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.ipAddress ?? null,
        input.userAgent ?? null,
      ],
    );
  } catch (error) {
    // Auditoria nunca deve derrubar a operacao principal.
    console.error("[audit] falha ao registrar evento:", error instanceof Error ? error.message : error);
  }
}

export async function listAuditLogs(db: Db, userId: string, limit = 50) {
  return db.query(
    `select id, action, entity_type, entity_id, metadata, created_at
       from public.audit_logs
      where user_id = $1
      order by created_at desc
      limit ${Math.min(200, Math.max(1, limit))}`,
    [userId],
  );
}
