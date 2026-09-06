import type { ReactNode } from "react";
import { Badge as MantineBadge, type BadgeProps } from "@mantine/core";

export function Badge({ className, children, ...props }: BadgeProps & { children?: ReactNode }) {
  return (
    <MantineBadge size="sm" radius="xl" variant="light" color="primary" className={className} {...props}>
      {children}
    </MantineBadge>
  );
}
