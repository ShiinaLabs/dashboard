import { cn } from "@/lib/utils";

type SelectOption = string | { value: string; label: string; disabled?: boolean };

export function SegmentedControl({ data, value, onChange, fullWidth, ...props }: { data: SelectOption[]; value: string; onChange: (value: string) => void; fullWidth?: boolean; "aria-label"?: string }) {
  const options = data.map((item) => typeof item === "string" ? { value: item, label: item } : item);
  return <div role="group" aria-label={props["aria-label"]} className={cn("inline-flex rounded-lg border bg-muted p-1", fullWidth && "w-full")}>
    {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} disabled={typeof option !== "string" && option.disabled} onClick={() => onChange(option.value)} className={cn("min-h-8 rounded-md px-3 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50", fullWidth && "flex-1", value === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>)}
  </div>;
}
