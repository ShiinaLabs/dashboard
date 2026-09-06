import { Divider } from "@mantine/core";

export function Separator({ className }: { className?: string }) {
  return <Divider className={className} color="var(--border)" />;
}
