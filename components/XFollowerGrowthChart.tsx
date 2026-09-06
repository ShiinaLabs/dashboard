import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/domain/shared/ChartCard";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { calcYAxisWidth } from "@/lib/client/utils";
import type { TimelineData } from "@/lib/api";

interface Props {
  data: TimelineData["followerGrowth"];
}

export function XFollowerGrowthChart({ data }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const CHART_H = isMobile ? 180 : 250;
  const MARGIN = { top: 5, right: 5, left: 0, bottom: 5 };
  const hasTrend = data.length >= 2;

  return (
    <ChartCard title={t("xDetail.followerGrowth")}>
      {hasTrend ? (
          <div role="img" aria-label={t("xDetail.followerGrowthA11y")}>
            <ResponsiveContainer width="100%" height={CHART_H}>
              <AreaChart data={data} margin={MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={calcYAxisWidth(data, "followers_count")} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} />
                <Area type="monotone" dataKey="followers_count" stroke="var(--chart-3)" fill="color-mix(in oklch, var(--chart-3) 12%, transparent)" name={t("xDetail.followersCount")} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center text-xs text-[var(--muted-foreground)]" style={{ height: CHART_H }}>
            {t("xDetail.followerGrowthEmpty")}
          </div>
      )}
    </ChartCard>
  );
}
