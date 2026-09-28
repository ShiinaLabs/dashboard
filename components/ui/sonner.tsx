import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/components/useTheme";

export function Toaster(props: ToasterProps) {
  const { settings } = useTheme();

  return (
    <Sonner
      theme={settings.mode}
      className="toaster group [&_div[data-content]]:w-full"
      style={{
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
      } as React.CSSProperties}
      {...props}
    />
  );
}
