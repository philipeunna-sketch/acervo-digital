import Link from "next/link";
import { Boxes } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--ring)_18%,transparent),transparent)]"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Boxes className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Acervo Digital</h1>
            <p className="text-sm text-muted-foreground">Gestao de arquivos com inteligencia artificial</p>
          </div>
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:underline">
            Voltar ao inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
