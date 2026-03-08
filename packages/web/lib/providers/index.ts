import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { OpenAIMiniProvider } from "./openai-mini";
import type { AIProvider } from "./types";

export type { AIProvider, MCPTool, HistoryMessage } from "./types";

export const PROVIDERS = ["anthropic", "openai", "openai-mini"] as const;
export type ProviderName = typeof PROVIDERS[number];

export interface ProviderInfo { company: string; model: string }

export const PROVIDER_INFO: Record<ProviderName, ProviderInfo> = {
  "anthropic":   { company: "Anthropic", model: "Claude Sonnet 4.6" },
  "openai":      { company: "OpenAI",    model: "GPT-5 Nano"        },
  "openai-mini": { company: "OpenAI",    model: "GPT-4o Mini"       },
};

export function createProvider(name?: string): AIProvider {
  switch ((name ?? "openai-mini").toLowerCase()) {
    case "openai":      return new OpenAIProvider();
    case "openai-mini": return new OpenAIMiniProvider();
    case "anthropic":
    default:            return new AnthropicProvider();
  }
}
