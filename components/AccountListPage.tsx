import { useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, type Account } from "@/lib/api";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Skeleton } from "./Skeleton";
import { formatDateTime } from "@/lib/client/datetime";
import { useNow } from "@/lib/client/use-now";
import { AlertCircle, ArrowUpRight } from "lucide-react";

export interface AccountListPageProps {
  platform: "twitter" | "github" | "gitlab" | "reddit";
  heading: string;
  description: string | ((count: number) => string);
  icon: React.ComponentType<{ size?: number }>;
  emptyIcon?: React.ReactNode;
  emptyText: string;
  renderHeader?: () => React.ReactNode;
  renderBadge?: (account: Account) => React.ReactNode;
  renderMeta?: (account: Account) => React.ReactNode;
  formatUsername?: (account: Account) => string;
  cardBorderAccent?: string;
}

const PLATFORM_PREFIX: Record<string, string> = {
  twitter: "x",
  github: "github",
  gitlab: "gitlab",
  reddit: "reddit",
};

export default function AccountListPage({
  platform,
  heading,
  description,
  icon: Icon,
  emptyIcon,
  emptyText,
  renderHeader,
  renderBadge,
  renderMeta,
  formatUsername,
  cardBorderAccent,
}: AccountListPageProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: api.getAccounts,
    refetchInterval: 3 * 60_000,
  });

  const accounts = (data?.accounts || []).filter((a: Account) => a.platform === platform);
  const now = useNow();

  const staleMap = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const a of accounts) {
      const last = a.last_fetched_at ? new Date(a.last_fetched_at).getTime() : 0;
      map.set(a.id, last > 0 && (now - last) > 90 * 60 * 1000 /* L1 auto 90m */);
    }
    return map;
  }, [accounts, now]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded" />
          <div><Skeleton className="h-6 w-24 mb-1" /><Skeleton className="h-3 w-40" /></div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-28 mb-2" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const urlPrefix = PLATFORM_PREFIX[platform];
  const i18nKey = urlPrefix;

  return (
    <div className="space-y-6">
      {/* header — icon + heading + description only, no add button */}
      <div className="flex items-center gap-3">
        <Icon size={24} />
        <div>
          <h2 className="text-xl font-semibold">{heading}</h2>
          <p className="text-sm text-[var(--muted-foreground)]">{typeof description === "function" ? description(accounts.length) : description}</p>
        </div>
      </div>

      {renderHeader?.()}

      <div>
        <h3 className="text-sm font-semibold mb-3">
          {accounts.length > 0 ? t(`${i18nKey}.configuredAccounts`) : t(`${i18nKey}.noAccounts`)}
        </h3>
        {accounts.length > 0 ? (
          <div className="space-y-3">
            {accounts.map((account: Account) => {
              const lastFetched = account.last_fetched_at ? new Date(account.last_fetched_at) : null;
              const isStale = staleMap.get(account.id) ?? false;

              return (
                <Link
                  key={account.id}
                  to={`/${urlPrefix}/${account.id}`}
                  className="block"
                >
                <Card
                  className={
                    "group border-l-2 " +
                    (!account.is_active ? "opacity-60 " : "") +
                    "cursor-pointer transition-all duration-200 hover:shadow-sm"
                  }
                  style={cardBorderAccent ? {
                    borderLeftColor: `color-mix(in oklch, ${cardBorderAccent} 30%, transparent)`,
                  } as React.CSSProperties : {
                    borderLeftColor: "transparent",
                  } as React.CSSProperties}
                >
                   <div className="account-card-content">
                    <div className="mobile-account-card gap-4">
                      <div className="account-card-main">
                        <div className="account-card-header">
                          <span className="font-semibold text-base">
                            {formatUsername ? formatUsername(account) : account.screen_name}
                          </span>
                          <ArrowUpRight size={14} className="text-[var(--muted-foreground)] hover-reveal-icon" />
                          {renderBadge?.(account)}
                          {!account.is_active && <Badge>{t("badge.inactive")}</Badge>}
                          {account.error_message && (
                            <Badge className="bg-[var(--danger)]/10 text-[var(--danger)]">
                              {t("badge.error")}
                            </Badge>
                          )}
                          {isStale && account.is_active ? (
                            <Badge className="bg-[var(--warn)]/10 text-[var(--warn)]">
                              {t("badge.stale")}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="account-card-meta text-sm text-[var(--muted-foreground)]">
                          <span>{t("settings.autoSchedule")}</span>
                          {lastFetched && (
                            <span>{t(`${i18nKey}.accountCard.last`, { date: formatDateTime(lastFetched) })}</span>
                          )}
                          {renderMeta?.(account)}
                        </div>
                        {account.error_message && (
                          <div className="account-card-error text-xs text-[var(--danger)]">
                            <AlertCircle size={12} /> {account.error_message}
                          </div>
                        )}
                      </div>
                      {/* No action buttons — management is only on /accounts page */}
                    </div>
                   </div>
                </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 pt-8 sm:p-8 sm:pt-8 text-center">
              <div className="flex flex-col items-center gap-3">
                {emptyIcon ?? <Icon size={32} />}
                <p className="text-sm text-[var(--muted-foreground)]">{emptyText}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
