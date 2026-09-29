import { useNavigation } from "react-router";
import { useTranslation } from "react-i18next";

export function NavigatingOverlay() {
  const { t } = useTranslation();
  const navigation = useNavigation();

  if (navigation.state === "idle") return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9998] flex items-center justify-center bg-background/70 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--primary)] rounded-full animate-spin" />
        <span className="text-sm text-[var(--muted-foreground)]">{t("common.loading")}</span>
      </div>
    </div>
  );
}
