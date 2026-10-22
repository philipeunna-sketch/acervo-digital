/**
 * Cliente do Telegram Bot API.
 *
 * O Telegram NAO e um storage de objetos: o envio cria uma copia temporaria
 * no chat de destino. O modulo de integracoes registra explicitamente a
 * diferenca entre "copia enviada", "arquivo armazenado" e "referencia salva".
 */

const API_BASE = "https://api.telegram.org";

export interface TelegramBotInfo {
  id: number;
  username: string;
  firstName: string;
  canJoinGroups: boolean;
  canReadMessages: boolean;
}

export interface TelegramSendResult {
  ok: boolean;
  messageId: number | null;
  chatId: string;
  description: string;
  error: string | null;
}

export const TELEGRAM_LIMITS = {
  document: 50 * 1024 * 1024,
  photo: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
} as const;

export async function getBotInfo(token: string): Promise<TelegramBotInfo> {
  const response = await fetch(`${API_BASE}/bot${token}/getMe`, { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: TelegramBotInfo;
    description?: string;
  } | null;
  if (!response.ok || !payload?.ok || !payload.result) {
    throw new Error(payload?.description ?? `Telegram respondeu ${response.status}.`);
  }
  return payload.result;
}

export async function getChat(token: string, chatId: string): Promise<{ id: number; title?: string; type: string }> {
  const response = await fetch(`${API_BASE}/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: { id: number; title?: string; type: string };
    description?: string;
  } | null;
  if (!response.ok || !payload?.ok || !payload.result) {
    throw new Error(payload?.description ?? `Telegram respondeu ${response.status}.`);
  }
  return payload.result;
}

async function sendMultipart(
  token: string,
  method: string,
  chatId: string,
  file: { data: Uint8Array; filename: string; contentType: string },
  extra: Record<string, string>,
): Promise<TelegramSendResult> {
  const form = new FormData();
  form.append("chat_id", chatId);
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  form.append("document", new Blob([file.data as BlobPart], { type: file.contentType }), file.filename);

  const response = await fetch(`${API_BASE}/bot${token}/${method}`, { method: "POST", body: form });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: { message_id?: number };
    description?: string;
  } | null;

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      messageId: null,
      chatId,
      description: payload?.description ?? `Telegram respondeu ${response.status}.`,
      error: payload?.description ?? `HTTP ${response.status}`,
    };
  }

  return {
    ok: true,
    messageId: payload.result?.message_id ?? null,
    chatId,
    description: "Enviado com sucesso (copia no chat de destino).",
    error: null,
  };
}

export async function sendDocument(
  token: string,
  chatId: string,
  file: { data: Uint8Array; filename: string; contentType: string },
  caption?: string,
): Promise<TelegramSendResult> {
  if (file.data.byteLength > TELEGRAM_LIMITS.document) {
    return {
      ok: false,
      messageId: null,
      chatId,
      description: `Arquivo maior que o limite de ${TELEGRAM_LIMITS.document / (1024 * 1024)} MB do Telegram.`,
      error: "file_too_large",
    };
  }
  return sendMultipart(token, "sendDocument", chatId, file, caption ? { caption } : {});
}

export async function sendPhoto(
  token: string,
  chatId: string,
  file: { data: Uint8Array; filename: string; contentType: string },
  caption?: string,
): Promise<TelegramSendResult> {
  if (file.data.byteLength > TELEGRAM_LIMITS.photo) {
    return {
      ok: false,
      messageId: null,
      chatId,
      description: `Imagem maior que o limite de ${TELEGRAM_LIMITS.photo / (1024 * 1024)} MB do Telegram.`,
      error: "file_too_large",
    };
  }
  return sendMultipart(token, "sendPhoto", chatId, file, caption ? { caption } : {});
}

export async function sendVideo(
  token: string,
  chatId: string,
  file: { data: Uint8Array; filename: string; contentType: string },
  caption?: string,
): Promise<TelegramSendResult> {
  if (file.data.byteLength > TELEGRAM_LIMITS.video) {
    return {
      ok: false,
      messageId: null,
      chatId,
      description: `Video maior que o limite de ${TELEGRAM_LIMITS.video / (1024 * 1024)} MB do Telegram.`,
      error: "file_too_large",
    };
  }
  return sendMultipart(token, "sendVideo", chatId, file, caption ? { caption } : {});
}
