"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

export function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          classNames: {
            toast: "border border-border bg-popover text-popover-foreground",
          },
        }}
      />
    </QueryClientProvider>
  );
}
