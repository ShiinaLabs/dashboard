import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Card, Group, Stack, Text } from "@mantine/core";

export function CompactCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card
      withBorder
      radius="md"
      p="md"
      className={className}
      style={{ background: "var(--card)", color: "var(--card-foreground)" }}
    >
      {children}
    </Card>
  );
}

export function HighlightCard({
  title, icon, children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card
      withBorder
      radius="md"
      p="md"
      className="flex h-full flex-col"
      style={{ background: "var(--card)", color: "var(--card-foreground)" }}
    >
      <Stack gap="xs" className="min-h-0 flex-1">
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <span className="shrink-0">{icon}</span>
            <Text size="xs" fw={600} c="dimmed" truncate>
              {title}
            </Text>
          </Group>
        <ArrowUpRight size={14} className="shrink-0 text-[var(--muted-foreground)]" />
        </Group>
        <div className="-mx-2 space-y-0.5">{children}</div>
      </Stack>
    </Card>
  );
}
