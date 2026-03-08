import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, HistoryMessage, MCPTool } from "./types";
import { SYSTEM_PROMPT } from "./types";

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError && attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt) * 30_000;
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async processQuery(userQuery: string, tools: MCPTool[], callTool: (name: string, input: Record<string, unknown>) => Promise<string>, history: HistoryMessage[] = []): Promise<string> {
    const cachedSystem: Anthropic.TextBlockParam[] = [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }];
    const toolDefs: Anthropic.Tool[] = tools.map((t, i) => ({
      name: t.name,
      description: t.description ?? "",
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
      ...(i === tools.length - 1 && { cache_control: { type: "ephemeral" } }),
    }));

    const messages: Anthropic.MessageParam[] = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: userQuery },
    ];

    let response = await withRetry(() => this.client.messages.create({ model: "claude-sonnet-4-6", max_tokens: 4096, system: cachedSystem, tools: toolDefs, messages }));

    while (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await callTool(block.name, block.input as Record<string, unknown>);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
        }
      }
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
      response = await withRetry(() => this.client.messages.create({ model: "claude-sonnet-4-6", max_tokens: 4096, system: cachedSystem, tools: toolDefs, messages }));
    }

    return response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("");
  }
}
