import { Suspense } from "react";
import { ResetPasswordPage } from "@/features/auth/reset-password-page";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Recuperar acesso" };

export default function Page(): React.JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <ResetPasswordPage />
    </Suspense>
  );
}
