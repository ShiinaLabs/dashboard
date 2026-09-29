import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Send, AlertCircle, Trash2 } from "lucide-react";
import { renderMarkdown } from "@/lib/client/markdown";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><Bot size={22} /></span>
        <p className="text-sm font-medium">
          {t("overview.aiAgent.heading")}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t("overview.aiAgent.configureHint") || "Go to Settings → AI Analysis to configure your API endpoint."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><Bot size={22} /></span>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("overview.aiAgent.welcome") || "Ask me anything about your data. I can analyze trends, check fetch health, and more."}
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`mx-auto mb-4 flex max-w-3xl ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`min-w-0 max-w-[min(90%,48rem)] rounded-xl border px-4 py-3 text-sm leading-6 ${
                msg.role === "user"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-card-foreground"
              }`}>
                {msg.role === "assistant" ? (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-background [&_pre]:p-3 [&_code]:text-xs"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                ) : (
                  msg.content
                )}
                {msg.role === "assistant" && isStreaming && i === messages.length - 1 && msg.content === "" && (
                  <span className="inline-block w-2 h-4 bg-[var(--foreground)] animate-pulse ml-0.5" />
                )}
              </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mx-4 mb-1">
          <AlertCircle size={14} aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Quota */}
      {status?.quota && (
        <p className="px-4 pb-1 text-xs text-[var(--muted-foreground)]">
          {t("overview.aiAgent.quotaUsed", { used: status.quota.used.toLocaleString(), limit: status.quota.limit.toLocaleString() })}
        </p>
      )}

      {/* Input */}
      <div className="border-t bg-background/80 p-3 sm:p-4">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl items-end gap-2">
          {messages.length > 0 && onClear && (
            <Button
              type="button"
              onClick={onClear}
              variant="ghost"
              size="icon"
              className="size-10"
              title={t("overview.aiAgent.clear") || "Clear chat"}
              aria-label={t("overview.aiAgent.clear") || "Clear chat"}
            >
              <Trash2 size={16} />
            </Button>
          )}
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder={t("overview.aiAgent.placeholder")}
            disabled={isStreaming}
            className="min-w-0 flex-1"
          />
          <Button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="px-3"
            aria-label={t("overview.aiAgent.send") || "Send"}
          >
            {isStreaming ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" /> : <Send size={16} />}
          </Button>
        </form>
      </div>
    </div>
  );
}
