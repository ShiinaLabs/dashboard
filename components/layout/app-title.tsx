import { useTranslation } from "react-i18next";

export function AppTitle({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <img src="/favicon.png" alt="" width={32} height={32} className="size-8 shrink-0 rounded-md object-contain" />
      <span className={`truncate text-sm font-semibold tracking-tight${compact ? " sr-only" : ""}`}>{t("common.dashboard")}</span>
    </div>
  );
}
