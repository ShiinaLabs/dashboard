import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";
import { api } from "@/lib/api";
import { getPlatformFetchLevels } from "@/lib/application/scheduler/fetchPolicy";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Which trigger levels a platform supports. Sourced from the shared
// fetchPolicy table so the UI can never offer a level the backend cannot run.
// "all" is a synthetic option meaning "run every supported level".
// Detail-page label namespace is derived from the platform so the button text
// localizes correctly on every platform, not just github.

const DETAIL_NAMESPACES: Record<string, string> = {
  github: "githubDetail",
  gitlab: "gitlabDetail",
  reddit: "redditDetail",
  twitter: "xDetail",
};

export function TriggerPanel({ accountId, platform = "github" }: { accountId: number; platform?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const levels = ["all", ...getPlatformFetchLevels(platform)];
  const [level, setLevel] = useState<string>("all");
  const ns = DETAIL_NAMESPACES[platform] ?? "githubDetail";

  const trigger = useMutation({
    mutationFn: () => api.triggerFetch(accountId, level),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  return (
    // stopPropagation so a trigger click doesn't bubble into a parent card's navigation
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Select value={level} onValueChange={setLevel}>
        <SelectTrigger aria-label={t("fetchLevel.select")}><SelectValue /></SelectTrigger>
        <SelectContent>{levels.map((fetchLevel) => <SelectItem key={fetchLevel} value={fetchLevel}>{t(`fetchLevel.${fetchLevel}.label`)}</SelectItem>)}</SelectContent>
      </Select>
      <Button
        onClick={() => trigger.mutate()}
        disabled={trigger.isPending}
        variant="secondary"
        size="sm"
      >
        <Play size={12} aria-hidden="true" />
        {trigger.isPending ? t(`${ns}.fetching`) : t(`${ns}.fetchNow`)}
      </Button>
    </div>
  );
}
