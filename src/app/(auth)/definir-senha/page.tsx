import { Suspense } from "react";
import { SecurityView } from "@/features/settings/security-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Definir nova senha" };

/**
 * Pagina de troca de senha **fora** do layout protegido: e o destino do
 * redirecionamento quando a conta ainda usa a senha de bootstrap. Como fica
 * em outro grupo de rotas, nao ha laco de redirecionamento.
 */
export default function DefinirSenhaPage(): React.JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SecurityView />
    </Suspense>
  );
}
