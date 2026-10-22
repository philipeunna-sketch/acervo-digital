import { Suspense } from "react";
import { LibraryView } from "@/features/library/library-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Favoritos" };

export default function FavoritesPage(): React.JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <LibraryView
        fixedFilters={{ favorite: true }}
        emptyTitle="Nenhum favorito"
        emptyDescription="Marque arquivos como favoritos para encontra-los rapidamente."
      />
    </Suspense>
  );
}
