import { Suspense } from "react";
import { LibraryView } from "@/features/library/library-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Videos" };

export default function VideosPage(): React.JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <LibraryView
        fixedFilters={{ category: "video" }}
        emptyTitle="Nenhum video enviado"
        emptyDescription="Envie arquivos MP4, MOV ou WEBM para reproduzir aqui."
      />
    </Suspense>
  );
}
