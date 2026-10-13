import { useTranslation } from "react-i18next";

export function AppTitle() {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
      <img src="/favicon.png" alt="" width={32} height={32} className="size-8 shrink-0 rounded-md object-contain" />
      <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:sr-only">{t("common.dashboard")}</span>
    </div>
  );
}
