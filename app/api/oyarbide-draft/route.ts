import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { parseForecastSvg } from "@/lib/parseSvg";
import { alignByNearestHour } from "@/lib/timeAlign";
import { tideToDraft } from "@/lib/draftConversion";

const SVG_URL = "https://api.shn.gob.ar/imagenes-modelo/curvas_altura-total/Alturatotal_Oyarvide.svg";
const ASTRO_FILE = path.join(process.cwd(), "data", "astro_2026.json");
const DEFAULT_DEPTH = 10.4;

interface AstroRow {
  time: string;
  height: number;
}

async function loadAstro(): Promise<AstroRow[]> {
  const raw = await fs.readFile(ASTRO_FILE, "utf8");
  return JSON.parse(raw) as AstroRow[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const depthParam = searchParams.get("depth");
  const depth = depthParam ? Number(depthParam) : DEFAULT_DEPTH;

  if (!Number.isFinite(depth)) {
    return NextResponse.json({ error: "Invalid depth value." }, { status: 400 });
  }

  let svgText: string;
  try {
    const res = await fetch(SVG_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch SVG (${res.status})`);
    }
    svgText = await res.text();
  } catch (error) {
    console.error("[oyarbide-draft] SVG fetch error", error);
    return NextResponse.json(
      { error: "Unable to retrieve forecast SVG." },
      { status: 502 },
    );
  }

  const parsed = parseForecastSvg(svgText);
  if (!parsed.times.length || !parsed.tides.length) {
    return NextResponse.json(
      { error: "No forecast points detected in SVG." },
      { status: 502 },
    );
  }

  const forecastPoints = parsed.times.map((time, index) => {
    const tide = parsed.tides[index] ?? parsed.tides.at(-1) ?? 0;
    return { time, tide };
  });

  // Resample forecast to hourly to align with astro resolution
  const hourlyForecast: typeof forecastPoints = [];
  if (forecastPoints.length >= 2) {
    const start = forecastPoints[0].time;
    const end = forecastPoints[forecastPoints.length - 1].time;
    for (let t = new Date(start); t <= end; t = new Date(t.getTime() + 60 * 60 * 1000)) {
      // find surrounding points
      const nextIndex = forecastPoints.findIndex((p) => p.time >= t);
      if (nextIndex === -1 || nextIndex === 0) {
        hourlyForecast.push({ time: new Date(t), tide: forecastPoints[0].tide });
        continue;
      }
      const prev = forecastPoints[nextIndex - 1];
      const next = forecastPoints[nextIndex];
      const span = next.time.getTime() - prev.time.getTime();
      const pct = span === 0 ? 0 : (t.getTime() - prev.time.getTime()) / span;
      const tide = prev.tide + pct * (next.tide - prev.tide);
      hourlyForecast.push({ time: new Date(t), tide });
    }
  } else {
    hourlyForecast.push(...forecastPoints);
  }

  const astroRows = await loadAstro();
  const astroPoints = astroRows
    .map((row) => ({
      time: new Date(row.time),
      tide: row.height,
    }))
    .filter((item) => Number.isFinite(item.time.getTime()) && Number.isFinite(item.tide));

  const toHourKey = (d: Date) => {
    const dt = new Date(d);
    dt.setMinutes(0, 0, 0);
    return dt.toISOString();
  };

  const astroMap = new Map<string, number>();
  astroPoints.forEach((p) => astroMap.set(toHourKey(p.time), p.tide));

  const forecastMap = new Map<string, number>();
  (hourlyForecast.length ? hourlyForecast : forecastPoints).forEach((p) =>
    forecastMap.set(toHourKey(p.time), p.tide),
  );

  const commonKeys = [...forecastMap.keys()].filter((k) => astroMap.has(k)).sort();

  const times: string[] = [];
  const forecastTide: number[] = [];
  const forecastDraft: number[] = [];
  const astroTide: number[] = [];
  const astroDraft: number[] = [];

  for (const key of commonKeys) {
    const ft = forecastMap.get(key)!;
    const at = astroMap.get(key)!;
    try {
      const forecastDraftPoint = tideToDraft(ft, depth).draft;
      const astroDraftPoint = tideToDraft(at, depth).draft;

      times.push(key);
      forecastTide.push(Number(ft.toFixed(2)));
      forecastDraft.push(forecastDraftPoint);
      astroTide.push(Number(at.toFixed(2)));
      astroDraft.push(astroDraftPoint);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Conversion error" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    times,
    forecastTide,
    forecastDraft,
    astroTide,
    astroDraft,
  });
}
