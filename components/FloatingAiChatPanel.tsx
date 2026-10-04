import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Bot, MapPin } from "lucide-react";
import { useAiChat } from "@/app/(dashboard)/overview/useAiChat";
import { AiChatUI } from "./AiChatUI";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const PAGE_LABELS: Record<string, string> = {
  "/": "Overview", "/overview": "Overview", "/x": "X", "/github": "GitHub",
  "/gitlab": "GitLab", "/reddit": "Reddit", "/accounts": "Accounts",
  "/settings": "Settings", "/admin": "Admin",
};

function getPageLabel(pathname: string): string {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname];
  if (pathname.startsWith("/x/")) return "X detail";
  if (pathname.startsWith("/github/")) return "GitHub detail";
  if (pathname.startsWith("/gitlab/")) return "GitLab detail";
  if (pathname.startsWith("/reddit/")) return "Reddit detail";
  return pathname;
}

export function FloatingAiChatPanel({ pathname, open, onOpenChange }: { pathname: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const chat = useAiChat({ enabled: open });

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => chat.inputRef.current?.focus(), 100);
    return () => window.clearTimeout(timeout);
  }, [open, chat.inputRef]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[min(100%,440px)] flex-col gap-0 p-0 sm:max-w-[440px]">
        <SheetHeader className="shrink-0 border-b px-5 py-4 pr-14">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Bot size={17} className="text-primary" aria-hidden="true" />
            {t("overview.aiAgent.heading")}
          </SheetTitle>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={12} aria-hidden="true" />{getPageLabel(pathname)}</p>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <AiChatUI
            messages={chat.messages}
            input={chat.input}
            setInput={chat.setInput}
            isStreaming={chat.isStreaming}
            error={chat.error}
            status={chat.status}
            messagesEndRef={chat.messagesEndRef}
            inputRef={chat.inputRef}
            handleSubmit={chat.handleSubmit}
            onClear={chat.clearMessages}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
