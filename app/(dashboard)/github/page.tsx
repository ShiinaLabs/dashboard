import { useTranslation } from "react-i18next";
import AccountListPage from "@/components/AccountListPage";
import { GithubIcon } from "@/components/BrandIcons";
import { Badge } from "@/components/ui/badge";
import { Star, GitFork, Users, BookOpen } from "lucide-react";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";

const titleKey = "nav.github" satisfies PageTitleKey;

export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

export default function GitHub() {
  const { t } = useTranslation();

  return (
    <AccountListPage
      platform="github"
      heading={t("github.heading")}
      description={(count) =>
        count > 0 ? t("github.accounts_other", { count }) : t("github.description")
      }
      icon={GithubIcon}
      emptyIcon={<GithubIcon size={32} />}
      emptyText={t("github.emptyState")}
      renderBadge={() => (
        <Badge className="bg-[var(--chart-1)]/15 text-[var(--chart-1)] font-medium">
          {t("badge.github")}
        </Badge>
      )}
      renderHeader={() => (
        <div>
          <h3 className="text-sm font-semibold mb-3">{t("github.whatYouCanTrack")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <Star size={20} className="text-[var(--muted-foreground)] mb-2" />
              <p className="text-sm font-medium">{t("github.preview.stars")}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{t("github.preview.starsDesc")}</p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <GitFork size={20} className="text-[var(--muted-foreground)] mb-2" />
              <p className="text-sm font-medium">{t("github.preview.forks")}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{t("github.preview.forksDesc")}</p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <Users size={20} className="text-[var(--muted-foreground)] mb-2" />
              <p className="text-sm font-medium">{t("github.preview.followerGrowth")}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{t("github.preview.followerGrowthDesc")}</p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <BookOpen size={20} className="text-[var(--muted-foreground)] mb-2" />
              <p className="text-sm font-medium">{t("github.preview.languages")}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{t("github.preview.languagesDesc")}</p>
            </div>
          </div>
        </div>
      )}
    />
  );
}
