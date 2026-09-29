import { useTranslation } from "react-i18next";
import { useAiChat } from "../overview/useAiChat";
import { AiChatUI } from "@/components/AiChatUI";
import { pageMeta, type PageTitleKey, type TitleHandle } from "@/lib/page-titles";

const titleKey = "nav.ai" satisfies PageTitleKey;

export const meta = pageMeta(titleKey);
export const handle = { titleKey } satisfies TitleHandle;

export default function AiPage() {
  const { t } = useTranslation();
  const chat = useAiChat();
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("overview.aiAgent.heading")}</h1>
      </div>
      <div className="flex h-[calc(100dvh-11rem)] min-h-[28rem] flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
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
