import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pause, Play } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";

// Toggles whether an account is active (fetching enabled). Uses an explicit
// pause/play icon + label instead of the old ambiguous RefreshCw glyph.
export function AccountActiveButton({ accountId, isActive }: { accountId: number; isActive: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => api.updateAccount(accountId, { isActive: !isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["account", accountId] }),
  });
  return (
    <Button
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      variant="light"
      color="gray"
      size="sm"
      leftSection={isActive ? <Pause size={14} /> : <Play size={14} />}
      title={isActive ? t("accountActive.pause") : t("accountActive.resume")}
      aria-label={isActive ? t("accountActive.pause") : t("accountActive.resume")}
    >
      {isActive ? t("accountActive.pause") : t("accountActive.resume")}
    </Button>
  );
}
