import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  target?: number;
  action?: string;
  onConfirm: (token: string) => Promise<void>;
}

export function canConfirmToken(token: string | null, input: string, tokenLoading: boolean, tokenError: boolean): boolean {
  return token !== null && !tokenLoading && !tokenError && input.toLowerCase() === token.toLowerCase();
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, target, action = "delete", onConfirm }: ConfirmDialogProps) {
  const { t } = useTranslation();
  const label = confirmLabel ?? t("common.delete");
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadToken = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setToken(null);
      setInput("");
      setTokenError(false);
      setTokenLoading(true);
      try {
        const { token: nextToken } = await api.getConfirmToken(target ?? 0, action);
        if (!cancelled) {
          if (nextToken) setToken(nextToken);
          else setTokenError(true);
        }
      } catch {
        if (!cancelled) setTokenError(true);
      } finally {
        if (!cancelled) setTokenLoading(false);
      }
    };
    void loadToken();
    return () => { cancelled = true; };
  }, [open, target, action, retryToken]);

  const match = canConfirmToken(token, input, tokenLoading, tokenError);
  const handleConfirm = async () => {
    if (token === null || !match || loading) return;
    setLoading(true);
    try { await onConfirm(token); onOpenChange(false); } catch { setLoading(false); }
  };

  if (!open) return null;

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => {
      setInput("");
      setLoading(false);
      if (!nextOpen) {
        setToken(null);
        setTokenError(false);
        setTokenLoading(false);
      }
      onOpenChange(nextOpen);
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          {tokenLoading ? (
            <p role="status" className="text-center text-sm text-muted-foreground">{t("confirm.loadingCode")}</p>
          ) : tokenError ? (
            <div role="alert" className="flex items-center justify-between gap-3 text-sm text-destructive">
              <span>{t("confirm.codeLoadError")}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setRetryToken((value) => value + 1)}>{t("confirm.retry")}</Button>
            </div>
          ) : token !== null ? (
            <code aria-label={t("confirm.codeValue", { code: token })} className="block select-all rounded-md bg-muted px-4 py-3 text-center text-lg tracking-[0.2em]">{token}</code>
          ) : null}
          <Label htmlFor="confirm-token">{t("confirm.enterCode")}</Label>
          <Input id="confirm-token" value={input} onChange={(event) => setInput(event.currentTarget.value)} placeholder={t("confirm.enterCode")} disabled={tokenLoading || tokenError || token === null} autoFocus />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="destructive" onClick={(event) => { event.preventDefault(); void handleConfirm(); }} disabled={!match || loading}>
              {loading ? "…" : label}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
