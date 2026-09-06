import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Bot, X, MapPin } from "lucide-react";
import { useAiChat } from "@/app/(dashboard)/overview/useAiChat";
import { AiChatUI } from "./AiChatUI";
import { ActionIcon } from "@/components/ui";

const PAGE_LABELS: Record<string, string> = {
  "/": "Overview",
  "/x": "X (Twitter)",
  "/github": "GitHub",
  "/gitlab": "GitLab",
  "/reddit": "Reddit",
  "/accounts": "Accounts",
  "/settings": "Settings",
  "/admin": "Admin",
};

function getPageLabel(pathname: string): string {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname];
  if (pathname.startsWith("/x/")) return "X Detail";
  if (pathname.startsWith("/github/")) return "GitHub Detail";
  if (pathname.startsWith("/gitlab/")) return "GitLab Detail";
  if (pathname.startsWith("/reddit/")) return "Reddit Detail";
  return pathname;
}

export function FloatingAiChat({ pathname = "/" }: { pathname?: string }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const chat = useAiChat();

  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => chat.inputRef.current?.focus(), 100);
    }
  }, [isOpen, chat.inputRef]);

  return (
    <>
      {/* Floating button — respects safe-area-inset-bottom */}
      <ActionIcon
        onClick={toggle}
        aria-expanded={isOpen}
        aria-label={t("overview.aiAgent.heading")}
        variant="filled"
        color="primary"
        radius="xl"
        size="xl"
        className="fixed z-50 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
        style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))", right: "max(1.5rem, env(safe-area-inset-right, 1.5rem))" }}
      >
        {isOpen ? <X size={22} /> : <Bot size={22} />}
      </ActionIcon>

      {/* Chat panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none"
            onClick={() => setIsOpen(false)}
          />
          {/* Panel — positioned above the FAB with safe-area awareness */}
          <div className="fixed z-50 w-[min(400px,calc(100vw-48px))] h-[min(560px,calc(100vh-140px))] bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200"
            style={{ bottom: "max(5.5rem, calc(env(safe-area-inset-bottom, 1.5rem) + 4rem))", right: "max(1.5rem, env(safe-area-inset-right, 1.5rem))" }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] shrink-0">
              <Bot size={18} className="text-[var(--primary)]" />
              <span className="text-sm font-semibold">{t("overview.aiAgent.heading")}</span>
              <span className="ml-auto flex items-center gap-1 text-xs text-[var(--muted-foreground)] bg-[var(--muted)] px-2 py-0.5 rounded-full">
                <MapPin size={10} />
                {getPageLabel(pathname)}
              </span>
              <ActionIcon
                onClick={() => setIsOpen(false)}
                variant="subtle"
                color="gray"
                size="md"
                ml="auto"
                aria-label={t("common.close") || "Close"}
              >
                <X size={16} />
              </ActionIcon>
            </div>

            {/* Chat content */}
            <div className="flex-1 min-h-0 overflow-hidden">
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
          </div>
        </>
      )}
    </>
  );
}
