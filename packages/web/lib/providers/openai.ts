import OpenAI from "openai";
import type { AIProvider, HistoryMessage, MCPTool } from "./types";
import { SYSTEM_PROMPT } from "./types";

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  protected model = "gpt-5-nano";

  constructor() {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async processQuery(userQuery: string, tools: MCPTool[], callTool: (name: string, input: Record<string, unknown>) => Promise<string>, history: HistoryMessage[] = []): Promise<string> {
    const toolDefs: OpenAI.Chat.ChatCompletionTool[] = tools.map(t => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema } }));
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: userQuery },
    ];

    let response = await this.client.chat.completions.create({ model: this.model, max_completion_tokens: 4096, tools: toolDefs, messages });

    while (response.choices[0].finish_reason === "tool_calls") {
      const toolCalls = response.choices[0].message.tool_calls ?? [];
      messages.push(response.choices[0].message);
      for (const tc of toolCalls) {
        if (tc.type !== "function") continue;
        const input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        const result = await callTool(tc.function.name, input);
        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      response = await this.client.chat.completions.create({ model: this.model, max_completion_tokens: 4096, tools: toolDefs, messages });
    }

    return response.choices[0].message.content ?? "";
  }
}
