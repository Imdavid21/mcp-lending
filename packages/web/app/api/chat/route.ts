import { NextRequest, NextResponse } from "next/server";
import { createMCPSession, callMCPTool, extractAction, ACTION_TOOLS, type TxStep } from "@/lib/mcp";
import { createProvider } from "@/lib/providers/index";
import type { HistoryMessage } from "@/lib/providers/types";

export const runtime = "nodejs";
// Allow up to 5 minutes for agentic LLM loops with multiple tool calls.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let session: Awaited<ReturnType<typeof createMCPSession>> | undefined;

  try {
    const { query, userAddress, provider, history } = (await req.json()) as {
      query?: string;
      userAddress?: string;
      provider?: string;
      history?: HistoryMessage[];
    };

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "query field is required" }, { status: 400 });
    }

    session = await createMCPSession();
    const { tools } = await session.client.listTools();

    const aiProvider = createProvider(provider);
    const fullQuery = userAddress ? `The user's connected wallet address is: ${userAddress}\n\n${query}` : query;

    const collectedTxSteps: TxStep[] = [];
    let collectedQuote: Record<string, unknown> | undefined;

    const trackingCallTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
      const result = await callMCPTool(session!.client, name, input);
      if (ACTION_TOOLS.has(name)) {
        const { steps, quote } = extractAction(name, result, input);
        collectedTxSteps.push(...steps);
        if (quote) collectedQuote = quote;
      }
      return result;
    };

    const MAX_HISTORY = 10;
    const trimmedHistory = (history ?? []).slice(-MAX_HISTORY);
    const response = await aiProvider.processQuery(fullQuery, tools, trackingCallTool, trimmedHistory);

    return NextResponse.json({
      response,
      ...(collectedTxSteps.length > 0 && { transactions: collectedTxSteps }),
      ...(collectedQuote && { quote: collectedQuote }),
    });
  } catch (err) {
    console.error("Error processing chat request:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await session?.close().catch(() => {});
  }
}
