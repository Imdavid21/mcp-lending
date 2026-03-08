import { NextResponse } from "next/server";
import { PROVIDERS, PROVIDER_INFO } from "@/lib/providers/index";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(PROVIDERS.map(id => ({ id, ...PROVIDER_INFO[id] })));
}
