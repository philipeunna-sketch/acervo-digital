import * as React from "react";
import { cn } from "@/lib/utils/cn";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden {...props} />;
}

export { Skeleton };
