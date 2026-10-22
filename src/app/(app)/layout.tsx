import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureSchema } from "@/lib/db/migrate";
import { ensureBootstrap } from "@/lib/bootstrap";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { UploadProvider } from "@/features/uploads/upload-provider";
import { UploadIndicator } from "@/features/uploads/upload-indicator";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }): Promise<React.JSX.Element> {
  await ensureSchema();
  try {
    await ensureBootstrap();
  } catch (error) {
    console.error("[app] bootstrap:", error instanceof Error ? error.message : error);
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.mustChangePassword) {
    // Destino fora do grupo (app) para evitar laco de redirecionamento.
    redirect("/definir-senha?trocaObrigatoria=1");
  }

  return (
    <UploadProvider>
      <div className="flex min-h-dvh w-full bg-background">
        <div className="hidden w-64 shrink-0 lg:block">
          <div className="fixed inset-y-0 left-0 z-30 w-64">
            <AppSidebar />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
          <AppHeader user={user} />
          <main id="conteudo" className="flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
      <UploadIndicator />
    </UploadProvider>
  );
}
