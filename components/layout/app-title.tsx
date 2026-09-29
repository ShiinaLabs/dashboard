import { AudioLines } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AppTitle() {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
        <AudioLines className="size-4" aria-hidden="true" />
      </span>
      <span className="truncate text-sm font-semibold tracking-tight">{t("common.dashboard")}</span>
    </div>
  );
}
