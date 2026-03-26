"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { Data, Layout } from "plotly.js-dist-min";
import { generateAiComment } from "@/lib/aiComment";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

type ForecastResponse = {
  times: string[];
  forecastTide: number[];
  forecastDraft: number[];
  astroTide: number[];
  astroDraft: number[];
  error?: string;
};

const DEFAULT_DEPTH = 10.4;

function toNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function OyarbideDraftPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [depth, setDepth] = useState<number>(() => toNumber(searchParams.get("depth")) ?? DEFAULT_DEPTH);
  const [requiredDraft, setRequiredDraft] = useState<number | undefined>(() =>
    toNumber(searchParams.get("requiredDraft")),
  );
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiComment, setAiComment] = useState<string | null>(null);
  const [watermarkEnabled] = useState(false);
  const [astroRange, setAstroRange] = useState<{ first: string; last: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const updateQueryParams = (nextDepth: number, nextRequired?: number) => {
    const params = new URLSearchParams();
    params.set("depth", nextDepth.toString());
    if (typeof nextRequired === "number" && !Number.isNaN(nextRequired)) {
      params.set("requiredDraft", nextRequired.toString());
    }
    router.replace(`/dashboard/oyarbide?${params.toString()}`, { scroll: false });
  };

  const fetchForecast = async () => {
    setLoading(true);
    setError(null);
    setAiComment(null);

    try {
      const params = new URLSearchParams({ depth: depth.toString() });
      const res = await fetch(`/api/oyarbide-draft?${params.toString()}`, { cache: "no-store" });
      const raw = await res.text();
      let body: ForecastResponse | null = null;
      try {
        body = raw ? (JSON.parse(raw) as ForecastResponse) : null;
      } catch {
        body = null;
      }

      if (!res.ok || !body) {
        throw new Error(body?.error ?? `API error (${res.status})`);
      }
      if (body.error) {
        throw new Error(body.error);
      }
      if (!body.times.length) {
        throw new Error("No astronomical tide data available. Please add data via Astro-Tide Input.");
      }

      setData(body);
      updateQueryParams(depth, requiredDraft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  const handleAskAi = async () => {
    if (!data) return;
    setAiLoading(true);
    setAiComment("Preparing AI summary...");
    try {
      const safetyMargin = 0.05;
      const rows = data.times.map((t, idx) => ({
        datetime: t,
        forecastDraft: data.forecastDraft[idx],
      }));
      const response = await fetch("/api/ai/oyarbide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requiredDraft,
          safetyMargin,
          data: rows,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "AI request failed");
      setAiComment(json.result);
    } catch (err) {
      setAiComment(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadRange = async () => {
      try {
        const res = await fetch("/api/astro-range", { cache: "no-store" });
        const body = await res.json();
        if (res.ok && body.first && body.last) {
          setAstroRange({ first: body.first, last: body.last });
        }
      } catch {
        // silent fail, not critical
      }
    };
    loadRange();
  }, []);

  const chartData = useMemo<Partial<Data>[]>(() => {
    if (!data) return [];

    const traces: Partial<Data>[] = [
      {
        x: data.times,
        y: data.forecastDraft,
        type: "scatter",
        mode: "lines",
        name: "Forecast Draft",
        line: { color: "#22d3ee", width: 2, shape: "spline" },
      },
      {
        x: data.times,
        y: data.astroDraft,
        type: "scatter",
        mode: "lines",
        name: "Astronomical Draft",
        line: { color: "#f59e0b", width: 2, dash: "dot", shape: "spline" },
      },
    ];

    if (typeof requiredDraft === "number") {
      traces.push({
        x: data.times,
        y: data.times.map(() => requiredDraft),
        type: "scatter",
        mode: "lines",
        name: "Required Draft",
        line: { color: "#ef4444", dash: "dot" },
        hoverinfo: "skip",
      });
    }

    return traces;
  }, [data, requiredDraft]);

  const dayShades = useMemo(() => {
    if (!data?.times.length) return [];
    const shades: Layout["shapes"] = [];
    let startIdx = 0;
    const getDay = (iso: string) => new Date(iso).toISOString().slice(0, 10);
    for (let i = 1; i < data.times.length; i += 1) {
      if (getDay(data.times[i]) !== getDay(data.times[startIdx])) {
        shades.push({
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: data.times[startIdx],
          x1: data.times[i],
          y0: 0,
          y1: 1,
          fillcolor: shades.length % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
          line: { width: 0 },
          layer: "below",
        });
        startIdx = i;
      }
    }
    shades.push({
      type: "rect",
      xref: "x",
      yref: "paper",
      x0: data.times[startIdx],
      x1: data.times[data.times.length - 1],
      y0: 0,
      y1: 1,
      fillcolor: shades.length % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
      line: { width: 0 },
      layer: "below",
    });
    return shades;
  }, [data]);

  const referenceLines = useMemo(() => {
    const lines: Layout["shapes"] = [];
    const values = [10.1, 10.2, 10.3, 10.4, 10.5];
    values.forEach((y) => {
      lines.push({
        type: "line",
        xref: "paper",
        yref: "y",
        x0: 0,
        x1: 1,
        y0: y,
        y1: y,
        line: { color: "rgba(255,255,255,0.18)", width: 1 },
        layer: "below",
      });
    });
    return lines;
  }, []);

  const layout = useMemo<Partial<Layout>>(
    () => ({
      margin: { l: 70, r: 50, t: 24, b: 70 },
      paper_bgcolor: "#0f172a",
      plot_bgcolor: "#0f172a",
      font: { color: "#e2e8f0" },
      legend: { orientation: "h" as const, x: 0, y: 1.15 },
      yaxis: {
        title: "Draft (m)",
        zeroline: false,
        gridcolor: "#1f2937",
        tickformat: ".2f",
        dtick: 0.5,
        range: [10, 11],
      },
      xaxis: {
        gridcolor: "#1f2937",
        tickangle: 45,
      },
      shapes: [...dayShades, ...referenceLines],
      images: watermarkEnabled
        ? [
            {
              source:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='60'%3E%3Ctext x='0' y='40' font-size='32' fill='rgba(148,163,184,0.15)'%3EOyarbide%3C/text%3E%3C/svg%3E",
              xref: "paper",
              yref: "paper",
              x: 0.5,
              y: 0.5,
              sizex: 0.6,
              sizey: 0.6,
              xanchor: "center" as const,
              yanchor: "middle" as const,
              opacity: 0.2,
            },
          ]
        : [],
    }),
    [watermarkEnabled, dayShades],
  );

  const tableRows = useMemo(() => {
    if (!data) return [];
    const rows: {
      time: string;
      forecast: number;
      forecastTide: number;
      astro: number;
      astroTide: number;
    }[] = [];
    data.times.forEach((t, idx) => {
      if (idx % 6 !== 0) return; // sample every 6 hours
      rows.push({
        time: t,
        forecast: data.forecastDraft[idx] ?? NaN,
        forecastTide: data.forecastTide[idx] ?? NaN,
        astro: data.astroDraft[idx] ?? NaN,
        astroTide: data.astroTide[idx] ?? NaN,
      });
    });
    return rows;
  }, [data]);

  return (
    <main className="mx-auto my-10 max-w-5xl px-5 font-sans text-slate-900">
      <header className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Oyarbide Draft Forecast</h1>
          <p className="text-sm text-slate-300">Operational overlay of forecasted draft and astronomical tide.</p>
        </div>
        <div className="text-xs text-slate-400">
          Depth default: {DEFAULT_DEPTH.toFixed(2)} m
        </div>
      </header>

      <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col text-sm text-slate-200">
            Depth (m)
            <input
              type="number"
              step="0.01"
              className="mt-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400"
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
            />
          </label>

          <label className="flex flex-col text-sm text-slate-200">
            Required Draft (m, optional)
            <input
              type="number"
              step="0.01"
              className="mt-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400"
              value={requiredDraft ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setRequiredDraft(val === "" ? undefined : Number(val));
              }}
              placeholder="e.g. 10.80"
            />
          </label>

          <div className="flex items-end gap-3">
            <button
              type="button"
              onClick={fetchForecast}
              disabled={loading}
              className="flex-1 rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? "Generating..." : "Generate Forecast"}
            </button>
            <button
              type="button"
              onClick={handleAskAi}
              disabled={loading || !data}
              className="rounded-md border border-amber-400 px-3 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:border-slate-600 disabled:text-slate-400"
              title="Generate AI operational comment"
            >
              Ask AI Comment
            </button>
          </div>
        </div>
      </section>

      <div className="mb-4 text-sm text-slate-300">
        Need to update astronomical tide data? Use the{" "}
        <Link className="text-amber-300 underline" href="/dashboard/oyarbide/tablas">
          Oyarbide Astro-Tide Input
        </Link>
        .
      </div>
      {astroRange ? (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Present astronomical tide table loaded:{" "}
          {new Date(astroRange.first).toLocaleString("en-GB", {
            timeZone: "America/Argentina/Buenos_Aires",
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          ➜{" "}
          {new Date(astroRange.last).toLocaleString("en-GB", {
            timeZone: "America/Argentina/Buenos_Aires",
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      ) : null}

      <section className="mb-4 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-slate-200">Forecast vs Astronomical Tide</span>
          {error ? <span className="text-xs text-rose-400">{error}</span> : null}
        </div>
        <div className="min-h-[320px]">
          {data ? (
            <Plot
              data={chartData}
              layout={layout}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
              config={{ displaylogo: false, responsive: true, modeBarButtonsToRemove: ["zoomIn2d", "zoomOut2d"] }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              {loading ? "Loading forecast..." : "No data yet. Generate to view the chart."}
            </div>
          )}
        </div>
      </section>

      {data ? (
        <section className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-sm">
          <table className="min-w-full text-sm text-slate-200">
            <thead className="border-b border-slate-700">
              <tr>
                <th className="px-2 py-2 text-left text-base font-semibold text-slate-100">Date</th>
                <th className="px-2 py-2 text-left text-base font-semibold text-slate-100">Time (HOA)</th>
                <th className="px-3 py-2 text-center text-base font-semibold text-slate-100">Forecast Draft</th>
                <th className="px-3 py-2 text-center text-base font-semibold text-slate-100">Forecast Tide</th>
                <th className="px-3 py-2 text-center text-base font-semibold text-slate-100">Astronomical Draft</th>
                <th className="px-3 py-2 text-center text-base font-semibold text-slate-100">Astronomical Tide</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let lastDay = "";
                return tableRows.map((row) => {
                const dt = new Date(row.time);
                const dayLabel = dt.toLocaleDateString("en-GB", {
                  timeZone: "America/Argentina/Buenos_Aires",
                  day: "2-digit",
                  month: "short",
                });
                const timeLabel = dt.toLocaleTimeString("en-GB", {
                  timeZone: "America/Argentina/Buenos_Aires",
                  hour: "2-digit",
                  minute: "2-digit",
                  });
                  const showDay = dayLabel !== lastDay ? dayLabel : "";
                  lastDay = dayLabel;
                  return (
                    <tr key={row.time} className="border-t border-slate-800">
                      <td className="px-2 py-1 text-sm">{showDay}</td>
                      <td className="px-2 py-1 text-sm text-slate-200">{timeLabel}</td>
                      <td
                        className={`px-3 py-1 text-center text-sm ${
                          row.forecast < 10.45 ? "text-slate-500" : "text-slate-100"
                        }`}
                      >
                        {row.forecast.toFixed(2)}
                      </td>
                      <td className="px-3 py-1 text-center text-sm text-slate-400 font-normal">
                        {row.forecastTide.toFixed(2)}
                      </td>
                      <td
                        className={`px-3 py-1 text-center text-sm ${
                          row.astro < 10.45 ? "text-slate-500" : "text-slate-100"
                        }`}
                      >
                        {row.astro.toFixed(2)}
                      </td>
                      <td className="px-3 py-1 text-center text-sm text-slate-400 font-normal">{row.astroTide.toFixed(2)}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
        <div className="text-sm font-medium text-slate-100">AI comment (reserved)</div>
        <p className="mt-2 text-sm text-slate-300">
          {aiComment ?? "AI commentary placeholder. This will summarize navigational draft risks once enabled."}
        </p>
      </section>
    </main>
  );
}

export default function OyarbideDraftPage() {
  return (
    <Suspense fallback={<div className="p-4 text-slate-200">Loading...</div>}>
      <OyarbideDraftPageContent />
    </Suspense>
  );
}
