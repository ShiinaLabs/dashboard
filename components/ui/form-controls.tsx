import { forwardRef, useState, type ChangeEvent, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button as ShadcnButton } from "./button";
import { Input } from "./input";
import { Textarea as ShadcnTextarea } from "./textarea";
import { Label } from "./label";
import { Checkbox as ShadcnCheckbox } from "./checkbox";
import { Switch as ShadcnSwitch } from "./switch";
import { Alert as ShadcnAlert, AlertDescription, AlertTitle } from "./alert";
import { Select as ShadcnSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./sheet";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "filled" | "light" | "subtle" | "outline" | "transparent" | "white" | "danger";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl" | "compact-xs";
type ExtendedButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  color?: string;
  fullWidth?: boolean;
  justify?: string;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  loading?: boolean;
  mt?: string | number;
  px?: string | number;
  ml?: string | number;
  radius?: string;
};

function mapVariant(variant: ButtonVariant | undefined, color: string | undefined) {
  if (color === "danger" || variant === "danger") return "destructive" as const;
  if (variant === "filled") return "default" as const;
  if (variant === "light" || variant === "white") return "secondary" as const;
  if (variant === "subtle" || variant === "transparent") return "ghost" as const;
  if (color === "gray" && variant === "default") return "secondary" as const;
  return variant === "outline" ? "outline" as const : "default" as const;
}

export function Button({ variant = "default", size = "md", color, fullWidth, justify, leftSection, rightSection, loading, mt, px, ml, radius, className, disabled, children, ...props }: ExtendedButtonProps) {
  const sizeMap = { xs: "sm", "compact-xs": "sm", sm: "sm", md: "default", lg: "lg", xl: "lg" } as const;
  return (
    <ShadcnButton
      variant={mapVariant(variant, color)}
      size={sizeMap[size]}
      className={cn(fullWidth && "w-full", justify === "flex-start" && "justify-start", size === "compact-xs" && "h-7 px-2 text-xs", mt && (typeof mt === "number" ? `mt-[${mt}px]` : `mt-${mt}`), px && (typeof px === "number" ? `px-[${px}px]` : `px-${px}`), ml && (typeof ml === "number" ? `ml-[${ml}px]` : `ml-${ml}`), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : leftSection}
      {children}
      {rightSection}
    </ShadcnButton>
  );
}

export function ActionIcon({ children, className, variant = "subtle", color, size = "md", radius, ml, ...props }: ExtendedButtonProps) {
  const scale = size === "xs" || size === "compact-xs" ? "size-7" : size === "sm" ? "size-8" : size === "lg" ? "size-10" : size === "xl" ? "size-14" : "size-9";
  return <ShadcnButton variant={mapVariant(variant, color)} size="icon" className={cn(scale, radius === "xl" && "rounded-full", ml && (typeof ml === "number" ? `ml-[${ml}px]` : `ml-${ml}`), className)} {...props}>{children}</ShadcnButton>;
}

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "xs" | "sm" | "md" | "lg";
  label?: string;
  description?: ReactNode;
  error?: ReactNode;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  styles?: { input?: React.CSSProperties };
  visibilityToggleIcon?: (args: { reveal: boolean }) => ReactNode;
}

const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, description, error, leftSection, rightSection, id, className, size = "md", styles, visibilityToggleIcon: _visibilityToggleIcon, ...props }, ref) {
  const inputId = id ?? props.name;
  return (
    <div className="grid gap-1.5">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <div className="relative">
        {leftSection && <span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground">{leftSection}</span>}
        <Input ref={ref} id={inputId} className={cn(size === "xs" && "h-8 text-xs", size === "lg" && "h-11", leftSection && "pl-9", rightSection && "pr-9", className)} style={styles?.input} aria-invalid={Boolean(error)} {...props} />
        {rightSection && <span className="absolute inset-y-0 right-3 flex items-center text-muted-foreground">{rightSection}</span>}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
});

export const TextInput = Field;
export const PasswordInput = forwardRef<HTMLInputElement, FieldProps>(function PasswordInput({ visibilityToggleIcon, rightSection, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  const toggle = <button type="button" tabIndex={-1} className="rounded p-1 hover:bg-muted" aria-label={visible ? t("common.hidePassword", { defaultValue: "Hide password" }) : t("common.showPassword", { defaultValue: "Show password" })} onClick={() => setVisible((value) => !value)}>{visibilityToggleIcon ? visibilityToggleIcon({ reveal: visible }) : visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>;
  return <Field ref={ref} type={visible ? "text" : "password"} rightSection={rightSection ?? toggle} {...props} />;
});

export function Textarea(props: React.ComponentProps<typeof ShadcnTextarea> & { label?: string; error?: ReactNode }) {
  const { label, error, id, className, ...rest } = props;
  return <div className="grid gap-1.5">{label && <Label htmlFor={id}>{label}</Label>}<ShadcnTextarea id={id} className={className} aria-invalid={Boolean(error)} {...rest} />{error && <p className="text-xs text-destructive">{error}</p>}</div>;
}

export function Checkbox({ checked, defaultChecked, onChange, label, ...props }: Omit<React.ComponentProps<typeof ShadcnCheckbox>, "onCheckedChange" | "onChange"> & { onChange?: (event: ChangeEvent<HTMLInputElement>) => void; label?: ReactNode }) {
  return <label className="inline-flex items-center gap-2"><ShadcnCheckbox checked={checked} defaultChecked={defaultChecked} onCheckedChange={(value) => onChange?.({ currentTarget: { checked: value === true } } as ChangeEvent<HTMLInputElement>)} {...props} />{label}</label>;
}

export function Switch({ checked, defaultChecked, onChange, ...props }: Omit<React.ComponentProps<typeof ShadcnSwitch>, "onCheckedChange"> & { onChange?: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <ShadcnSwitch checked={checked} defaultChecked={defaultChecked} onCheckedChange={(value) => onChange?.({ currentTarget: { checked: value } } as ChangeEvent<HTMLInputElement>)} {...props} />;
}

type SelectOption = string | { value: string; label: string; disabled?: boolean };
export function SelectField({ data = [], value, defaultValue, onChange, label, name, placeholder, className, ...props }: {
  data?: SelectOption[]; value?: string | null; defaultValue?: string; onChange?: (value: string | null) => void; label?: string; name?: string; placeholder?: string; className?: string;
  searchable?: boolean; clearable?: boolean; size?: string; radius?: string; disabled?: boolean; required?: boolean; "aria-label"?: string;
}) {
  const options = data.map((item) => typeof item === "string" ? { value: item, label: item } : item);
  return (
    <div className="grid gap-1.5">
      {label && <Label>{label}</Label>}
      <ShadcnSelect value={value ?? undefined} defaultValue={defaultValue} onValueChange={(next) => onChange?.(next)}>
        <SelectTrigger name={name} className={className} aria-label={props["aria-label"]} disabled={props.disabled}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectContent>
      </ShadcnSelect>
    </div>
  );
}

export function SegmentedControl({ data, value, onChange, fullWidth, ...props }: { data: SelectOption[]; value: string; onChange: (value: string) => void; fullWidth?: boolean; radius?: string; size?: string; "aria-label"?: string }) {
  const options = data.map((item) => typeof item === "string" ? { value: item, label: item } : item);
  return <div role="group" aria-label={props["aria-label"]} className={cn("inline-flex rounded-lg border bg-muted p-1", fullWidth && "w-full")}>
    {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={cn("min-h-8 rounded-md px-3 text-sm transition-colors", fullWidth && "flex-1", value === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>)}
  </div>;
}

export function Alert({ children, color, icon, title, className }: { children: ReactNode; color?: string; icon?: ReactNode; title?: ReactNode; variant?: string; p?: string; mx?: string; mb?: string; className?: string }) {
  const isError = color === "danger" || color === "red";
  return <ShadcnAlert variant={isError ? "destructive" : "default"} className={cn(color === "success" && "border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-300", color === "yellow" && "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300", className)}>{icon}{title && <AlertTitle>{title}</AlertTitle>}<AlertDescription>{children}</AlertDescription></ShadcnAlert>;
}

export function Modal({ opened, onClose, title, children, size = "md" }: { opened: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; size?: string; centered?: boolean; withCloseButton?: boolean }) {
  return <Dialog open={opened} onOpenChange={(open) => !open && onClose()}><DialogContent className={cn(size === "lg" && "max-w-3xl")}><DialogHeader>{title && <DialogTitle>{title}</DialogTitle>}</DialogHeader>{children}</DialogContent></Dialog>;
}

export function Drawer({ opened, onClose, children, position = "right", size = 320, title }: { opened: boolean; onClose: () => void; children: ReactNode; position?: "left" | "right" | "top" | "bottom"; size?: number | string; title?: ReactNode; withCloseButton?: boolean }) {
  return <Sheet open={opened} onOpenChange={(open) => !open && onClose()}><SheetContent side={position} style={{ width: typeof size === "number" ? size : undefined }}><SheetHeader>{title && <SheetTitle>{title}</SheetTitle>}</SheetHeader>{children}</SheetContent></Sheet>;
}

export function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const { label, className, id, children, ...rest } = props;
  return <div className="grid gap-1.5">{label && <Label htmlFor={id}>{label}</Label>}<select id={id} className={cn("h-9 w-full rounded-md border border-input bg-background px-3 text-sm", className)} {...rest}>{children}</select></div>;
}

export function AlertBox(props: React.ComponentProps<typeof ShadcnAlert>) { return <ShadcnAlert {...props} />; }
export function Code({ children, block, className, ...props }: React.HTMLAttributes<HTMLElement> & { block?: boolean }) { return <code className={cn("rounded bg-muted px-1 py-0.5 font-mono text-sm", block && "block p-3 text-center", className)} {...props}>{children}</code>; }
export function Divider(props: React.HTMLAttributes<HTMLHRElement>) { return <hr className={cn("border-border", props.className)} {...props} />; }

export { SelectField as Select };
export { notifications } from "./notifications";
