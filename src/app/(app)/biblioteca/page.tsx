import { Suspense } from "react";
import { LibraryView } from "@/features/library/library-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Biblioteca" };

export default function LibraryPage(): React.JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <LibraryView />
    </Suspense>
  );
}
