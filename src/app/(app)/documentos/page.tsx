import { Suspense } from "react";
import { LibraryView } from "@/features/library/library-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Documentos e textos" };

export default function DocumentsPage(): React.JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <LibraryView
        fixedFilters={{ category: "document" }}
        emptyTitle="Nenhum documento enviado"
        emptyDescription="Envie arquivos TXT, MD, PDF, DOCX ou RTF para comecar."
      />
    </Suspense>
  );
}
