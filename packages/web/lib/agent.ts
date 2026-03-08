import OpenAI from "openai";
import * as delta from "./onedelta";

// ── OpenAI tool definitions ───────────────────────────────────────────────────

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "find_market",
      description: "Find a lending market's marketUid by token/protocol. Use this before deposit/withdraw/borrow/repay.",
      parameters: {
        type: "object",
        properties: {
          chainId:      { type: "string", description: "Numeric chain ID e.g. '42161' for Arbitrum" },
          assetGroup:   { type: "string", description: "Asset name e.g. 'USDC', 'ETH' (use 'ETH' for WETH)" },
          tokenAddress: { type: "string", description: "Token contract address (0x-)" },
          lender:       { type: "string", description: "Exact lender ID e.g. 'AAVE_V3'" },
          count:        { type: "number", description: "Max results (default 10)" },
          minTvlUsd:    { type: "number", description: "Minimum TVL in USD (default 10000)" },
        },
        required: ["chainId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lending_markets",
      description: "Browse lending markets with filters. Use sortBy='depositRate' + sortDir='desc' for best yield.",
      parameters: {
        type: "object",
        properties: {
          chainId:     { type: "string", description: "Numeric chain ID e.g. '1' for Ethereum" },
          lender:      { type: "string", description: "Lender protocol ID" },
          assetGroups: { type: "string", description: "Comma-separated asset names e.g. 'USDC,ETH'" },
          minYield:    { type: "number" },
          maxYield:    { type: "number" },
          minTvlUsd:   { type: "number", description: "Min TVL (default 10000)" },
          sortBy:      { type: "string", enum: ["depositRate", "variableBorrowRate", "utilization", "totalDepositsUsd"] },
          sortDir:     { type: "string", enum: ["asc", "desc"] },
          count:       { type: "number", description: "Results (default 100)" },
        },
        required: ["chainId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_positions",
      description: "Get lending/borrowing positions for a wallet across chains.",
      parameters: {
        type: "object",
        properties: {
          account: { type: "string", description: "Wallet address (0x-)" },
          chains:  { type: "string", description: "Comma-separated chain IDs e.g. '1,42161'" },
          lenders: { type: "string", description: "Comma-separated lender IDs" },
        },
        required: ["account", "chains"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_supported_chains",
      description: "Get list of supported chains with deployed composer proxies.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lender_ids",
      description: "Get list of supported lending protocol identifiers.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_token_info",
      description: "Look up token metadata (address, decimals, symbol). Call this before action tools when decimals are unknown.",
      parameters: {
        type: "object",
        properties: {
          chainId:    { type: "string" },
          assetGroup: { type: "string", description: "e.g. 'USDC', 'ETH' (use 'ETH' for WETH)" },
          symbol:     { type: "string" },
          address:    { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_token_price",
      description: "Get current USD prices for tokens by asset group key.",
      parameters: {
        type: "object",
        properties: {
          assets: { type: "array", items: { type: "string" }, description: "Asset group keys e.g. ['ETH','USDC']" },
        },
        required: ["assets"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_token_balances",
      description: "Get token balances for a wallet on a chain.",
      parameters: {
        type: "object",
        properties: {
          chainId: { type: "string" },
          account: { type: "string" },
          assets:  { type: "string", description: "Comma-separated token addresses" },
        },
        required: ["chainId", "account", "assets"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deposit_calldata",
      description: "Build calldata to deposit into a lending pool.",
      parameters: {
        type: "object",
        properties: {
          marketUid: { type: "string" },
          amount:    { type: "string", description: "Amount in base units (no decimals)" },
          operator:  { type: "string", description: "Wallet address" },
          receiver:  { type: "string" },
          mode:      { type: "string", enum: ["direct", "proxy"] },
        },
        required: ["marketUid", "amount", "operator"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_withdraw_calldata",
      description: "Build calldata to withdraw from a lending pool.",
      parameters: {
        type: "object",
        properties: {
          marketUid: { type: "string" },
          amount:    { type: "string" },
          operator:  { type: "string" },
          receiver:  { type: "string" },
          isAll:     { type: "boolean" },
          mode:      { type: "string", enum: ["direct", "proxy"] },
        },
        required: ["marketUid", "amount", "operator"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_borrow_calldata",
      description: "Build calldata to borrow from a lending pool.",
      parameters: {
        type: "object",
        properties: {
          marketUid:   { type: "string" },
          amount:      { type: "string" },
          operator:    { type: "string" },
          receiver:    { type: "string" },
          lendingMode: { type: "string", enum: ["0", "1", "2"] },
          mode:        { type: "string", enum: ["direct", "proxy"] },
        },
        required: ["marketUid", "amount", "operator"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_repay_calldata",
      description: "Build calldata to repay borrowed assets.",
      parameters: {
        type: "object",
        properties: {
          marketUid:   { type: "string" },
          amount:      { type: "string" },
          operator:    { type: "string" },
          isAll:       { type: "boolean" },
          lendingMode: { type: "string", enum: ["0", "1", "2"] },
          mode:        { type: "string", enum: ["direct", "proxy"] },
        },
        required: ["marketUid", "amount", "operator"],
      },
    },
  },
];

// ── Tool dispatch ─────────────────────────────────────────────────────────────

const ACTION_TOOLS = new Set(["get_deposit_calldata", "get_withdraw_calldata", "get_borrow_calldata", "get_repay_calldata"]);

async function dispatchTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "find_market":          return await delta.findMarket(input);
      case "get_lending_markets":  return await delta.getLendingMarkets(input);
      case "get_user_positions":   return await delta.getUserPositions(input);
      case "get_supported_chains": return await delta.getSupportedChains();
      case "get_lender_ids":       return await delta.getLenderIds();
      case "get_token_info":       return await delta.getTokenInfo(input);
      case "get_token_price":      return await delta.getTokenPrice(input);
      case "get_token_balances":   return await delta.getTokenBalances(input);
      case "get_deposit_calldata": return await delta.getDepositCalldata(input);
      case "get_withdraw_calldata":return await delta.getWithdrawCalldata(input);
      case "get_borrow_calldata":  return await delta.getBorrowCalldata(input);
      case "get_repay_calldata":   return await delta.getRepayCalldata(input);
      default: return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

// ── Tx step extraction ────────────────────────────────────────────────────────

export interface TxStep {
  description: string;
  to: string;
  data: string;
  value: string;
  chainId?: number;
}

function chainIdFromMarketUid(uid: unknown): number | undefined {
  if (typeof uid !== "string") return undefined;
  const id = parseInt(uid.split(":")[1], 10);
  return isNaN(id) ? undefined : id;
}

function extractAction(toolName: string, rawJson: string, input: Record<string, unknown>): { steps: TxStep[]; quote?: Record<string, unknown> } {
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
    return { steps, quote: Object.keys(quoteSource).length > 0 ? quoteSource : undefined };
  } catch { return { steps: [] }; }
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are a helpful DeFi lending assistant. You have access to tools that query lending markets, " +
  "user positions, token balances, and generate calldata for deposit, withdraw, borrow, and repay operations. " +
  "Always use the available tools to answer questions — never say a task is outside your scope.\n\n" +

  "TOOL-USE STRATEGY — follow this order strictly:\n" +
  "1. Tools require exact chain IDs (numbers) and exact lender IDs (strings). Never guess these values.\n" +
  "2. Use the CHAIN ID REFERENCE below to resolve chain names to IDs without an extra tool call. " +
  "If the chain is NOT in the reference, call get_supported_chains first.\n" +
  "3. Use the LENDER ID REFERENCE below to resolve protocol names. " +
  "If the lender is NOT listed, call get_lender_ids first.\n" +
  "4. Use find_market with chainId + lender + assetGroup to locate a specific market. " +
  "Do NOT use get_token_info to check market availability — only for fetching decimals.\n" +
  "5. Call get_user_positions ONLY when the user explicitly asks about their positions.\n\n" +

  "CHAIN ID REFERENCE:\n" +
  "Ethereum:1, OP Mainnet:10, Cronos:25, Telos:40, XDC:50, BNB:56, Gnosis:100, Unichain:130, " +
  "Polygon:137, Monad:143, Sonic:146, Manta:169, Fantom:250, Metis:1088, Core DAO:1116, " +
  "Moonbeam:1284, Sei:1329, Soneium:1868, Morph:2818, Mantle:5000, Klaytn:8217, Base:8453, " +
  "Plasma:9745, Mode:34443, Arbitrum:42161, Hemi:43111, Avalanche:43114, Linea:59144, " +
  "Berachain:80094, Blast:81457, Taiko:167000, Scroll:534352, Katana:747474\n\n" +

  "LENDER ID REFERENCE: AAVE_V2, AAVE_V3, COMPOUND_V2, COMPOUND_V3, LENDLE, AURELIUS, MENDI, MOONWELL, SILO, RADIANT_V2\n\n" +

  "ASSET GROUP MAPPINGS: Use 'ETH' for WETH markets. All other tokens use their own symbol.\n\n" +

  "FORMATTING — render entities as interactive chips:\n" +
  "- Token: [SYMBOL](token:SYMBOL) e.g. [USDC](token:USDC)\n" +
  "- Chain: [Name](chain:CHAIN_ID) e.g. [Arbitrum](chain:42161)\n" +
  "- Protocol: [Name](market:LENDER_ID:CHAIN_ID) e.g. [Aave V3](market:AAVE_V3:42161)\n\n" +

  "APR DEFINITIONS:\n" +
  "- depositRate = protocol yield only. True yield = intrinsic asset APR + depositRate.\n" +
  "- variableBorrowRate = cost paid by borrower.\n" +
  "- Frame borrow rates as costs: 'you pay X% APR to borrow'.\n\n" +

  "LIQUIDITY: $0 available liquidity = 100% utilization = maximum deposit yield. Never warn against depositing due to low liquidity.\n\n" +

  "AFTER ACTIONS: The UI renders a Simulation panel automatically. Respond with ONE sentence only, e.g. 'Depositing 1 ETH on [Aave V3](market:AAVE_V3:1).' Nothing else.\n\n" +

  "AMOUNT CONVERSION: Before action tools — get price if user specified USD, get decimals via get_token_info, then amount = tokens × 10^decimals as integer string.";

// ── Agent loop ────────────────────────────────────────────────────────────────

export interface HistoryMessage { role: "user" | "assistant"; content: string; }

const CHAR_LIMIT = 6000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export async function runAgent(
  query: string,
  history: HistoryMessage[] = [],
): Promise<{ response: string; transactions?: TxStep[]; quote?: Record<string, unknown> }> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: query },
  ];

  const collectedTxSteps: TxStep[] = [];
  let collectedQuote: Record<string, unknown> | undefined;

  let response = await openai.chat.completions.create({ model: MODEL, max_completion_tokens: 4096, tools: TOOLS, messages });

  while (response.choices[0].finish_reason === "tool_calls") {
    const toolCalls = response.choices[0].message.tool_calls ?? [];
    messages.push(response.choices[0].message);

    for (const tc of toolCalls) {
      if (tc.type !== "function") continue;
      const input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      let result = await dispatchTool(tc.function.name, input);

      if (result.length > CHAR_LIMIT) result = result.slice(0, CHAR_LIMIT) + `\n[truncated]`;

      if (ACTION_TOOLS.has(tc.function.name)) {
        const { steps, quote } = extractAction(tc.function.name, result, input);
        collectedTxSteps.push(...steps);
        if (quote) collectedQuote = quote;
      }

      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }

    response = await openai.chat.completions.create({ model: MODEL, max_completion_tokens: 4096, tools: TOOLS, messages });
  }

  return {
    response: response.choices[0].message.content ?? "",
    ...(collectedTxSteps.length > 0 && { transactions: collectedTxSteps }),
    ...(collectedQuote && { quote: collectedQuote }),
  };
}
