import { useQuery } from "@tanstack/react-query";
import { Eye, MousePointerClick, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MetricCard, MetricCardSkeleton } from "@/components/domain/shared/MetricCard";
import { MetricGrid } from "@/components/domain/shared/MetricGrid";
import { api } from "@/lib/api";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";

const titleKey = "nav.analytics" satisfies PageTitleKey;
export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

export default function WebAnalyticsPage() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useQuery({
    queryKey: ["analytics", "overview", "7d"],
    queryFn: api.getAnalyticsOverview,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("analytics.heading")}</h1>
        <p className="text-sm text-muted-foreground">{t("analytics.period")}</p>
      </header>

      {isPending ? (
        <MetricGrid columns="three">
          {Array.from({ length: 3 }, (_, index) => <MetricCardSkeleton key={index} />)}
        </MetricGrid>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>{t("analytics.loadErrorTitle")}</AlertTitle>
          <AlertDescription>{t("analytics.loadErrorDescription")}</AlertDescription>
        </Alert>
      ) : data ? (
        <MetricGrid columns="three">
          <MetricCard icon={<Eye />} label={t("analytics.views")} value={data.views} />
          <MetricCard icon={<UsersRound />} label={t("analytics.visitors")} value={data.visitors} />
          <MetricCard icon={<MousePointerClick />} label={t("analytics.visits")} value={data.visits} />
        </MetricGrid>
      ) : null}
    </div>
  );
}
