import { NextResponse } from "next/server";

export async function GET() {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  return NextResponse.json([{ id: model, company: "OpenAI", model }]);
}
