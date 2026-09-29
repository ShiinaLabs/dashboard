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

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, target, action = "delete", onConfirm }: ConfirmDialogProps) {
  const { t } = useTranslation();
  const label = confirmLabel ?? t("common.delete");
  const [token, setToken] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.getConfirmToken(target ?? 0, action).then(({ token: nextToken }) => setToken(nextToken)).catch(() => setToken("ERROR"));
  }, [open, target, action]);

  const match = input.toLowerCase() === token.toLowerCase();
  const handleConfirm = async () => {
    if (!match || loading) return;
    setLoading(true);
    try { await onConfirm(token); onOpenChange(false); } catch { setLoading(false); }
  };

  if (!open) return null;

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) { setInput(""); setLoading(false); }
      onOpenChange(nextOpen);
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <code className="block select-all rounded-md bg-muted px-4 py-3 text-center text-lg tracking-[0.2em]">{token}</code>
          <Label htmlFor="confirm-token">{t("confirm.enterCode")}</Label>
          <Input id="confirm-token" value={input} onChange={(event) => setInput(event.currentTarget.value)} placeholder={t("confirm.enterCode")} autoFocus />
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
