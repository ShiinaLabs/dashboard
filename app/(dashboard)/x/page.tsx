import { useTranslation } from "react-i18next";
import AccountListPage from "@/components/AccountListPage";
import { XIcon } from "@/components/BrandIcons";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";

const titleKey = "nav.x" satisfies PageTitleKey;

export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

export default function X() {
  const { t } = useTranslation();

  return (
    <AccountListPage
      platform="twitter"
      heading={t("x.heading")}
      description={(count) =>
        count > 0 ? t("x.accounts_other", { count }) : t("x.description")
      }
      icon={XIcon}
      emptyText={t("x.emptyState")}
      cardBorderAccent="var(--chart-5)"
      renderMeta={(account) => account.stats ? (
        <>
          <span>{t("x.accountCard.followers", { count: account.stats.followers_count.toLocaleString() })}</span>
          <span>{t("x.accountCard.tweets", { count: account.stats.tweet_count.toLocaleString() })}</span>
        </>
      ) : null}
    />
  );
}
