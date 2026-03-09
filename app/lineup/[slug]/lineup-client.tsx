"use client";

import { useMemo, useState } from "react";

type Item = {
  id: string;
  vessel_name: string;
  port: string | null;
  terminal: string | null;
  cargo_operation: string | null;
  cargo_grade: string | null;
  cargo_qty: number | null;
  status: string;
  lineup: {
    content: string;
    version: number;
    updated_at: string;
  } | null;
};

export default function LineupClient({
  slug,
  subAgentName,
  initialItems,
}: {
  slug: string;
  subAgentName: string;
  initialItems: Item[];
}) {
  const [items, setItems] = useState(initialItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [textById, setTextById] = useState<Record<string, string>>(
    Object.fromEntries(initialItems.map((x) => [x.id, x.lineup?.content || ""])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const visible = useMemo(() => items, [items]);

  const saveLineup = async (appointmentId: string) => {
    const current = items.find((x) => x.id === appointmentId);
    if (!current) return;
    setSavingId(appointmentId);
    setMessage("");
    try {
      const res = await fetch("/api/vesselmanager/lineup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: appointmentId,
          content: textById[appointmentId] || "",
          expected_version: current.lineup?.version || 0,
          updated_by: slug,
          updated_by_type: "subagent",
          source: `lineup/${slug}`,
        }),
      });
      const json = (await res.json()) as { error?: string; data?: { content: string; version: number; updated_at: string } };
      if (!res.ok) throw new Error(json.error || "Failed to save lineup");
      setItems((prev) =>
        prev.map((row) =>
          row.id === appointmentId
            ? { ...row, lineup: json.data ? { content: json.data.content, version: json.data.version, updated_at: json.data.updated_at } : row.lineup }
            : row,
        ),
      );
      setMessage("Saved.");
      setActiveId(null);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Failed to save lineup");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Line Up - {subAgentName}</h1>
          <p className="mt-1 text-sm text-slate-300">Active assigned vessels</p>
        </div>
        <div className="flex items-center gap-3">
          <img
            src="https://antaresshipping.com/wp-content/uploads/2023/12/Antares-Ship-Agent.webp"
            alt="Antares Ship Agents"
            className="h-7 w-auto select-none opacity-70 grayscale"
            loading="lazy"
          />
        </div>
      </div>
      {message ? <div className="mt-4 text-sm text-amber-300">{message}</div> : null}

      <div className="mt-6 space-y-3">
        {visible.length === 0 ? (
          <div className="rounded border border-slate-700 bg-slate-900 p-4 text-slate-300">No active assigned vessels.</div>
        ) : (
          visible.map((row) => (
            <div key={row.id} className="rounded border border-slate-700 bg-slate-900 p-4">
              <button
                type="button"
                className="text-left text-lg font-semibold text-slate-100 hover:underline"
                onClick={() => setActiveId((prev) => (prev === row.id ? null : row.id))}
              >
                {row.vessel_name}
              </button>
              <div className="mt-1 text-sm text-slate-400">
                {[row.port, row.terminal].filter(Boolean).join(" - ")} | {row.status}
              </div>
              {activeId === row.id ? (
                <div className="mt-3">
                  <textarea
                    rows={14}
                    className="w-full rounded border border-slate-700 bg-slate-950 p-3 text-slate-200"
                    style={{ fontFamily: "Courier New, monospace", fontSize: "11px" }}
                    value={textById[row.id] || ""}
                    onChange={(e) => setTextById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                      onClick={() => void saveLineup(row.id)}
                      disabled={savingId === row.id}
                    >
                      {savingId === row.id ? "Saving..." : "Save & Close"}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800"
                      onClick={() => setActiveId(null)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
