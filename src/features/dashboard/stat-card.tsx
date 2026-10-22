import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  title: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "default" | "danger";
}

export function StatCard({ title, value, hint, icon, tone = "default" }: StatCardProps): React.JSX.Element {
  return (
    <Card className="border-border/60">
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p
            className={cn(
              "mt-1 truncate text-2xl font-semibold tracking-tight",
              tone === "danger" && "text-destructive",
            )}
          >
            {value}
          </p>
          {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}
