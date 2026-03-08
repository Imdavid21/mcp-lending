/**
 * Direct HTTP client for the 1delta Portal API.
 * Replaces the MCP backend — no separate server needed.
 */

const API_BASE = "https://portal.1delta.io/v1";

async function get(endpoint: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const url = new URL(`${API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach(item => url.searchParams.append(k, String(item)));
    else url.searchParams.append(k, String(v));
  });

  const headers: Record<string, string> = {};
  const key = process.env.ONEDELTA_API_KEY;
  if (key) headers["x-api-key"] = key;

  const res = await fetch(url.toString(), { headers, next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`1delta API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Slim pools (same logic as backend) ───────────────────────────────────────

export function slimPools(raw: unknown, minTvlUsd = 10_000): { markets: unknown[]; filteredCount: number } {
  const rawData = (raw as Record<string, unknown>)?.data;
  const pools: Record<string, unknown>[] = Array.isArray(raw)
    ? raw
    : Array.isArray((rawData as Record<string, unknown>)?.items)
      ? (rawData as Record<string, unknown>).items as Record<string, unknown>[]
      : Array.isArray(rawData) ? rawData as Record<string, unknown>[] : [];

  const all = pools.map(m => {
    const tvl = parseFloat(m.totalDepositsUsd as string) || 0;
    const util = parseFloat(m.utilization as string) || 0;
    return {
      marketUid: m.marketUid,
      symbol: m.assetGroup ?? m.symbol ?? m.tokenSymbol ?? (m.underlying as Record<string, unknown>)?.symbol,
      depositRate: m.depositRate,
      variableBorrowRate: m.variableBorrowRate,
      totalDepositsUsd: tvl,
      availableLiquidityUsd: Math.round(tvl * (1 - util) * 100) / 100,
      utilization: util,
    };
  });

  const markets = all.filter(m => m.totalDepositsUsd >= minTvlUsd);
  return { markets, filteredCount: all.length - markets.length };
}

// ── Tool implementations ──────────────────────────────────────────────────────

export async function findMarket(p: Record<string, unknown>): Promise<string> {
  const raw = await get("/data/lending/pools", { chainId: p.chainId, assetGroups: p.assetGroup, underlyings: p.tokenAddress, lender: p.lender, count: p.count ?? 10 });
  return JSON.stringify(slimPools(raw, (p.minTvlUsd as number) ?? 10_000));
}

export async function getLendingMarkets(p: Record<string, unknown>): Promise<string> {
  const { minTvlUsd, ...rest } = p;
  const raw = await get("/data/lending/pools", rest);
  return JSON.stringify(slimPools(raw, (minTvlUsd as number) ?? 10_000));
}

export async function getUserPositions(p: Record<string, unknown>): Promise<string> {
  return JSON.stringify(await get("/data/lending/user-positions", p));
}

export async function getSupportedChains(): Promise<string> {
  return JSON.stringify(await get("/data/chains"));
}

export async function getLenderIds(): Promise<string> {
  return JSON.stringify(await get("/data/lender-ids"));
}

export async function getTokenInfo(p: Record<string, unknown>): Promise<string> {
  return JSON.stringify(await get("/data/token/available", p));
}

export async function getTokenPrice(p: Record<string, unknown>): Promise<string> {
  const raw = await get("/data/prices/latest", { assets: p.assets }) as Record<string, unknown>;
  const items = (raw?.data as Record<string, unknown>)?.items ?? raw;
  const assets = p.assets as string[];
  const filtered: Record<string, unknown> = {};
  if (items && typeof items === "object") {
    for (const key of assets) {
      if ((items as Record<string, unknown>)[key] !== undefined) filtered[key] = (items as Record<string, unknown>)[key];
    }
  }
  return JSON.stringify({ prices: Object.keys(filtered).length > 0 ? filtered : items });
}

export async function getTokenBalances(p: Record<string, unknown>): Promise<string> {
  return JSON.stringify(await get("/data/token/balances", p));
}

export async function getDepositCalldata(p: Record<string, unknown>): Promise<string> {
  return JSON.stringify(await get("/actions/lending/deposit", { ...p, simulate: true }));
}

export async function getWithdrawCalldata(p: Record<string, unknown>): Promise<string> {
  return JSON.stringify(await get("/actions/lending/withdraw", { ...p, simulate: true }));
}

export async function getBorrowCalldata(p: Record<string, unknown>): Promise<string> {
  return JSON.stringify(await get("/actions/lending/borrow", { ...p, simulate: true }));
}

export async function getRepayCalldata(p: Record<string, unknown>): Promise<string> {
  return JSON.stringify(await get("/actions/lending/repay", { ...p, simulate: true }));
}
