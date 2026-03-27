import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

type AstroPoint = { time: string; height: number };

async function loadLatestYearFile() {
  const dataDir = path.join(process.cwd(), "data");
  const entries = await fs.readdir(dataDir);
  const astroFiles = entries.filter((f) => /^astro_\d{4}\.json$/.test(f)).sort();
  if (!astroFiles.length) throw new Error("No astro files found");
  return path.join(dataDir, astroFiles.at(-1)!);
}

export async function GET() {
  try {
    const file = await loadLatestYearFile();
    const raw = await fs.readFile(file, "utf8");
    const rows = JSON.parse(raw) as AstroPoint[];
    if (!rows.length) {
      return NextResponse.json({ error: "Astro file empty" }, { status: 404 });
    }
    const times = rows.map((r) => r.time).sort();
    return NextResponse.json({ file: path.basename(file), first: times[0], last: times[times.length - 1] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to read astro range" },
      { status: 500 },
    );
  }
}
