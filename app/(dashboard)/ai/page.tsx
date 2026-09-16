import { useTranslation } from "react-i18next";
import { useAiChat } from "../overview/useAiChat";
import { AiChatUI } from "@/components/AiChatUI";
import { useIsMobile } from "@/lib/client/useIsMobile";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";

const titleKey = "nav.ai" satisfies PageTitleKey;

export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

export default function AiPage() {
  const { t } = useTranslation();
  const chat = useAiChat();
  const isMobile = useIsMobile();

  // Counteract parent padding so the chat fills the viewport.
  // Title bar = 48px + env(safe-area-inset-top); content padding = 12px (mobile) or 24px (desktop).
  const negTop = isMobile ? "-mt-3" : "-mt-6";
  const negX = isMobile ? "-mx-4" : "-mx-8";

  return (
    <div className={`flex flex-col ${negTop} ${negX}`}
      style={{
        height: `calc(100dvh - 48px - env(safe-area-inset-top) - ${isMobile ? 24 : 48}px - env(safe-area-inset-bottom))`,
      }}
    >
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-lg font-semibold">{t("overview.aiAgent.heading")}</h2>
      </div>

      {/* Chat content */}
      <div className="flex-1 min-h-0">
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
  );
}
