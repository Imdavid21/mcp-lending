import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import axios from "axios";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";

const PORT = parseInt(process.env.PORT ?? "3002", 10);
const API_BASE_URL = "https://portal.1delta.io/v1";
// Server-level fallback key — used when the connecting client doesn't supply their own.
const SERVER_API_KEY = process.env.ONEDELTA_API_KEY;

// apiKey: per-session key supplied by the client via Authorization header.
// Falls back to SERVER_API_KEY, then no key (public rate limits).
async function makeApiRequest(endpoint: string, params: Record<string, unknown> = {}, apiKey?: string) {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach(v => url.searchParams.append(key, String(v)));
    } else {
      url.searchParams.append(key, String(value));
    }
  });
  const headers: Record<string, string> = {};
  const effectiveKey = apiKey ?? SERVER_API_KEY;
  if (effectiveKey) headers['x-api-key'] = effectiveKey;
  try {
    const response = await axios.get(url.toString(), { headers });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `API Error ${error.response?.status}: ${error.response?.data?.error?.message ?? error.message}`
      );
    }
    throw error;
  }
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

// ---------------------------------------------------------------------------

// Returns slim pool projections filtered by TVL.
// - minTvlUsd filters on totalDepositsUsd (default 10 000) — the total deposits in the market.
// - availableLiquidityUsd = totalDepositsUsd × (1 − utilization) is included in each record as useful context.
// Returns { markets, filteredCount } so the AI can report how many were excluded.
function slimPools(
  raw: unknown,
  minTvlUsd = 10_000,
): { markets: unknown[]; filteredCount: number } {
  const rawData = (raw as Record<string, unknown>)?.data;
  const pools: Record<string, unknown>[] = Array.isArray(raw)
    ? raw
    : Array.isArray((rawData as Record<string, unknown>)?.items)
      ? (rawData as Record<string, unknown>).items as Record<string, unknown>[]
      : Array.isArray(rawData)
        ? rawData as Record<string, unknown>[]
        : [];

  const all = pools.map((m) => {
    const tvl = parseFloat(m.totalDepositsUsd as string) || 0;
    const util = parseFloat(m.utilization as string) || 0;
    const availableLiquidityUsd = Math.round(tvl * (1 - util) * 100) / 100;
    return {
      marketUid:             m.marketUid,
      symbol:                m.assetGroup ?? m.symbol ?? m.tokenSymbol ?? (m.underlying as Record<string, unknown>)?.symbol,
      depositRate:           m.depositRate,
      variableBorrowRate:    m.variableBorrowRate,
      totalDepositsUsd:      tvl,
      availableLiquidityUsd,
      utilization:           util,
    };
  });

  const markets = all.filter((m) => m.totalDepositsUsd >= minTvlUsd);
  return { markets, filteredCount: all.length - markets.length };
}

// ---------------------------------------------------------------------------
// MCP server factory — creates a fresh server instance per client session.
// ---------------------------------------------------------------------------

function createMcpServer(apiKey?: string): McpServer {
  const server = new McpServer({ name: "lending-mcp-server", version: "0.1.0" });
  // Convenience wrapper — all tool handlers use this so the per-session key is applied automatically.
  const api = (endpoint: string, params: Record<string, unknown> = {}) =>
    makeApiRequest(endpoint, params, apiKey);

  // ── Data tools ──────────────────────────────────────────────────────────────

  server.registerTool(
    "find_market",
    {
      description: "Find a lending market's marketUid by token/protocol. Use this before deposit/withdraw/borrow/repay. Requires exact chainId and lender values — see get_supported_chains / get_lender_ids if unsure.",
      inputSchema: {
        chainId:          z.string().describe("Numeric chain ID as string. Common values: '1'=Ethereum, '56'=BNB, '137'=Polygon, '10'=Optimism, '42161'=Arbitrum, '43114'=Avalanche, '8453'=Base, '5000'=Mantle, '534352'=Scroll, '59144'=Linea. Call get_supported_chains if the chain is not listed here."),
        assetGroup:       z.string().optional().describe("Asset name e.g. 'USDC', 'ETH'. Note: WETH is mapped to 'ETH' — always use 'ETH' when searching for WETH markets."),
        tokenAddress:     z.string().optional().describe("Token contract address (0x-)"),
        lender:           z.string().optional().describe("Exact lender protocol ID e.g. 'AAVE_V3', 'LENDLE', 'COMPOUND_V3'. Call get_lender_ids to discover valid values."),
        count:            z.number().int().optional().describe("Max results (default 10)"),
        minTvlUsd:        z.number().optional().describe("Minimum TVL (totalDepositsUsd) in USD. Default 10000. Lower only if the user explicitly asks for small/illiquid markets."),
      },
    },
    async ({ chainId, assetGroup, tokenAddress, lender, count, minTvlUsd }) => {
      try {
        const raw = await api("/data/lending/pools", {
          chainId,
          assetGroups: assetGroup,
          underlyings: tokenAddress,
          lender,
          count: count ?? 10,
        });
        const result = slimPools(raw, minTvlUsd ?? 10_000);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (e) { return err(e); }
    }
  );

  server.registerTool(
    "get_lending_markets",
    {
      description: "Browse lending markets with filters. For a specific marketUid use find_market instead. To find the best yield, use sortBy='depositRate' and sortOrder='desc'.",
      inputSchema: {
        chainId:         z.string().describe("Numeric chain ID as string e.g. '1'=Ethereum, '42161'=Arbitrum, '5000'=Mantle. Call get_supported_chains for the full list."),
        lender:          z.string().optional().describe("Exact lender protocol ID e.g. 'AAVE_V3', 'LENDLE'. Call get_lender_ids for the full list."),
        assetGroups:     z.string().optional().describe("Comma-separated asset names e.g. 'USDC', 'ETH'"),
        minYield:        z.number().optional().describe("Min deposit rate"),
        maxYield:        z.number().optional().describe("Max deposit rate"),
        minTvlUsd:       z.number().optional().describe("Minimum TVL (totalDepositsUsd) in USD. Default 10000. Lower only if the user explicitly asks for small/illiquid markets."),
        sortBy:          z.enum(["depositRate", "variableBorrowRate", "utilization", "totalDepositsUsd"]).optional().describe("Sort field"),
        sortDir:         z.enum(["asc", "desc"]).optional().describe("Sort direction. Use 'desc' for highest yield first."),
        count:           z.number().int().optional().describe("Results (default 100)"),
      },
    },
    async ({ minTvlUsd, ...args }) => {
      try {
        const raw = await api("/data/lending/pools", args);
        const result = slimPools(raw, minTvlUsd ?? 10_000);
        return ok(result);
      } catch (e) { return err(e); }
    }
  );

  server.registerTool(
    "get_user_positions",
    {
      description: "Get lending/borrowing positions for a wallet across chains.",
      inputSchema: {
        account: z.string().describe("Wallet address (0x-)"),
        chains:  z.string().describe("Comma-separated chain IDs e.g. '1,42161'"),
        lenders: z.string().optional().describe("Comma-separated lender IDs"),
      },
    },
    async (args) => {
      try { return ok(await api("/data/lending/user-positions", args)); }
      catch (e) { return err(e); }
    }
  );

  server.registerTool(
    "get_supported_chains",
    {
      description: "Get list of supported chains with deployed composer proxies",
      inputSchema: {},
    },
    async () => {
      try { return ok(await api("/data/chains")); }
      catch (e) { return err(e); }
    }
  );

  server.registerTool(
    "get_lender_ids",
    {
      description: "Get list of supported lending protocol identifiers",
      inputSchema: {},
    },
    async () => {
      try { return ok(await api("/data/lender-ids")); }
      catch (e) { return err(e); }
    }
  );

  server.registerTool(
    "get_token_info",
    {
      description: "Look up token metadata (address, decimals, symbol, name) by assetGroup, symbol, address, and/or chainId. One assetGroup can map to multiple tokens across chains. Add chainId to identify a specific token. Always call this before an action when the token's decimals are not known, so you can correctly convert human-readable amounts to base units.",
      inputSchema: {
        chainId:    z.string().optional().describe("Chain ID e.g. '42161'"),
        assetGroup: z.string().optional().describe("Asset group name e.g. 'ETH', 'USDC'. Note: WETH is stored as 'ETH'."),
        symbol:     z.string().optional().describe("Token symbol e.g. 'USDC'"),
        address:    z.string().optional().describe("Token contract address (0x-)"),
      },
    },
    async (args) => {
      try { return ok(await api("/data/token/available", args)); }
      catch (e) { return err(e); }
    }
  );

  server.registerTool(
    "get_token_price",
    {
      description: "Get current USD prices for one or more tokens by asset group key. Use this when the user specifies an amount in USD — get the price, divide USD amount by price to get the token amount, then convert to base units using decimals from get_token_info.",
      inputSchema: {
        assets: z.array(z.string()).describe("Asset group keys to look up e.g. ['ETH', 'USDC', 'WBTC']. Note: WETH uses the key 'ETH'."),
      },
    },
    async ({ assets }) => {
      try {
        const raw = await api("/data/prices/latest", { assets });
        const items = (raw as Record<string, unknown>)?.data
          ? ((raw as Record<string, unknown>).data as Record<string, unknown>)?.items
          : raw;
        // Filter to only the requested keys to keep response small
        const filtered: Record<string, unknown> = {};
        if (items && typeof items === "object") {
          for (const key of assets) {
            if ((items as Record<string, unknown>)[key] !== undefined) {
              filtered[key] = (items as Record<string, unknown>)[key];
            }
          }
        }
        return ok({ prices: Object.keys(filtered).length > 0 ? filtered : items });
      } catch (e) { return err(e); }
    }
  );

  server.registerTool(
    "get_token_balances",
    {
      description: "Get token balances for a wallet on a chain.",
      inputSchema: {
        chainId: z.string().describe("Chain ID"),
        account: z.string().describe("Wallet address"),
        assets:  z.string().describe("Comma-separated token addresses"),
      },
    },
    async (args) => {
      try { return ok(await api("/data/token/balances", args)); }
      catch (e) { return err(e); }
    }
  );

  // ── Action tools ─────────────────────────────────────────────────────────────

  server.registerTool(
    "get_deposit_calldata",
    {
      description: "Build calldata to deposit into a lending pool.",
      inputSchema: {
        marketUid: z.string().describe("Market UID (lender:chainId:tokenAddress)"),
        amount:    z.string().describe("Amount in the token's base units (no decimals). Convert the human-readable amount: multiply by 10^decimals. Common decimals: ETH/WETH/most ERC-20s=18, USDC/USDT=6, WBTC=8. E.g. 0.00026 WETH → '260000000000000', 0.5 USDC → '500000'."),
        operator:  z.string().describe("Wallet address"),
        receiver:  z.string().optional().describe("Receipt recipient (default: operator)"),
        mode:      z.enum(["direct", "proxy"]).optional().describe("direct=raw protocol, proxy=1delta"),
      },
    },
    async (args) => {
      try { return ok(await api("/actions/lending/deposit", { ...args, simulate: true })); }
      catch (e) { return err(e); }
    }
  );

  server.registerTool(
    "get_withdraw_calldata",
    {
      description: "Build calldata to withdraw from a lending pool.",
      inputSchema: {
        marketUid: z.string().describe("Market UID (lender:chainId:tokenAddress)"),
        amount:    z.string().describe("Amount in the token's base units (no decimals). Convert the human-readable amount: multiply by 10^decimals. Common decimals: ETH/WETH/most ERC-20s=18, USDC/USDT=6, WBTC=8. E.g. 0.00026 WETH → '260000000000000', 0.5 USDC → '500000'."),
        operator:  z.string().describe("Wallet address"),
        receiver:  z.string().optional().describe("Recipient address"),
        isAll:     z.boolean().optional().describe("Withdraw full balance"),
        mode:      z.enum(["direct", "proxy"]).optional().describe("Execution mode"),
      },
    },
    async (args) => {
      try { return ok(await api("/actions/lending/withdraw", { ...args, simulate: true })); }
      catch (e) { return err(e); }
    }
  );

  server.registerTool(
    "get_borrow_calldata",
    {
      description: "Build calldata to borrow from a lending pool.",
      inputSchema: {
        marketUid:   z.string().describe("Market UID (lender:chainId:tokenAddress)"),
        amount:      z.string().describe("Amount in the token's base units (no decimals). Convert the human-readable amount: multiply by 10^decimals. Common decimals: ETH/WETH/most ERC-20s=18, USDC/USDT=6, WBTC=8. E.g. 0.00026 WETH → '260000000000000', 0.5 USDC → '500000'."),
        operator:    z.string().describe("Wallet address"),
        receiver:    z.string().optional().describe("Recipient address"),
        lendingMode: z.enum(["0", "1", "2"]).optional().describe("Rate mode: 0=none 1=stable 2=variable"),
        mode:        z.enum(["direct", "proxy"]).optional().describe("Execution mode"),
      },
    },
    async (args) => {
      try { return ok(await api("/actions/lending/borrow", { ...args, simulate: true })); }
      catch (e) { return err(e); }
    }
  );

  server.registerTool(
    "get_repay_calldata",
    {
      description: "Build calldata to repay borrowed assets.",
      inputSchema: {
        marketUid:   z.string().describe("Market UID (lender:chainId:tokenAddress)"),
        amount:      z.string().describe("Amount in the token's base units (no decimals). Convert the human-readable amount: multiply by 10^decimals. Common decimals: ETH/WETH/most ERC-20s=18, USDC/USDT=6, WBTC=8. E.g. 0.00026 WETH → '260000000000000', 0.5 USDC → '500000'."),
        operator:    z.string().describe("Wallet address"),
        isAll:       z.boolean().optional().describe("Repay full balance"),
        lendingMode: z.enum(["0", "1", "2"]).optional().describe("Rate mode: 0=none 1=stable 2=variable"),
        mode:        z.enum(["direct", "proxy"]).optional().describe("Execution mode"),
      },
    },
    async (args) => {
      try { return ok(await api("/actions/lending/repay", { ...args, simulate: true })); }
      catch (e) { return err(e); }
    }
  );

  // ── Documentation resources ──────────────────────────────────────────────────
  // Resources expose static reference material that MCP clients and LLMs can read.
  // Unlike tools (which the model executes), resources are data the host pulls in as context.

  server.registerResource("overview", "docs://overview", { mimeType: "text/markdown" }, async (uri: URL) => ({
    contents: [{
      uri: uri.href,
      mimeType: "text/markdown",
      text: `# 1delta Lending MCP Server

## What is this?

This MCP server gives AI assistants (Claude, GPT, Gemini, etc.) and developer tooling direct access to the **1delta lending aggregator** — a DeFi protocol that aggregates lending markets across chains.

Through this server you can:
- **Query** lending markets, token prices, wallet balances, and user positions
- **Build transactions** to deposit, withdraw, borrow, and repay across 30+ chains

## Available resources

| URI | Description |
|-----|-------------|
| \`docs://overview\` | This document |
| \`docs://authentication\` | How to authenticate for better rate limits |
| \`docs://tools\` | Full tool reference with parameters and examples |
| \`docs://chains\` | Supported chain IDs |
| \`docs://lenders\` | Supported lending protocol identifiers |

## Quick start

1. Connect your MCP client to this server's endpoint \`/mcp\`
2. Optionally supply your 1delta API key via \`Authorization: Bearer <key>\` on the initialize request
3. Call \`get_supported_chains\` and \`get_lender_ids\` to discover available networks and protocols
4. Use \`find_market\` or \`get_lending_markets\` to locate a market
5. Use \`get_deposit_calldata\` / \`get_borrow_calldata\` / etc. to build transactions

## Supported networks (sample)

Ethereum (1), Arbitrum (42161), Base (8453), Polygon (137), Optimism (10), Mantle (5000), Scroll (534352), Linea (59144), Avalanche (43114), BNB Chain (56), and 20+ more.

Call \`get_supported_chains\` for the full current list.
`,
    }],
  }));

  server.registerResource("authentication", "docs://authentication", { mimeType: "text/markdown" }, async (uri: URL) => ({
    contents: [{
      uri: uri.href,
      mimeType: "text/markdown",
      text: `# Authentication

## API key (optional)

Supplying a 1delta API key gives your session higher rate limits on the 1delta Portal API.

**How to provide your key:**

Include it as a Bearer token in the HTTP \`Authorization\` header on the MCP \`initialize\` request:

\`\`\`
Authorization: Bearer <your-1delta-api-key>
\`\`\`

The key is captured at session initialization and forwarded as \`x-api-key\` on every 1delta API call made during your session.

## Without a key

Requests still work but are subject to the public rate limits of the 1delta Portal API.

## Key resolution order

1. Client-supplied key (via \`Authorization\` header) — highest priority
2. Server environment variable \`ONEDELTA_API_KEY\` — server-level fallback
3. No key — public rate limits

## Get a key

Register at [auth.1delta.io](https://auth.1delta.io) to obtain a 1delta API key.
`,
    }],
  }));

  server.registerResource("tools", "docs://tools", { mimeType: "text/markdown" }, async (uri: URL) => ({
    contents: [{
      uri: uri.href,
      mimeType: "text/markdown",
      text: `# Tool Reference

## Data tools

### \`find_market\`
Find a lending market's \`marketUid\` by token and/or protocol. Call this before any action tool.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| chainId | string | yes | Numeric chain ID e.g. \`"42161"\` for Arbitrum |
| assetGroup | string | no | Asset name e.g. \`"USDC"\`, \`"ETH"\` (use \`"ETH"\` for WETH) |
| tokenAddress | string | no | Token contract address (0x-) |
| lender | string | no | Protocol ID e.g. \`"AAVE_V3"\` |
| count | number | no | Max results (default 10) |
| minTvlUsd | number | no | Min TVL filter (default 10000) |

Returns: \`{ markets: [...], filteredCount: number }\`

---

### \`get_lending_markets\`
Browse markets with sorting and filtering. Use \`sortBy="depositRate"&sortDir="desc"\` to find the best yield.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| chainId | string | yes | Chain ID |
| lender | string | no | Protocol ID filter |
| assetGroups | string | no | Comma-separated asset names |
| minYield / maxYield | number | no | Deposit rate bounds |
| minTvlUsd | number | no | Min TVL (default 10000) |
| sortBy | enum | no | \`depositRate\` \| \`variableBorrowRate\` \| \`utilization\` \| \`totalDepositsUsd\` |
| sortDir | enum | no | \`asc\` \| \`desc\` |
| count | number | no | Results (default 100) |

---

### \`get_user_positions\`
Get all lending and borrowing positions for a wallet.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| account | string | yes | Wallet address (0x-) |
| chains | string | yes | Comma-separated chain IDs e.g. \`"1,42161"\` |
| lenders | string | no | Comma-separated lender IDs |

---

### \`get_supported_chains\`
Returns the full list of supported chains with IDs and names. No parameters.

---

### \`get_lender_ids\`
Returns all supported lending protocol identifiers (e.g. AAVE_V3, COMPOUND_V3, LENDLE). No parameters.

---

### \`get_token_info\`
Look up token metadata (address, decimals, symbol). Call this before action tools when decimals are unknown.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| chainId | string | no | Chain ID |
| assetGroup | string | no | Asset group e.g. \`"USDC"\` |
| symbol | string | no | Token symbol |
| address | string | no | Token contract address |

---

### \`get_token_price\`
Get current USD prices by asset group key.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| assets | string[] | yes | Asset group keys e.g. \`["ETH","USDC"]\` |

---

### \`get_token_balances\`
Get token balances for a wallet on a specific chain.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| chainId | string | yes | Chain ID |
| account | string | yes | Wallet address |
| assets | string | yes | Comma-separated token addresses |

---

## Action tools

> Action tools return transaction calldata. The caller must sign and submit the transaction via their wallet.

### \`get_deposit_calldata\`
Build calldata to deposit tokens into a lending pool.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| marketUid | string | yes | \`lender:chainId:tokenAddress\` |
| amount | string | yes | Amount in base units (no decimals) |
| operator | string | yes | Wallet address (signer) |
| receiver | string | no | Receipt recipient (default: operator) |
| mode | \`direct\`\|\`proxy\` | no | \`direct\` = raw protocol, \`proxy\` = via 1delta |

---

### \`get_withdraw_calldata\`
Build calldata to withdraw from a lending pool.

Same parameters as deposit, plus:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| isAll | boolean | no | Withdraw full balance |

---

### \`get_borrow_calldata\`
Build calldata to borrow from a lending pool.

Same parameters as deposit, plus:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| lendingMode | \`"0"\`\|\`"1"\`\|\`"2"\` | no | Rate mode: 0=none, 1=stable, 2=variable |

---

### \`get_repay_calldata\`
Build calldata to repay borrowed assets.

Same parameters as borrow, plus:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| isAll | boolean | no | Repay full balance |

---

## Amount conversion

All action tools take \`amount\` in base units (integer string, no decimal point).

\`\`\`
human amount × 10^decimals = base units

Examples:
  1.5 USDC  → "1500000"      (decimals = 6)
  0.1 ETH   → "100000000000000000"  (decimals = 18)
  0.001 WBTC → "100000"      (decimals = 8)
\`\`\`

Use \`get_token_info\` to retrieve decimals for any token.
`,
    }],
  }));

  server.registerResource("chains", "docs://chains", { mimeType: "text/markdown" }, async (uri: URL) => ({
    contents: [{
      uri: uri.href,
      mimeType: "text/markdown",
      text: `# Supported Chains

Call \`get_supported_chains\` for the live list with full metadata.

## Common chain IDs

| Chain | ID |
|-------|----|
| Ethereum | 1 |
| BNB Chain | 56 |
| Polygon | 137 |
| Optimism | 10 |
| Arbitrum | 42161 |
| Avalanche | 43114 |
| Base | 8453 |
| Mantle | 5000 |
| Scroll | 534352 |
| Linea | 59144 |
| zkSync Era | 324 |
| Polygon zkEVM | 1101 |
| Metis | 1088 |
| Taiko | 167000 |
| Gnosis | 100 |
| Fantom | 250 |

All \`chainId\` parameters are passed as **strings** (e.g. \`"42161"\`).
`,
    }],
  }));

  server.registerResource("lenders", "docs://lenders", { mimeType: "text/markdown" }, async (uri: URL) => ({
    contents: [{
      uri: uri.href,
      mimeType: "text/markdown",
      text: `# Supported Lending Protocols

Call \`get_lender_ids\` for the live list.

## Protocol identifiers

| ID | Protocol |
|----|---------|
| AAVE_V2 | Aave v2 |
| AAVE_V3 | Aave v3 |
| COMPOUND_V2 | Compound v2 |
| COMPOUND_V3 | Compound v3 |
| LENDLE | Lendle (Mantle) |
| AURELIUS | Aurelius (Mantle) |
| MENDI | Mendi Finance (Linea) |
| MOONWELL | Moonwell (Base) |
| SILO | Silo Finance |
| RADIANT_V2 | Radiant Capital v2 |
| MORPHO | Morpho |
| SPARK | Spark Protocol |
| VENUS | Venus (BNB Chain) |

Use these exact strings in the \`lender\` parameter of \`find_market\` and \`get_lending_markets\`.
`,
    }],
  }));

  return server;
}

// ---------------------------------------------------------------------------
// HTTP server with session management
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// sessionId → transport (one McpServer instance per session)
const transports = new Map<string, StreamableHTTPServerTransport>();

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST") {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      // Existing session — forward to its transport
      const raw = await readBody(req);
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { /* let SDK handle */ }
      await transports.get(sessionId)!.handleRequest(req, res, parsed);
      return;
    }

    // New connection — must be an initialize request
    const raw = await readBody(req);
    let message: Record<string, unknown> = {};
    try { message = JSON.parse(raw); } catch { /* handled below */ }

    if (message?.method !== "initialize") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Expected initialize request for new session" }));
      return;
    }

    // Extract optional 1Delta API key from Authorization: Bearer <key>
    const authHeader = req.headers["authorization"];
    const clientApiKey = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim() || undefined
      : undefined;

    if (clientApiKey) {
      console.log("Session authenticated with client API key");
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => { transports.set(id, transport); },
    });

    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };

    const mcpServer = createMcpServer(clientApiKey);
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, message);
    return;
  }

  if (req.method === "GET") {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or missing Mcp-Session-Id" }));
      return;
    }
    await transports.get(sessionId)!.handleRequest(req, res);
    return;
  }

  if (req.method === "DELETE") {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      await transports.get(sessionId)!.handleRequest(req, res);
    } else {
      res.writeHead(404);
      res.end();
    }
    return;
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}

async function main() {
  const httpServer = createServer(async (req, res) => {
    const path = req.url?.split("?")[0];
    if (path === "/mcp") {
      try {
        await handleMcpRequest(req, res);
      } catch (error) {
        console.error("MCP request error:", error);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      }
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`Lending MCP Server running on http://localhost:${PORT}/mcp`);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
