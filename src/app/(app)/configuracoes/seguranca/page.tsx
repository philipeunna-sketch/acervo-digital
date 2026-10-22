import { Suspense } from "react";
import { SecurityView } from "@/features/settings/security-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Seguranca" };

export default function SecurityPage(): React.JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SecurityView />
    </Suspense>
  );
}
