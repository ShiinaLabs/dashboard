import { aiConfig } from "@/lib/config";
import { getSetting, setSetting } from "@/lib/repositories/settings";

export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface UpdateAiSettingsInput {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

/** Read the administrator-managed AI settings in their public API shape. */
export async function getAiSettings(): Promise<{ ai: AiSettings }> {
  const baseUrl = await getSetting("ai_base_url");
  const baseKey = await getSetting("ai_base_key");
  const model = await getSetting("ai_model");
  return {
    ai: {
      baseUrl: baseUrl || "",
      apiKey: baseKey ? "••••••••" : "",
      model: model || aiConfig().model,
    },
  };
}

/** Persist only explicitly supplied fields while preserving masked API keys. */
export async function updateAiSettings(input: UpdateAiSettingsInput): Promise<{ ok: boolean }> {
  if (input.baseUrl !== undefined) await setSetting("ai_base_url", input.baseUrl);
  if (input.apiKey !== undefined && input.apiKey !== "••••••••") await setSetting("ai_base_key", input.apiKey);
  if (input.model !== undefined) await setSetting("ai_model", input.model);
  return { ok: true };
}
