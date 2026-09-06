import type { ReactNode } from "react";
import { SimpleGrid } from "@mantine/core";

export type MetricGridColumns = "three" | "four" | "five";

interface MetricGridProps {
  columns?: MetricGridColumns;
  children: ReactNode;
  className?: string;
}

const columnConfig = {
  // Mantine's `sm` is 48em (768px), matching the project's former Tailwind `md` breakpoint.
  three: { base: 2, sm: 3 },
  four: { base: 2, sm: 4 },
  five: { base: 2, sm: 5 },
} as const;

export function MetricGrid({ columns = "four", children, className }: MetricGridProps) {
  return (
    <SimpleGrid
      className={className}
      data-slot="metric-grid"
      data-columns={columns}
      cols={columnConfig[columns]}
      spacing={{ base: "sm", sm: "md" }}
      verticalSpacing={{ base: "sm", sm: "md" }}
    >
      {children}
    </SimpleGrid>
  );
}
