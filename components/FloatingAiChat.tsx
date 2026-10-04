import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/Skeleton";

const FloatingAiChatPanel = lazy(() => import("./FloatingAiChatPanel").then((module) => ({ default: module.FloatingAiChatPanel })));

export function FloatingAiChat({ pathname = "/overview" }: { pathname?: string }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="icon"
        aria-label={t("overview.aiAgent.heading")}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => { setHasOpened(true); setIsOpen(true); }}
        className="fixed z-40 size-12 rounded-full shadow-lg"
        style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom, 1.25rem))", right: "max(1.25rem, env(safe-area-inset-right, 1.25rem))" }}
      >
        <Bot size={20} aria-hidden="true" />
      </Button>
      {hasOpened && (
        <Suspense fallback={
          <div role="status" aria-label={t("common.loading")} className="fixed inset-y-0 right-0 z-50 w-[min(100%,440px)] border-l bg-background p-5 shadow-xl">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-6 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/4" />
            <Skeleton className="absolute inset-x-4 bottom-4 h-10" />
          </div>
        }>
          <FloatingAiChatPanel pathname={pathname} open={isOpen} onOpenChange={setIsOpen} />
        </Suspense>
      )}
    </>
  );
}
