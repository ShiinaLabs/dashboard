import { useState, useRef, useCallback, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAiStatusPage } from "@/lib/client/graphql/settings";
import { getOverviewPage, overviewPageQueryKey } from "@/lib/client/graphql/overview";
import { getTimezone } from "@/lib/client/datetime";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export function useAiChat({ overviewPage = false, enabled = false }: { overviewPage?: boolean; enabled?: boolean } = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const timezone = useSyncExternalStore(() => () => {}, getTimezone, () => null);
  const pageVariables = { pulseDays: 7, contentDays: 7, analyticsRange: "DAYS_7" as const, timezone: timezone ?? "UTC" };
  const statusQueryKey = overviewPage ? overviewPageQueryKey(pageVariables) : ["ai-status"];
  const { data: status } = useQuery({
    queryKey: statusQueryKey,
    queryFn: ({ signal }) => overviewPage
      ? getOverviewPage(pageVariables, signal).then((page) => page.aiStatus)
      : getAiStatusPage(signal),
    enabled: overviewPage ? Boolean(timezone) : enabled,
    staleTime: 60_000,
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesEndRef]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setError(null);
    setIsStreaming(true);

    try {
      const res = await api.streamAiChat(newMessages);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to get response" }));
        throw new Error(err.error || "Failed to get response");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;

        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: assistantContent };
          return updated;
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to get response";
      setError(msg);
      setMessages(prev => {
        if (prev.length > 0 && prev[prev.length - 1].role === "assistant" && prev[prev.length - 1].content === "") {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
      queryClient.invalidateQueries({ queryKey: statusQueryKey });
    }
  }, [input, isStreaming, messages, queryClient, statusQueryKey]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    input,
    setInput,
    isStreaming,
    error,
    status,
    messagesEndRef,
    inputRef,
    handleSubmit,
    clearMessages,
    scrollToBottom,
  };
}
