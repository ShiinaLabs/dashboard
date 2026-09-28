import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Group, Stack, Text } from "@/components/ui/layout-primitives";

export function CompactCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Card p="md" className={className}>{children}</Card>;
}

export function HighlightCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card p="md" className="flex h-full flex-col">
      <Stack gap="xs" className="min-h-0 flex-1">
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <span className="shrink-0">{icon}</span>
            <Text size="xs" fw={600} c="dimmed" truncate>{title}</Text>
          </Group>
          <ArrowUpRight size={14} className="shrink-0 text-muted-foreground" />
        </Group>
        <div className="-mx-2 space-y-0.5">{children}</div>
      </Stack>
    </Card>
  );
}
