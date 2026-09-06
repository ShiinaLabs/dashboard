import type { ReactNode } from "react";
import {
  Card,
  Group,
  NumberFormatter,
  Skeleton as MantineSkeleton,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { cn } from "@/lib/client/utils";

export type MetricCardDensity = "default" | "compact";
export type MetricCardTone = "primary" | "success" | "warn" | "danger";

export interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: number;
  hint?: ReactNode;
  density?: MetricCardDensity;
  tone?: MetricCardTone;
  className?: string;
  valuePrefix?: string;
  valueSuffix?: string;
}

const densityTokens = {
  default: {
    padding: { base: "sm", sm: "md" },
    minHeight: 108,
    iconSize: 40,
    iconRadius: "md",
    valueSize: "xl",
  },
  compact: {
    padding: "md",
    minHeight: 96,
    iconSize: 40,
    iconRadius: "md",
    valueSize: "xl",
  },
} as const;

function getDensityTokens(density: MetricCardDensity) {
  return densityTokens[density];
}

export function MetricCard({
  icon,
  label,
  value,
  hint,
  density = "default",
  tone = "primary",
  className,
  valuePrefix,
  valueSuffix,
}: MetricCardProps) {
  const tokens = getDensityTokens(density);

  return (
    <Card
      withBorder
      radius="lg"
      p={tokens.padding}
      className={cn("metric-card", className)}
      data-tone={tone}
      style={{
        minHeight: tokens.minHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--card)",
        color: "var(--card-foreground)",
        borderColor: `color-mix(in srgb, var(--${tone}) 22%, var(--border))`,
      }}
    >
      <Group gap="sm" wrap="nowrap" align="center" style={{ minWidth: 0, width: "100%" }}>
        <ThemeIcon
          data-slot="metric-icon"
          variant="light"
          color={tone}
          radius={tokens.iconRadius}
          size={tokens.iconSize}
          style={{
            width: tokens.iconSize,
            minWidth: tokens.iconSize,
            height: tokens.iconSize,
          }}
        >
          {icon}
        </ThemeIcon>
        <Stack gap={2} justify="center" style={{ minWidth: 0, flex: 1 }}>
          <Text
            data-slot="metric-label"
            size="xs"
            fw={600}
            tt="uppercase"
            c="dimmed"
            lh={1.25}
            lineClamp={2}
            style={{ minWidth: 0 }}
          >
            {label}
          </Text>
          <Text
            data-slot="metric-value"
            component="div"
            fw={700}
            fz={tokens.valueSize}
            lh={1.15}
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-mono, 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <NumberFormatter value={value} thousandSeparator="," prefix={valuePrefix} suffix={valueSuffix} />
          </Text>
          <Text
            data-slot="metric-hint"
            size="xs"
            c="dimmed"
            lh={1.25}
            lineClamp={2}
            style={{ minWidth: 0, opacity: hint != null ? 0.8 : 0 }}
            aria-hidden={hint != null ? undefined : true}
          >
            {hint ?? "No additional context"}
          </Text>
        </Stack>
      </Group>
    </Card>
  );
}

export function MetricCardSkeleton({ density = "default", className }: { density?: MetricCardDensity; className?: string }) {
  const tokens = getDensityTokens(density);

  return (
    <Card
      withBorder
      radius="lg"
      p={tokens.padding}
      className={cn("metric-card", className)}
      data-tone={"primary"}
      style={{
        minHeight: tokens.minHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--card)",
        color: "var(--card-foreground)",
        borderColor: "color-mix(in srgb, var(--primary) 22%, var(--border))",
      }}
    >
      <Group gap="sm" wrap="nowrap" align="center" style={{ minWidth: 0, width: "100%" }}>
        <MantineSkeleton
          data-slot="metric-skeleton-icon"
          radius={tokens.iconRadius}
          width={tokens.iconSize}
          height={tokens.iconSize}
          style={{ minWidth: tokens.iconSize }}
        />
        <Stack gap={6} justify="center" style={{ minWidth: 0, flex: 1 }}>
          <MantineSkeleton data-slot="metric-skeleton-label" height={12} width="70%" radius="sm" />
          <MantineSkeleton data-slot="metric-skeleton-value" height={26} width="62%" radius="sm" />
          <MantineSkeleton data-slot="metric-skeleton-hint" height={12} width="52%" radius="sm" />
        </Stack>
      </Group>
    </Card>
  );
}
