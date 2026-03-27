import OpenAI from "openai";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OYARBIDE_SYSTEM_PROMPT } from "@/lib/ai/oyarbideAssistant";

function resolveApiKey() {
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey && envKey.length > 40) return envKey;
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const raw = fs.readFileSync(envPath, "utf8");
    const match = raw.match(/^OPENAI_API_KEY=(.+)$/m);
    if (match && match[1].trim().length > 40) {
      return match[1].trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const apiKey = resolveApiKey();
    if (!apiKey) {
      console.error("[ai/oyarbide] Missing OPENAI_API_KEY");
      return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
    }
    console.log("[ai/oyarbide] Using key", apiKey.slice(0, 10));

    const client = new OpenAI({ apiKey });
    const body = await req.json();
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: OYARBIDE_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(body) },
      ],
    });

    return NextResponse.json({
      result: completion.choices[0]?.message?.content ?? "No AI comment available.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI request failed" },
      { status: 500 },
    );
  }
}
