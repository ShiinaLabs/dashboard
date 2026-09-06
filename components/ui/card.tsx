import type { HTMLAttributes, ReactNode } from "react";
import { Card as MantineCard, Text, type CardProps } from "@mantine/core";
import { cn } from "@/lib/client/utils";

export function Card({ className, children, ...props }: CardProps & HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <MantineCard withBorder radius="md" p={0} className={className} style={{ background: "var(--card)", color: "var(--card-foreground)" }} {...props}>
      {children}
    </MantineCard>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return <MantineCard.Section p={{ base: "md", sm: "lg" }} className={cn("flex flex-col gap-1.5", className)} {...props}>{children}</MantineCard.Section>;
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement> & { children?: ReactNode }) {
  return <Text component="h3" fz="lg" fw={600} className={className} {...props}>{children}</Text>;
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement> & { children?: ReactNode }) {
  return <Text size="sm" c="dimmed" className={className} {...props}>{children}</Text>;
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return <MantineCard.Section p={{ base: "md", sm: "lg" }} className={cn("pt-0 sm:pt-0", className)} {...props}>{children}</MantineCard.Section>;
}
