"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PREDEFINED_EVENTS } from "@/lib/event-options";
import { formatDateTime } from "@/lib/format-date";

type RunningSofEvent = {
  id: string;
  from: string;
  to: string;
  reason: string;
};

type RowState = RunningSofEvent & {
  saving?: boolean;
  deleting?: boolean;
};

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function normalizeDateInput(value: string) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2})[-\/](\d{1,2}|\w{3})\s+(\d{2}):(\d{2})$/i);
  if (!m) return "";
  const day = Number(m[1]);
  const monthToken = m[2].toLowerCase();
  const hour = m[3];
  const minute = m[4];
  const month = MONTH_MAP[monthToken] ?? Number(monthToken);
  if (!Number.isInteger(month) || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const year = new Date().getFullYear();
  return `${year}-${pad(month)}-${pad(day)}T${hour}:${minute}:00`;
}

function toDisplayDate(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  // dd-MMM HH:mm without year in the input box
  return `${pad(parsed.getDate())}-${parsed.toLocaleString("en-GB", { month: "short" })} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function splitReason(reason: string) {
  const [eventType, ...rest] = String(reason || "").split(" - ");
  const addon = rest.join(" - ");
  return { eventType: eventType || "", addon: addon || "" };
}

function buildReason(eventType: string, addon: string) {
  const base = eventType.trim();
  const extra = addon.trim();
  if (base && extra) return `${base} - ${extra}`;
  return base || extra;
}

export default function RunningSofEditor({
  vesselId,
  events,
}: {
  vesselId: string;
  events: RunningSofEvent[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(events);
  const hasRows = useMemo(() => rows.length > 0, [rows]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ from: string; eventType: string; addon: string }>({
    from: "",
    eventType: "",
    addon: "",
  });
  const [newRow, setNewRow] = useState({
    from: "",
    to: "",
    eventType: "",
    addon: "",
  });
  const [adding, setAdding] = useState(false);
  const fieldClass =
    "w-full touch-manipulation rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const saveRow = async (row: RowState) => {
    if (!row.reason.trim()) {
      alert("Event is required.");
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, saving: true } : r)));
    try {
      const res = await fetch(`/api/shiftreporter/vessels/${vesselId}/running-sof-events/${row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromInputDateTime(row.from),
          to: row.to ? fromInputDateTime(row.to) : "",
          reason: row.reason.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update event");

      alert("Running SOF event updated.");
      router.refresh();
    } catch (error: unknown) {
      alert(`Error: ${error instanceof Error ? error.message : "Failed to update event"}`);
    } finally {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, saving: false } : r)));
    }
  };

  const deleteRow = async (id: string) => {
    const confirmed = confirm("Delete this running SOF event?");
    if (!confirmed) return;

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, deleting: true } : r)));
    try {
      const res = await fetch(`/api/shiftreporter/vessels/${vesselId}/running-sof-events/${id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to delete event");

      setRows((prev) => prev.filter((r) => r.id !== id));
      alert("Running SOF event deleted.");
      router.refresh();
    } catch (error: unknown) {
      alert(`Error: ${error instanceof Error ? error.message : "Failed to delete event"}`);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, deleting: false } : r)));
    }
  };

  const addRow = async () => {
    const reason = buildReason(newRow.eventType, newRow.addon);
    const fromIso = normalizeDateInput(newRow.from);
    const toIso = newRow.to ? normalizeDateInput(newRow.to) : "";
    if (!fromIso || !reason.trim()) {
      alert("FROM (dd-MMM HH:mm) and event are required.");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(`/api/shiftreporter/vessels/${vesselId}/running-sof-events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromIso,
          to: toIso,
          reason,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to add event");

      setNewRow({ from: "", to: "", eventType: "", addon: "" });
      alert("Running SOF event added.");
      router.refresh();
    } catch (error: unknown) {
      alert(`Error: ${error instanceof Error ? error.message : "Failed to add event"}`);
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (row: RowState) => {
    const { eventType, addon } = splitReason(row.reason);
    setEditingId(row.id);
    setEditDraft({
      from: toDisplayDate(row.from),
      eventType,
      addon,
    });
  };

  const saveEdit = async (row: RowState) => {
    const reason = buildReason(editDraft.eventType, editDraft.addon);
    const fromIso = normalizeDateInput(editDraft.from);
    if (!fromIso || !reason.trim()) {
      alert("FROM (dd-MMM HH:mm) and event are required.");
      return;
    }
    await saveRow({
      ...row,
      from: fromIso,
      reason,
    });
    setEditingId(null);
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-slate-100">Running SOF Editor</h3>
      <p className="mb-3 text-xs text-slate-400">Anyone with access can add, edit, or delete running SOF events.</p>

      <div className="mb-3 grid grid-cols-12 items-end gap-2 rounded border border-slate-700 p-3">
        <div className="col-span-12 md:col-span-2">
          <label className="mb-1 block text-xs text-slate-400">From</label>
          <input
            type="text"
            value={newRow.from}
            onChange={(e) => setNewRow((prev) => ({ ...prev, from: e.target.value }))}
            placeholder="dd-MMM HH:mm"
            className={fieldClass}
          />
        </div>
        <div className="col-span-12 md:col-span-2">
          <label className="mb-1 block text-xs text-slate-400">To</label>
          <input
            type="text"
            value={newRow.to}
            onChange={(e) => setNewRow((prev) => ({ ...prev, to: e.target.value }))}
            placeholder="dd-MMM HH:mm"
            className={fieldClass}
          />
        </div>
        <div className="col-span-12 md:col-span-4">
          <label className="mb-1 block text-xs text-slate-400">Type/select event</label>
          <input
            type="text"
            list="predefined-events"
            value={newRow.eventType}
            onChange={(e) => setNewRow((prev) => ({ ...prev, eventType: e.target.value }))}
            placeholder="Type/select event"
            className={fieldClass}
          />
        </div>
        <div className="col-span-12 md:col-span-3">
          <label className="mb-1 block text-xs text-slate-400">Specific add-on / manual text</label>
          <input
            type="text"
            value={newRow.addon}
            onChange={(e) => setNewRow((prev) => ({ ...prev, addon: e.target.value }))}
            placeholder="Specific add-on / manual text"
            className={fieldClass}
          />
        </div>
        <button
          type="button"
          onClick={addRow}
          disabled={adding}
          className="col-span-12 min-h-[44px] rounded bg-zinc-900 px-2 py-2 text-sm text-white disabled:opacity-50 md:col-span-1"
        >
          {adding ? "..." : "Add"}
        </button>
      </div>

      {!hasRows ? (
        <p className="text-sm text-slate-400">No events to edit.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Event</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {rows.map((row) => (
                <tr key={row.id} className="bg-slate-900">
                  <td className="px-3 py-2">
                    {editingId === row.id ? (
                      <input
                        type="text"
                        value={editDraft.from}
                        onChange={(e) => setEditDraft((prev) => ({ ...prev, from: e.target.value }))}
                        placeholder="dd-MMM HH:mm"
                        className={fieldClass}
                      />
                    ) : (
                      <span className="text-slate-400">{formatDateTime(row.from)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === row.id ? (
                      <div className="grid grid-cols-12 gap-2">
                        <input
                          type="text"
                          list="predefined-events"
                          value={editDraft.eventType}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, eventType: e.target.value }))}
                          className="col-span-5 md:col-span-5 touch-manipulation rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Type/select event"
                        />
                        <input
                          type="text"
                          value={editDraft.addon}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, addon: e.target.value }))}
                          className="col-span-7 md:col-span-7 touch-manipulation rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Specific add-on / manual text"
                        />
                      </div>
                    ) : (
                      <span className="text-slate-200">{row.reason}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      {editingId === row.id ? (
                        <>
                          <button
                            className="min-h-[44px] touch-manipulation text-blue-400 hover:text-blue-300"
                            onClick={() => saveEdit(row)}
                            disabled={!!row.saving}
                          >
                            Save
                          </button>
                          <button
                            className="min-h-[44px] touch-manipulation text-slate-300 hover:text-slate-200"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="min-h-[44px] touch-manipulation text-blue-400 hover:text-blue-300"
                            onClick={() => startEdit(row)}
                          >
                            Edit
                          </button>
                          <button
                            className="min-h-[44px] touch-manipulation text-red-400 hover:text-red-300"
                            onClick={() => deleteRow(row.id)}
                            disabled={!!row.deleting}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-400">
        Tip: start typing to search the predefined list, or scroll the dropdown arrow.
      </p>
      <datalist id="predefined-events">
        {PREDEFINED_EVENTS.map((event) => (
          <option key={event} value={event} />
        ))}
      </datalist>
    </div>
  );
}
