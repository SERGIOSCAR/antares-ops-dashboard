import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

type AstroPoint = { time: string; height: number };

function parsePlainLines(raw: string): AstroPoint[] {
  const points: AstroPoint[] = [];
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // formats accepted:
    // 2026-04-01T00:00:00-03:00,1.12
    // 2026-04-01 00:00,1.12
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length !== 2) continue;
    const [timeRaw, heightRaw] = parts;
    const isoLike = timeRaw.includes("T") ? timeRaw : `${timeRaw.replace(" ", "T")}:00-03:00`;
    const dt = new Date(isoLike);
    if (Number.isNaN(dt.getTime())) continue;
    const height = Number(heightRaw.replace(",", "."));
    if (!Number.isFinite(height)) continue;
    points.push({ time: isoLike, height: Number(height.toFixed(2)) });
  }
  return points;
}

async function persist(year: number, incoming: AstroPoint[]) {
  const filePath = path.join(process.cwd(), "data", `astro_${year}.json`);
  let existing: AstroPoint[] = [];
  try {
    existing = JSON.parse(await fs.readFile(filePath, "utf8")) as AstroPoint[];
  } catch {
    existing = [];
  }

  const map = new Map<string, number>();
  existing.forEach((p) => map.set(p.time, p.height));
  incoming.forEach((p) => map.set(p.time, p.height));

  const merged = [...map.entries()]
    .map(([time, height]) => ({ time, height }))
    .sort((a, b) => a.time.localeCompare(b.time));

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(merged), "utf8");
  return { total: merged.length, added: incoming.length, filePath };
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  if (!Number.isInteger(year)) {
    return NextResponse.json({ error: "year query param required (e.g., ?year=2026)" }, { status: 400 });
  }

  const bodyText = await req.text();
  if (!bodyText.trim()) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  let parsed: AstroPoint[] = [];
  try {
    const asJson = JSON.parse(bodyText);
    if (Array.isArray(asJson)) {
      parsed = asJson
        .map((p) => ({
          time: p.time as string,
          height: Number((p.height as number | string) ?? NaN),
        }))
        .filter((p) => typeof p.time === "string" && Number.isFinite(p.height));
    }
  } catch {
    // not JSON, fall through to line parser
  }

  if (!parsed.length) {
    parsed = parsePlainLines(bodyText);
  }

  if (!parsed.length) {
    return NextResponse.json(
      { error: "Could not parse data. Use JSON array [{time,height}] or lines: 2026-04-01T00:00:00-03:00,1.12" },
      { status: 422 },
    );
  }

  const saved = await persist(year, parsed);
  return NextResponse.json(saved);
}
