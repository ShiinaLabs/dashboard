import { createElement, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Gap = number | "xs" | "sm" | "md" | "lg" | "xl";
const gapClass: Record<string, string> = { xs: "gap-1", sm: "gap-2", md: "gap-4", lg: "gap-6", xl: "gap-8" };
function gapValue(gap: Gap) { return typeof gap === "number" ? `${gap}px` : undefined; }

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

function layoutClass(align?: LayoutProps["align"], justify?: LayoutProps["justify"], wrap?: LayoutProps["wrap"], grow?: boolean, hiddenFrom?: LayoutProps["hiddenFrom"], visibleFrom?: LayoutProps["visibleFrom"], mt?: Gap) {
  return cn(
    align && `items-${align === "flex-start" ? "start" : align === "flex-end" ? "end" : align}`,
    justify && `justify-${justify === "flex-start" ? "start" : justify === "flex-end" ? "end" : justify}`,
    wrap === "nowrap" && "flex-nowrap",
    (wrap === true || wrap === "wrap") && "flex-wrap",
    grow && "flex-1",
    hiddenFrom && ({ xs: "sm:hidden", sm: "md:hidden", md: "lg:hidden", lg: "xl:hidden" }[hiddenFrom]),
    visibleFrom && ({ xs: "hidden sm:flex", sm: "hidden md:flex", md: "hidden lg:flex", lg: "hidden xl:flex" }[visibleFrom]),
    mt && (typeof mt === "number" ? `mt-[${mt}px]` : `mt-${mt === "xs" ? 1 : mt === "sm" ? 2 : mt === "md" ? 4 : mt === "lg" ? 6 : 8}`),
  );
}

export function Group({ gap = "sm", align = "center", justify, wrap = true, grow, hiddenFrom, visibleFrom, mt, className, style, ...rest }: LayoutProps) {
  return <div className={cn("flex", gapClass[gap], layoutClass(align, justify, wrap, grow, hiddenFrom, visibleFrom, mt), className)} style={{ ...style, ...(gapValue(gap) ? { gap: gapValue(gap) } : {}) }} {...rest} />;
}

export function Stack({ gap = "md", align, justify, grow, hiddenFrom, visibleFrom, mt, className, style, ...rest }: LayoutProps) {
  return <div className={cn("flex flex-col", gapClass[gap], layoutClass(align, justify, undefined, grow, hiddenFrom, visibleFrom, mt), className)} style={{ ...style, ...(gapValue(gap) ? { gap: gapValue(gap) } : {}) }} {...rest} />;
}

type TextProps = HTMLAttributes<HTMLElement> & {
  component?: ElementType;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  fz?: string | number;
  fw?: number;
  c?: "dimmed" | "red" | "orange" | "green" | "blue" | string;
  ta?: "left" | "center" | "right";
  lh?: number | string;
  tt?: "uppercase" | "lowercase" | "capitalize";
  truncate?: boolean;
  lineClamp?: number;
  py?: "xs" | "sm" | "md" | "lg" | "xl";
  mt?: Gap;
  children?: ReactNode;
};

export function Text({ component = "p", size = "md", fz, fw, c, ta, lh, tt, truncate, lineClamp, py, mt, className, style, ...props }: TextProps) {
  const fontSizes = { xs: "text-xs", sm: "text-sm", md: "text-base", lg: "text-lg", xl: "text-xl" };
  const colors: Record<string, string> = { dimmed: "text-muted-foreground", red: "text-destructive", orange: "text-amber-600", green: "text-green-600", blue: "text-blue-600" };
  const fontSize = typeof fz === "number" ? `${fz}px` : undefined;
  const paddingY = py ? ({ xs: "py-1", sm: "py-2", md: "py-4", lg: "py-6", xl: "py-8" }[py]) : undefined;
  const marginTop = mt ? (typeof mt === "number" ? `mt-[${mt}px]` : `mt-${mt === "xs" ? 1 : mt === "sm" ? 2 : mt === "md" ? 4 : mt === "lg" ? 6 : 8}`) : undefined;
  return createElement(component, {
    ...props,
    className: cn(fontSizes[size], colors[c ?? ""], ta && `text-${ta}`, tt, truncate && "truncate", lineClamp && `line-clamp-${lineClamp}`, paddingY, marginTop, className),
    style: { ...style, ...(fontSize ? { fontSize } : {}), ...(fw ? { fontWeight: fw } : {}), ...(lh ? { lineHeight: lh } : {}), ...(c && !colors[c] ? { color: c } : {}) },
  });
}

export function SimpleGrid({ cols = 1, spacing = "md", className, style, children, ...props }: LayoutProps & { cols?: number; spacing?: Gap; children?: ReactNode }) {
  return <div className={cn("grid grid-cols-1 sm:grid-cols-[repeat(var(--grid-cols),minmax(0,1fr))]", gapClass[spacing], className)} style={{ ...style, "--grid-cols": String(cols) } as React.CSSProperties} {...props}>{children}</div>;
}
