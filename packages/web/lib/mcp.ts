import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const rawUrl = process.env.MCP_SERVER_URL ?? "http://localhost:3002/mcp";
export const MCP_SERVER_URL = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : `https://${rawUrl}`;

export interface MCPSession {
  client: Client;
  close: () => Promise<void>;
}

export async function createMCPSession(): Promise<MCPSession> {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
  const client = new Client({ name: "lending-web-client", version: "0.1.0" });
  await client.connect(transport);
  return {
    client,
    close: () => transport.close(),
  };
}

const ACTION_TOOLS = new Set(["get_deposit_calldata", "get_withdraw_calldata", "get_borrow_calldata", "get_repay_calldata"]);

export interface TxStep {
  description: string;
  to: string;
  data: string;
  value: string;
  chainId?: number;
}

function chainIdFromMarketUid(marketUid: unknown): number | undefined {
  if (typeof marketUid !== "string") return undefined;
  const parts = marketUid.split(":");
  const id = parseInt(parts[1], 10);
  return isNaN(id) ? undefined : id;
}

export function extractAction(toolName: string, rawJson: string, input: Record<string, unknown>): { steps: TxStep[]; quote?: Record<string, unknown> } {
  try {
    const body = JSON.parse(rawJson) as Record<string, unknown>;
    const actions = (body?.actions ?? body) as Record<string, unknown>;
    const baseDesc = toolName.replace("get_", "").replace("_calldata", "");
    const chainId = chainIdFromMarketUid(input.marketUid);

    const toStep = (item: Record<string, unknown>, desc: string): TxStep | null =>
      item?.to && item?.data ? { description: desc, to: item.to as string, data: item.data as string, value: (item.value as string) ?? "0x0", chainId } : null;

    const steps = [
      ...((actions.permissions ?? []) as Record<string, unknown>[]).map(p => toStep(p, (p.info as string) ?? "approve")),
      ...((actions.transactions ?? []) as Record<string, unknown>[]).map(t => toStep(t, baseDesc)),
    ].filter((s): s is TxStep => s !== null);

    const { actions: _a, success: _s, data, ...rest } = body;
    const dataObj = data != null && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
    const quoteSource = { ...dataObj, ...rest };
    const quote = Object.keys(quoteSource).length > 0 ? quoteSource : undefined;
    return { steps, quote };
  } catch { return { steps: [] }; }
}

export { ACTION_TOOLS };

const TOOL_RESULT_CHAR_LIMIT = 6000;

export async function callMCPTool(client: Client, name: string, input: Record<string, unknown>): Promise<string> {
  try {
    const response = await client.callTool({ name, arguments: input });
    const text = (response.content as { type: string; text?: string }[])
      .filter(c => c.type === "text" && c.text).map(c => c.text!).join("\n");
    if (text.length <= TOOL_RESULT_CHAR_LIMIT) return text;
    return text.slice(0, TOOL_RESULT_CHAR_LIMIT) + `\n[truncated — ${text.length - TOOL_RESULT_CHAR_LIMIT} chars omitted]`;
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
