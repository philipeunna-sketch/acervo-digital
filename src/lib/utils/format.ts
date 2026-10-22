/**
 * Utilitarios de formatacao (pt-BR) compartilhados entre servidor e cliente.
 * Nao deve importar nada que dependa de `server-only`.
 */

const numberFormatter = new Intl.NumberFormat("pt-BR");
const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function formatNumber(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return numberFormatter.format(n);
}

export function formatBytes(bytes: number | string | null | undefined): string {
  const n = typeof bytes === "string" ? Number(bytes) : bytes;
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const value = n / 1024 ** i;
  const unit = units[i] ?? "B";
  return `${decimalFormatter.format(value)} ${unit}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${decimalFormatter.format(value)}%`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatDateOnly(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "-";
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatSpeed(bytesPerSecond: number | null | undefined): string {
  if (bytesPerSecond === null || bytesPerSecond === undefined || Number.isNaN(bytesPerSecond)) return "-";
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds) || seconds < 0) return "-";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function initialsFromName(nameOrEmail: string): string {
  const base = nameOrEmail.trim();
  if (!base) return "?";
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function truncate(value: string, max = 80): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}
