import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button, Code, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { api } from "@/lib/api";

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
    if (open) {
      void (() => {
        setInput("");
        setLoading(false);
      })();
      api.getConfirmToken(target ?? 0, action).then(({ token }) => setToken(token)).catch(() => setToken("ERROR"));
    }
  }, [open, target, action]);

  const match = input.toLowerCase() === token.toLowerCase();

  const handleConfirm = async () => {
    if (!match || loading) return;
    setLoading(true);
    try {
      await onConfirm(token);
      onOpenChange(false);
    } catch {
      setLoading(false);
    }
  };

  return (
    <Modal opened={open} onClose={() => onOpenChange(false)} title={title} centered withCloseButton={false}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">{description}</Text>
        <Code block ta="center" fz="lg" style={{ letterSpacing: "0.2em", userSelect: "all" }}>{token}</Code>
        <TextInput
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          placeholder={t("confirm.enterCode")}
          autoFocus
          aria-label={t("confirm.enterCode")}
        />
        <Group justify="flex-end" grow visibleFrom="xs">
          <Button variant="default" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button color="danger" onClick={handleConfirm} disabled={!match || loading} loading={loading}>{label}</Button>
        </Group>
        <Group grow hiddenFrom="xs">
          <Button variant="default" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button color="danger" onClick={handleConfirm} disabled={!match || loading} loading={loading}>{label}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
