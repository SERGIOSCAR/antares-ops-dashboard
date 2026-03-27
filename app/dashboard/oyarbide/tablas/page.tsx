"use client";

import { useState } from "react";

export default function OyarbideAstroTablasPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    setStatus("Saving data...");
    try {
      const res = await fetch(`/api/astro-manual?year=${year}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save data.");
      setStatus(`Saved ${json.added} rows. Total now ${json.total}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto my-10 max-w-4xl px-5 font-sans text-slate-100">
      <h1 className="text-xl font-semibold text-slate-100">Oyarbide Astro-Tide Input</h1>
      <p className="mt-1 text-sm text-slate-300">
        Paste full-year astronomical tide data. Accepted formats: JSON array [&#123;time,height&#125;] or lines
        <code className="ml-1 rounded bg-slate-800 px-1 py-0.5 text-xs text-amber-200">
          2026-04-01T00:00:00-03:00,1.12
        </code>
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr,150px]">
        <textarea
          className="h-64 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder='[{"time":"2026-04-01T00:00:00-03:00","height":1.12}, ...]'
        />
        <div className="flex flex-col gap-3">
          <label className="text-xs text-slate-300">
            Year
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
              value={year}
              min={2020}
              max={2100}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={handleSave}
            className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          >
            {busy ? "Saving..." : "Save data"}
          </button>
          {status ? <div className="text-xs text-slate-200">{status}</div> : null}
        </div>
      </div>
    </main>
  );
}
