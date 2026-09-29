import { useTranslation } from "react-i18next";
import { type Account } from "@/lib/api";
import AccountListPage from "@/components/AccountListPage";
import { RedditIcon } from "@/components/BrandIcons";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, TrendingUp, ThumbsUp } from "lucide-react";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";

const titleKey = "nav.reddit" satisfies PageTitleKey;

export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

export default function Reddit() {
  const { t } = useTranslation();

  return (
    <AccountListPage
      platform="reddit"
      heading={t("reddit.heading")}
      description={(count) =>
        count > 0 ? t("reddit.accounts_other", { count }) : t("reddit.description")
      }
      icon={RedditIcon}
      emptyIcon={<RedditIcon size={32} />}
      emptyText={t("reddit.emptyState")}
      renderBadge={(account: Account) => (
        <>
          <Badge className="text-[11px] px-1.5 bg-[var(--chart-4)]/15 text-[var(--chart-4)]">{t("badge.reddit")}</Badge>
          {account.auth_type === "reddit_public" && (
            <Badge className="text-[11px] px-1.5 bg-[var(--success)]/10 text-[var(--success)]">
              {t("badge.redditPublic")}
            </Badge>
          )}
        </>
      )}
      renderHeader={() => (
        <div>
          <h3 className="text-sm font-semibold mb-3">{t("reddit.whatYouCanTrack")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <ThumbsUp size={20} className="text-[var(--muted-foreground)] mb-2" />
              <p className="text-sm font-medium">{t("reddit.preview.karma")}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{t("reddit.preview.karmaDesc")}</p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <MessageSquare size={20} className="text-[var(--muted-foreground)] mb-2" />
              <p className="text-sm font-medium">{t("reddit.preview.posts")}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{t("reddit.preview.postsDesc")}</p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <TrendingUp size={20} className="text-[var(--muted-foreground)] mb-2" />
              <p className="text-sm font-medium">{t("reddit.preview.score")}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{t("reddit.preview.scoreDesc")}</p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <MessageSquare size={20} className="text-[var(--muted-foreground)] mb-2" />
              <p className="text-sm font-medium">{t("reddit.preview.comments")}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{t("reddit.preview.commentsDesc")}</p>
            </div>
          </div>
        </div>
      )}
    />
  );
}
