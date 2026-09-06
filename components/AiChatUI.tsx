import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Send, AlertCircle, Trash2 } from "lucide-react";
import { renderMarkdown } from "@/lib/client/markdown";
import { ActionIcon, Alert, Button, TextInput } from "@/components/ui";
import type { Message } from "@/app/(dashboard)/overview/useAiChat";

interface AiChatUIProps {
  messages: Message[];
  input: string;
  setInput: (v: string) => void;
  isStreaming: boolean;
  error: string | null;
  status?: { configured: boolean; quota?: { used: number; limit: number } };
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  handleSubmit: (e: React.FormEvent) => void;
  onClear?: () => void;
}

export function AiChatUI({
  messages, input, setInput, isStreaming, error, status,
  messagesEndRef, inputRef, handleSubmit, onClear,
}: AiChatUIProps) {
  const { t } = useTranslation();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, messagesEndRef]);

  if (status && !status.configured) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <Bot size={32} className="text-[var(--muted-foreground)] opacity-40" />
        <p className="text-sm font-medium text-[var(--muted-foreground)]">
          {t("overview.aiAgent.heading")}
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {t("overview.aiAgent.configureHint") || "Go to Settings → AI Analysis to configure your API endpoint."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Bot size={32} className="text-[var(--muted-foreground)] opacity-40" />
            <p className="text-sm text-[var(--muted-foreground)] text-center">
              {t("overview.aiAgent.welcome") || "Ask me anything about your data. I can analyze trends, check fetch health, and more."}
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`text-sm p-3 rounded-lg ${
                msg.role === "user"
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] ml-8"
                  : "bg-[var(--muted)] mr-8"
              }`}>
                {msg.role === "assistant" ? (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[var(--background)] [&_code]:text-xs"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                ) : (
                  msg.content
                )}
                {msg.role === "assistant" && isStreaming && i === messages.length - 1 && msg.content === "" && (
                  <span className="inline-block w-2 h-4 bg-[var(--foreground)] animate-pulse ml-0.5" />
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <Alert color="danger" icon={<AlertCircle size={14} />} variant="light" mx="md" mb="xs">{error}</Alert>
      )}

      {/* Quota */}
      {status?.quota && (
        <p className="px-4 pb-1 text-xs text-[var(--muted-foreground)]">
          {t("overview.aiAgent.quotaUsed", { used: status.quota.used.toLocaleString(), limit: status.quota.limit.toLocaleString() })}
        </p>
      )}

      {/* Input */}
      <div className="border-t border-[var(--border)] p-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          {messages.length > 0 && onClear && (
            <ActionIcon
              type="button"
              onClick={onClear}
              variant="subtle"
              color="gray"
              size="lg"
              title={t("overview.aiAgent.clear") || "Clear chat"}
              aria-label={t("overview.aiAgent.clear") || "Clear chat"}
            >
              <Trash2 size={16} />
            </ActionIcon>
          )}
          <TextInput
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder={t("overview.aiAgent.placeholder")}
            disabled={isStreaming}
            style={{ flex: 1 }}
          />
          <Button
            type="submit"
            disabled={!input.trim() || isStreaming}
            loading={isStreaming}
            px="sm"
            aria-label={t("overview.aiAgent.send") || "Send"}
          >
            <Send size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
