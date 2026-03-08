import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServer } from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { createProvider, PROVIDERS, PROVIDER_INFO } from "./providers/index.js";
import type { HistoryMessage } from "./providers/types.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const rawMcpUrl = process.env.MCP_SERVER_URL ?? "http://localhost:3002/mcp";
const MCP_SERVER_URL = rawMcpUrl.startsWith("http://") || rawMcpUrl.startsWith("https://")
  ? rawMcpUrl
  : `https://${rawMcpUrl}`;

let mcpClient: Client;

async function initializeMCPClient(): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));

  const mcp = new Client({ name: "claude-lending-client", version: "0.1.0" });
  await mcp.connect(transport);

  const { tools } = await mcp.listTools();
  console.log(`MCP server connected (${MCP_SERVER_URL}) — ${tools.length} tools available`);
  tools.forEach((t) => console.log(`  • ${t.name}`));

  return mcp;
}

// Transaction step extracted from action tool results.
interface TxStep {
  description: string;
  to: string;
  data: string;
  value: string; // hex or decimal string
  chainId?: number;
}

// Action tools whose results may contain transaction calldata.
const ACTION_TOOLS = new Set([
  "get_deposit_calldata",
  "get_withdraw_calldata",
  "get_borrow_calldata",
  "get_repay_calldata",
]);

// Extract chainId from marketUid ("lender:chainId:tokenAddress").
function chainIdFromMarketUid(marketUid: unknown): number | undefined {
  if (typeof marketUid !== "string") return undefined;
  const parts = marketUid.split(":");
  if (parts.length < 2) return undefined;
  const id = parseInt(parts[1], 10);
  return isNaN(id) ? undefined : id;
}

// Extract tx steps and quote from the 1Delta response schema:
// { actions: { permissions: [{to, data, value, info}], transactions: [{to, data, value}] }, data: { simulation } }
function extractAction(
  toolName: string,
  rawJson: string,
  input: Record<string, unknown>,
): { steps: TxStep[]; quote?: Record<string, unknown> } {
  try {
    const body = JSON.parse(rawJson) as Record<string, unknown>;
    const actions = (body?.actions ?? body) as Record<string, unknown>;
    const baseDesc = toolName.replace("get_", "").replace("_calldata", "");
    const chainId = chainIdFromMarketUid(input.marketUid);

    console.error("Extracted action body:", body);
    const toStep = (item: Record<string, unknown>, desc: string): TxStep | null =>
      item?.to && item?.data
        ? { description: desc, to: item.to as string, data: item.data as string, value: (item.value as string) ?? "0x0", chainId }
        : null;

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

// Cap tool results to keep input token counts within rate limits.
// ~4 chars per token → 6000 chars ≈ 1500 tokens per tool result.
const TOOL_RESULT_CHAR_LIMIT = 6000;

async function callMCPTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    const response = await mcpClient.callTool({ name, arguments: input });
    // Extract the text payload directly instead of re-serialising the MCP envelope.
    const text = (response.content as { type: string; text?: string }[])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!)
      .join("\n");
    if (text.length <= TOOL_RESULT_CHAR_LIMIT) return text;
    return text.slice(0, TOOL_RESULT_CHAR_LIMIT) + `\n[truncated — ${text.length - TOOL_RESULT_CHAR_LIMIT} chars omitted. Use tighter filters to reduce results.]`;
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function cors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function main() {
  console.log("Initializing MCP client…");
  mcpClient = await initializeMCPClient();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    cors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/providers") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(PROVIDERS.map(id => ({ id, ...PROVIDER_INFO[id] }))));
      return;
    }

    if (req.method === "POST" && req.url === "/chat") {
      try {
        const body = await readBody(req);
        const { query, userAddress, provider, history } = JSON.parse(body) as {
          query?: string;
          userAddress?: string;
          provider?: string;
          history?: HistoryMessage[];
        };

        if (!query || typeof query !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "query field is required" }));
          return;
        }

        const aiProvider = createProvider(provider);

        const fullQuery = userAddress
          ? `The user's connected wallet address is: ${userAddress}\n\n${query}`
          : query;

        console.log(`\nQuery: ${query}${userAddress ? ` (wallet: ${userAddress})` : ""}${provider ? ` (provider: ${provider})` : ""}`);
        const { tools } = await mcpClient.listTools();

        // Collect transaction calldata and quote returned by action tools during this request.
        const collectedTxSteps: TxStep[] = [];
        let collectedQuote: Record<string, unknown> | undefined;
        const trackingCallTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
          const result = await callMCPTool(name, input);
          if (ACTION_TOOLS.has(name)) {
            const { steps, quote } = extractAction(name, result, input);
            collectedTxSteps.push(...steps);
            if (quote) collectedQuote = quote;
          }
          return result;
        };

        // Keep only the most recent messages to limit token usage.
        const MAX_HISTORY = 10;
        const trimmedHistory = (history ?? []).slice(-MAX_HISTORY);
        const response = await aiProvider.processQuery(fullQuery, tools, trackingCallTool, trimmedHistory);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          response,
          ...(collectedTxSteps.length > 0 && { transactions: collectedTxSteps }),
          ...(collectedQuote && { quote: collectedQuote }),
        }));
      } catch (err) {
        console.error("Error processing query:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(PORT, () => {
    console.log(`Client HTTP server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
