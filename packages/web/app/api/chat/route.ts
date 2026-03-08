import { NextRequest, NextResponse } from "next/server";
import { runAgent, type HistoryMessage } from "@/lib/agent";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { query, userAddress, history } = (await req.json()) as {
      query?: string;
      userAddress?: string;
      history?: HistoryMessage[];
    };

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const fullQuery = userAddress
      ? `The user's connected wallet address is: ${userAddress}\n\n${query}`
      : query;

    const MAX_HISTORY = 10;
    const result = await runAgent(fullQuery, (history ?? []).slice(-MAX_HISTORY));
    return NextResponse.json(result);
  } catch (err) {
    console.error("Chat error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
