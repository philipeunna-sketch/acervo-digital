import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes, formatNumber } from "@/lib/utils/format";
import { categoryLabel } from "@/features/files/file-type-icon";

export interface DistributionItem {
  label: string;
  count: number;
  bytes: number;
  percent: number;
}

export function DistributionCard({
  title,
  items,
}: {
  title: string;
  items: DistributionItem[];
}): React.JSX.Element {
  const total = items.reduce((sum, item) => sum + item.bytes, 0);

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados para exibir.</p>
        ) : (
          items.map((item) => {
            const label =
              ["document", "image", "video", "audio", "archive", "other"].includes(item.label)
                ? categoryLabel(item.label as never)
                : item.label;
            return (
              <div key={item.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">{label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatNumber(item.count)} · {formatBytes(item.bytes)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${total > 0 ? Math.max(2, item.percent) : 0}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
