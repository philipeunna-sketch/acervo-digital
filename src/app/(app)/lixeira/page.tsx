import { Suspense } from "react";
import { LibraryView } from "@/features/library/library-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Lixeira" };

export default function TrashPage(): React.JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <LibraryView
        fixedFilters={{ status: "trashed" }}
        showStatus
        emptyTitle="Lixeira vazia"
        emptyDescription="Arquivos excluidos ficam aqui ate serem restaurados ou apagados definitivamente."
      />
    </Suspense>
  );
}
