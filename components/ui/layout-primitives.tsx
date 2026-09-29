import { createElement, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Gap = number | "xs" | "sm" | "md" | "lg" | "xl";
const gapClass: Record<string, string> = { xs: "gap-1", sm: "gap-2", md: "gap-4", lg: "gap-6", xl: "gap-8" };
interface LayoutProps extends HTMLAttributes<HTMLDivElement> {
  gap?: Gap;
  align?: "start" | "center" | "end" | "flex-start" | "flex-end" | "baseline" | "stretch";
  justify?: "start" | "center" | "end" | "space-between" | "flex-start" | "flex-end";
  wrap?: boolean | "wrap" | "nowrap";
  grow?: boolean;
  hiddenFrom?: "xs" | "sm" | "md" | "lg";
  visibleFrom?: "xs" | "sm" | "md" | "lg";
  mt?: Gap;
}

const alignClass: Record<NonNullable<LayoutProps["align"]>, string> = {
  start: "items-start", "flex-start": "items-start", center: "items-center", end: "items-end", "flex-end": "items-end", baseline: "items-baseline", stretch: "items-stretch",
};
const justifyClass: Record<NonNullable<LayoutProps["justify"]>, string> = {
  start: "justify-start", "flex-start": "justify-start", center: "justify-center", end: "justify-end", "flex-end": "justify-end", "space-between": "justify-between",
};
const marginClass: Record<Exclude<Gap, number>, string> = { xs: "mt-1", sm: "mt-2", md: "mt-4", lg: "mt-6", xl: "mt-8" };

function layoutClass(align?: LayoutProps["align"], justify?: LayoutProps["justify"], wrap?: LayoutProps["wrap"], grow?: boolean, hiddenFrom?: LayoutProps["hiddenFrom"], visibleFrom?: LayoutProps["visibleFrom"], mt?: Gap) {
  return cn(
    align && alignClass[align],
    justify && justifyClass[justify],
    wrap === "nowrap" && "flex-nowrap",
    (wrap === true || wrap === "wrap") && "flex-wrap",
    grow && "flex-1",
    hiddenFrom && ({ xs: "sm:hidden", sm: "md:hidden", md: "lg:hidden", lg: "xl:hidden" }[hiddenFrom]),
    visibleFrom && ({ xs: "hidden sm:flex", sm: "hidden md:flex", md: "hidden lg:flex", lg: "hidden xl:flex" }[visibleFrom]),
    typeof mt === "string" && marginClass[mt],
  );
}

export function Group({ gap = "sm", align = "center", justify, wrap = true, grow, hiddenFrom, visibleFrom, mt, className, style, ...rest }: LayoutProps) {
  return <div className={cn("flex", typeof gap === "string" && gapClass[gap], layoutClass(align, justify, wrap, grow, hiddenFrom, visibleFrom, mt), className)} style={{ ...style, ...(typeof gap === "number" ? { gap } : {}), ...(typeof mt === "number" ? { marginTop: mt } : {}) }} {...rest} />;
}

export function Stack({ gap = "md", align, justify, grow, hiddenFrom, visibleFrom, mt, className, style, ...rest }: LayoutProps) {
  return <div className={cn("flex flex-col", typeof gap === "string" && gapClass[gap], layoutClass(align, justify, undefined, grow, hiddenFrom, visibleFrom, mt), className)} style={{ ...style, ...(typeof gap === "number" ? { gap } : {}), ...(typeof mt === "number" ? { marginTop: mt } : {}) }} {...rest} />;
}

type TextProps = HTMLAttributes<HTMLElement> & {
  component?: ElementType;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  fz?: "xs" | "sm" | "md" | "lg" | "xl" | number;
  fw?: number;
  c?: "dimmed" | "red" | "orange" | "green" | "blue" | string;
  ta?: "left" | "center" | "right";
  lh?: number | string;
  tt?: "uppercase" | "lowercase" | "capitalize";
  truncate?: boolean;
  lineClamp?: 1 | 2 | 3 | 4 | 5 | 6;
  py?: "xs" | "sm" | "md" | "lg" | "xl";
  mt?: Gap;
  children?: ReactNode;
};

export function Text({ component = "p", size = "md", fz, fw, c, ta, lh, tt, truncate, lineClamp, py, mt, className, style, ...props }: TextProps) {
  const fontSizes = { xs: "text-xs", sm: "text-sm", md: "text-base", lg: "text-lg", xl: "text-xl" };
  const textSizes = { xs: "text-xs", sm: "text-sm", md: "text-base", lg: "text-lg", xl: "text-xl" };
  const colors: Record<string, string> = { dimmed: "text-muted-foreground", red: "text-destructive", orange: "text-amber-600", green: "text-green-600", blue: "text-blue-600" };
  const fontSize = typeof fz === "number" ? `${fz}px` : undefined;
  const fzClass = typeof fz === "string" ? textSizes[fz as keyof typeof textSizes] : undefined;
  const paddingY = py ? ({ xs: "py-1", sm: "py-2", md: "py-4", lg: "py-6", xl: "py-8" }[py]) : undefined;
  const marginTop = typeof mt === "string" ? marginClass[mt] : undefined;
  const alignText = ta ? ({ left: "text-left", center: "text-center", right: "text-right" } as const)[ta] : undefined;
  const transformText = tt ? ({ uppercase: "uppercase", lowercase: "lowercase", capitalize: "capitalize" } as const)[tt] : undefined;
  const clampClass = lineClamp ? ({ 1: "line-clamp-1", 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4", 5: "line-clamp-5", 6: "line-clamp-6" } as const)[lineClamp as 1 | 2 | 3 | 4 | 5 | 6] : undefined;
  return createElement(component, {
    ...props,
    className: cn(fontSizes[size], fzClass, colors[c ?? ""], alignText, transformText, truncate && "truncate", clampClass, paddingY, marginTop, className),
    style: { ...style, ...(fontSize ? { fontSize } : {}), ...(typeof mt === "number" ? { marginTop: mt } : {}), ...(fw ? { fontWeight: fw } : {}), ...(lh ? { lineHeight: lh } : {}), ...(c && !colors[c] ? { color: c } : {}) },
  });
}

export function SimpleGrid({ cols = 1, spacing = "md", className, style, children, ...props }: LayoutProps & { cols?: number; spacing?: Gap; children?: ReactNode }) {
  return <div className={cn("grid grid-cols-1 sm:grid-cols-[repeat(var(--grid-cols),minmax(0,1fr))]", typeof spacing === "string" && gapClass[spacing], className)} style={{ ...style, ...(typeof spacing === "number" ? { gap: spacing } : {}), "--grid-cols": String(cols) } as React.CSSProperties} {...props}>{children}</div>;
}
