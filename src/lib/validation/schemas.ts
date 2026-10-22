import { z } from "zod";

/** Esquemas de validacao de entrada (usados em Route Handlers e Server Actions). */

export const passwordSchema = z
  .string()
  .min(10, "A senha deve ter ao menos 10 caracteres")
  .max(200, "Senha muito longa")
  .regex(/[a-z]/, "Inclua ao menos uma letra minuscula")
  .regex(/[A-Z]/, "Inclua ao menos uma letra maiuscula")
  .regex(/[0-9]/, "Inclua ao menos um numero")
  .regex(/[^A-Za-z0-9]/, "Inclua ao menos um caractere especial");

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Informe o e-mail").email("E-mail invalido"),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, "Informe o e-mail").email("E-mail invalido"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10, "Token invalido"),
  password: passwordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirme a nova senha"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas nao conferem",
    path: ["confirmPassword"],
  });

export const updateProfileSchema = z.object({
  fullName: z.string().trim().max(120).optional().nullable(),
});

export const albumCreateSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do album").max(120, "Nome muito longo"),
  description: z.string().trim().max(2000).optional().nullable(),
  coverFileId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(48)).max(20).optional(),
});

export const albumUpdateSchema = albumCreateSchema.partial().extend({
  coverFileId: z.string().uuid().optional().nullable(),
});

export const fileUpdateSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(255).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(48)).max(40).optional(),
  albumIds: z.array(z.string().uuid()).max(50).optional(),
});

export const bulkActionSchema = z.object({
  fileIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um arquivo").max(500),
  action: z.enum(["trash", "restore", "delete", "favorite", "unfavorite", "move", "tag"]),
  albumId: z.string().uuid().optional(),
  tags: z.array(z.string().trim().min(1).max(48)).max(40).optional(),
});

export const uploadInitiateSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "Nome de arquivo invalido")
    .max(255, "Nome de arquivo muito longo")
    .refine((v) => !v.includes("/") && !v.includes("\\") && !v.includes(".."), "Nome de arquivo invalido"),
  size: z.number().int().positive("Tamanho invalido"),
  mimeType: z.string().trim().max(160).default("application/octet-stream"),
  category: z.string().trim().max(32).optional(),
  albumId: z.string().uuid().optional().nullable(),
  providerId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(48)).max(20).optional(),
});

export const uploadPartSchema = z.object({
  partNumbers: z.array(z.number().int().min(1).max(10000)).min(1).max(50),
});

export const uploadCompleteSchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10000),
        etag: z.string().min(1).max(200),
        size: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1)
    .max(10000),
  checksum: z.string().max(200).optional(),
  albumId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(48)).max(20).optional(),
});

export const librarySortSchema = z.enum([
  "recent",
  "oldest",
  "name_asc",
  "name_desc",
  "size_desc",
  "size_asc",
  "type",
  "provider",
]);

export const libraryQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.enum(["document", "image", "video", "audio", "archive", "other"]).optional(),
  providerId: z.string().uuid().optional(),
  albumId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minSize: z.coerce.number().int().nonnegative().optional(),
  maxSize: z.coerce.number().int().nonnegative().optional(),
  favorite: z.coerce.boolean().optional(),
  processed: z.enum(["all", "yes", "no"]).optional(),
  status: z.enum(["active", "trashed"]).optional(),
  sort: librarySortSchema.optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  extension: z.string().trim().max(16).optional(),
});

export const externalUrlSchema = z
  .string()
  .trim()
  .min(8, "URL muito curta")
  .max(2048, "URL muito longa")
  .refine((v) => {
    try {
      const parsed = new URL(v);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "URL invalida (use http:// ou https://)");

export const keywordSearchSchema = z.object({
  query: z.string().trim().min(2, "Informe ao menos 2 caracteres").max(200),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

export const analyzeUrlSchema = z.object({
  url: externalUrlSchema,
});

export const importCommitSchema = z.object({
  jobId: z.string().uuid(),
  candidateIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um item").max(100),
  providerId: z.string().uuid().optional().nullable(),
  albumId: z.string().uuid().optional().nullable(),
  namePrefix: z.string().trim().max(80).optional(),
});

export const storageProviderSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(80),
  kind: z.enum(["s3", "local"]),
  endpoint: z.string().trim().url("Endpoint invalido").optional().or(z.literal("")),
  region: z.string().trim().max(60).optional().or(z.literal("")),
  bucket: z.string().trim().max(120).optional().or(z.literal("")),
  accessKeyId: z.string().trim().max(200).optional().or(z.literal("")),
  secretAccessKey: z.string().trim().max(400).optional().or(z.literal("")),
  forcePathStyle: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const telegramConfigSchema = z.object({
  botToken: z.string().trim().min(20, "Token de bot invalido").max(200),
  chatId: z.string().trim().min(1, "Informe o chat de destino").max(64),
});

export const googleDriveConfigSchema = z.object({
  clientId: z.string().trim().min(10).optional().or(z.literal("")),
  clientSecret: z.string().trim().min(10).optional().or(z.literal("")),
  redirectUri: z.string().trim().url().optional().or(z.literal("")),
});

export const aiConfigSchema = z.object({
  provider: z.string().trim().min(2).max(40),
  apiKey: z.string().trim().min(10, "Chave de API invalida").max(300),
  baseUrl: z.string().trim().url("URL base invalida").optional().or(z.literal("")),
  model: z.string().trim().min(2, "Informe o modelo").max(120),
});

export const searchConfigSchema = z.object({
  provider: z.enum(["brave", "tavily", "serper", "google"]),
  apiKey: z.string().trim().min(8, "Chave de API invalida").max(300),
  extra: z.string().trim().max(200).optional().or(z.literal("")),
});

export const importCandidateUpdateSchema = z.object({
  candidateId: z.string().uuid(),
  selected: z.boolean().optional(),
  suggestedName: z.string().trim().max(180).optional(),
});

export const driveImportSchema = z.object({
  fileIds: z.array(z.string().trim().min(1).max(400)).min(1, "Selecione ao menos um arquivo").max(50),
  providerId: z.string().uuid().optional().nullable(),
  albumId: z.string().uuid().optional().nullable(),
  copy: z.boolean().optional(),
});

export const telegramSendSchema = z.object({
  fileIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um arquivo").max(20),
  chatId: z.string().trim().min(1).max(64).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AlbumCreateInput = z.infer<typeof albumCreateSchema>;
export type LibraryQuery = z.infer<typeof libraryQuerySchema>;
