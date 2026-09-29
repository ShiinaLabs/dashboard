import { useTranslation } from "react-i18next";
import { type Account } from "@/lib/api";
import AccountListPage from "@/components/AccountListPage";
import { GitlabIcon } from "@/components/BrandIcons";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";

const titleKey = "nav.gitlab" satisfies PageTitleKey;

export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

import { Badge } from "@/components/ui/badge";
import { Star, GitFork, Users, BookOpen } from "lucide-react";

export default function GitLab() {
  const { t } = useTranslation();

  return (
    <AccountListPage
      platform="gitlab"
      heading={t("gitlab.heading")}
      description={(count) =>
        count > 0 ? t("gitlab.accounts_other", { count }) : t("gitlab.description")
      }
      icon={GitlabIcon}
      emptyIcon={<GitlabIcon size={32} />}
      emptyText={t("gitlab.emptyState")}
      renderBadge={() => (
        <Badge className="text-[11px] px-1.5 bg-[var(--chart-4)]/15 text-[var(--chart-4)]">{t("badge.gitlab")}</Badge>
      )}
      renderMeta={(account: Account) => {
        const instanceLabel = account.instance_url
          ? new URL(account.instance_url).hostname
          : "gitlab.com";
        return (
          <span className="text-[11px] text-[var(--muted-foreground)]">{instanceLabel}</span>
        );
      }}
      renderHeader={() => (
        <div>
          <h3 className="text-sm font-semibold mb-3">{t("gitlab.whatYouCanTrack")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <Star size={20} className="text-[var(--muted-foreground)] mb-2" />
              <p className="text-sm font-medium">{t("gitlab.preview.stars")}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{t("gitlab.preview.starsDesc")}</p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <GitFork size={20} className="text-[var(--muted-foreground)] mb-2" />
              <p className="text-sm font-medium">{t("gitlab.preview.forks")}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{t("gitlab.preview.forksDesc")}</p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <Users size={20} className="text-[var(--muted-foreground)] mb-2" />
              <p className="text-sm font-medium">{t("gitlab.preview.followerGrowth")}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{t("gitlab.preview.followerGrowthDesc")}</p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <BookOpen size={20} className="text-[var(--muted-foreground)] mb-2" />
              <p className="text-sm font-medium">{t("gitlab.preview.languages")}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{t("gitlab.preview.languagesDesc")}</p>
            </div>
          </div>
        </div>
      )}
    />
  );
}
