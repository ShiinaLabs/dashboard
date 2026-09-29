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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { cn } from "@/lib/utils";

/**
 * Temporary migration adapters for legacy dashboard call sites.
 *
 * Do not use these APIs in new UI code. New code should consume shadcn
 * primitives directly.
 */

type ButtonVariant = "default" | "filled" | "light" | "subtle" | "outline" | "transparent" | "white" | "danger";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl" | "compact-xs";
type Spacing = "xs" | "sm" | "md" | "lg" | "xl" | number;
type ExtendedButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  color?: "danger" | "gray" | "primary";
  fullWidth?: boolean;
  justify?: "flex-start" | "center" | "flex-end" | "space-between";
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  loading?: boolean;
  mt?: Spacing;
  px?: Spacing;
  ml?: Spacing;
  radius?: "xs" | "sm" | "md" | "lg" | "xl" | "full";
};

const marginClasses: Record<Exclude<Spacing, number>, string> = { xs: "mt-1", sm: "mt-2", md: "mt-4", lg: "mt-6", xl: "mt-8" };
const paddingClasses: Record<Exclude<Spacing, number>, string> = { xs: "px-2", sm: "px-3", md: "px-4", lg: "px-6", xl: "px-8" };
const offsetClasses: Record<Exclude<Spacing, number>, string> = { xs: "ml-1", sm: "ml-2", md: "ml-4", lg: "ml-6", xl: "ml-8" };
const radiusClasses = { xs: "rounded-sm", sm: "rounded", md: "rounded-md", lg: "rounded-lg", xl: "rounded-xl", full: "rounded-full" } as const;

function spacingStyle(style: React.CSSProperties | undefined, mt?: Spacing, px?: Spacing, ml?: Spacing) {
  return {
    ...style,
    ...(typeof mt === "number" ? { marginTop: mt } : {}),
    ...(typeof px === "number" ? { paddingInline: px } : {}),
    ...(typeof ml === "number" ? { marginLeft: ml } : {}),
  };
}

function mapVariant(variant: ButtonVariant | undefined, color: "danger" | "gray" | "primary" | undefined) {
  if ((color === "danger" && variant !== "light") || variant === "danger") return "destructive" as const;
  if (variant === "filled") return "default" as const;
  if (variant === "light" || variant === "white") return "secondary" as const;
  if (variant === "subtle" || variant === "transparent") return "ghost" as const;
  if (color === "gray" && variant === "default") return "secondary" as const;
  return variant === "outline" ? "outline" as const : "default" as const;
}

export function Button({ variant = "default", size = "md", color, fullWidth, justify, leftSection, rightSection, loading, mt, px, ml, radius, className, disabled, children, style, ...props }: ExtendedButtonProps) {
  const sizeMap = { xs: "sm", "compact-xs": "sm", sm: "sm", md: "default", lg: "lg", xl: "lg" } as const;
  const xlSizeClass = size === "xl" ? "h-14 px-8 text-lg" : undefined;
  const justifyClass = justify === "flex-start" ? "justify-start" : justify === "flex-end" ? "justify-end" : justify === "space-between" ? "justify-between" : justify === "center" ? "justify-center" : undefined;
  const dangerLight = color === "danger" && variant === "light" ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : undefined;
  return (
    <ShadcnButton
      variant={mapVariant(variant, color)}
      size={sizeMap[size]}
      className={cn(fullWidth && "w-full", justifyClass, size === "compact-xs" && "h-7 px-2 text-xs", xlSizeClass, typeof mt === "string" && marginClasses[mt], typeof px === "string" && paddingClasses[px], typeof ml === "string" && offsetClasses[ml], radius && radiusClasses[radius], dangerLight, className)}
      style={spacingStyle(style, mt, px, ml)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : leftSection}
      {children}
      {rightSection}
    </ShadcnButton>
  );
}

type ActionIconProps = Omit<ExtendedButtonProps, "fullWidth" | "justify" | "leftSection" | "rightSection" | "loading" | "mt" | "px">;
export function ActionIcon({ children, className, variant = "subtle", color, size = "md", radius, ml, style, ...props }: ActionIconProps) {
  const scale = size === "xs" || size === "compact-xs" ? "size-7" : size === "sm" ? "size-8" : size === "lg" ? "size-10" : size === "xl" ? "size-14" : "size-9";
  const dangerLight = color === "danger" && variant === "light" ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : undefined;
  return <ShadcnButton variant={mapVariant(variant, color)} size="icon" className={cn(scale, radius && radiusClasses[radius], typeof ml === "string" && offsetClasses[ml], dangerLight, className)} style={spacingStyle(style, undefined, undefined, ml)} {...props}>{children}</ShadcnButton>;
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
        <Input ref={ref} id={inputId} className={cn(size === "xs" && "h-8 text-xs", size === "sm" && "h-9", size === "lg" && "h-11", leftSection && "pl-9", rightSection && "pr-9", className)} style={styles?.input} aria-invalid={Boolean(error)} {...props} />
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
  const toggle = <button type="button" className="rounded p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label={visible ? t("common.hidePassword", { defaultValue: "Hide password" }) : t("common.showPassword", { defaultValue: "Show password" })} onClick={() => setVisible((value) => !value)}>{visibilityToggleIcon ? visibilityToggleIcon({ reveal: visible }) : visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>;
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
export function SegmentedControl({ data, value, onChange, fullWidth, ...props }: { data: SelectOption[]; value: string; onChange: (value: string) => void; fullWidth?: boolean; "aria-label"?: string }) {
  const options = data.map((item) => typeof item === "string" ? { value: item, label: item } : item);
  return <div role="group" aria-label={props["aria-label"]} className={cn("inline-flex rounded-lg border bg-muted p-1", fullWidth && "w-full")}>
    {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} disabled={typeof option !== "string" && option.disabled} onClick={() => onChange(option.value)} className={cn("min-h-8 rounded-md px-3 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50", fullWidth && "flex-1", value === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>)}
  </div>;
}

const allPaddingClasses: Record<Exclude<Spacing, number>, string> = { xs: "p-2", sm: "p-3", md: "p-4", lg: "p-6", xl: "p-8" };
const inlineMarginClasses: Record<Exclude<Spacing, number>, string> = { xs: "mx-1", sm: "mx-2", md: "mx-4", lg: "mx-6", xl: "mx-8" };

export function Alert({ children, color, icon, title, variant = "default", p, mx, mb, className, style }: {
  children: ReactNode; color?: "danger" | "red" | "success" | "yellow"; icon?: ReactNode; title?: ReactNode;
  variant?: "default" | "light"; p?: Spacing; mx?: Spacing; mb?: Spacing; className?: string; style?: React.CSSProperties;
}) {
  const isError = color === "danger" || color === "red";
  const toneClass = isError && variant === "light" ? "border-transparent bg-destructive/10 text-destructive"
    : color === "success" ? "border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-300"
    : color === "yellow" ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
      : variant === "light" ? "border-transparent bg-muted text-foreground" : undefined;
  return <ShadcnAlert variant={isError ? "destructive" : "default"} className={cn(toneClass, typeof p === "string" && allPaddingClasses[p], typeof mx === "string" && inlineMarginClasses[mx], typeof mb === "string" && marginClasses[mb], className)} style={{ ...style, ...(typeof p === "number" ? { padding: p } : {}), ...(typeof mx === "number" ? { marginInline: mx } : {}), ...(typeof mb === "number" ? { marginBottom: mb } : {}) }}>{icon}{title && <AlertTitle>{title}</AlertTitle>}<AlertDescription>{children}</AlertDescription></ShadcnAlert>;
}

export function Modal({ opened, onClose, title, children, size = "md" }: { opened: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  const sizeClass = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" }[size];
  return <Dialog open={opened} onOpenChange={(open) => !open && onClose()}><DialogContent className={sizeClass}><DialogHeader>{title && <DialogTitle>{title}</DialogTitle>}</DialogHeader>{children}</DialogContent></Dialog>;
}

export { notifications } from "./notifications";
