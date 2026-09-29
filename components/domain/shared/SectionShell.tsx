import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function SectionShell({ icon, title, description, action, children }: Props) {
  return (
    <Card className="min-w-0 gap-0 overflow-hidden rounded-lg border shadow-none" data-slot="insight-card">
      <CardHeader className="flex flex-col items-stretch gap-3 space-y-0 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 text-muted-foreground [&_svg]:size-4 [&_svg]:stroke-[1.75]" aria-hidden="true">{icon}</span>
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-sm font-semibold leading-5">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
        </div>
        {action && <div className="shrink-0 self-start sm:self-auto">{action}</div>}
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 px-5 pb-5">{children}</CardContent>
    </Card>
  );
}
