import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Entrar",
};

export default function LoginPage(): React.JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-80 w-full" />}>
      <LoginForm />
    </Suspense>
  );
}
