"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

type RunningSofEvent = {
  id: string;
  shiftId: string;
  from: string;
  to: string;
  reason: string;
};

type ShiftOption = {
  id: string;
  label: string;
};

type RowState = RunningSofEvent & {
  saving?: boolean;
  deleting?: boolean;
};

function toInputDateTime(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(" ", "T");
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized;
}

function fromInputDateTime(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return `${raw}:00`;
}

export default function RunningSofEditor({
  vesselId,
  events,
  shiftOptions,
}: {
  vesselId: string;
  events: RunningSofEvent[];
  shiftOptions: ShiftOption[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(events);
  const hasRows = useMemo(() => rows.length > 0, [rows]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ from: string; reason: string }>({ from: "", reason: "" });
  const [newRow, setNewRow] = useState({
    shiftId: shiftOptions[0]?.id || "",
    from: "",
    to: "",
    reason: "",
  });
  const [adding, setAdding] = useState(false);
  const fieldClass =
    "w-full touch-manipulation rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const withToken = async () => {
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  };

  const saveRow = async (row: RowState) => {
    if (!row.reason.trim()) {
      alert("Reason is required.");
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, saving: true } : r)));
    try {
      const token = await withToken();
      const res = await fetch(`/api/shiftreporter/vessels/${vesselId}/running-sof-events/${row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
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
      const token = await withToken();
      const res = await fetch(`/api/shiftreporter/vessels/${vesselId}/running-sof-events/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
    if (!newRow.shiftId || !newRow.from || !newRow.reason.trim()) {
      alert("Shift, FROM and reason are required.");
      return;
    }

    setAdding(true);
    try {
      const token = await withToken();
      const res = await fetch(`/api/shiftreporter/vessels/${vesselId}/running-sof-events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          shiftId: newRow.shiftId,
          from: fromInputDateTime(newRow.from),
          to: newRow.to ? fromInputDateTime(newRow.to) : "",
          reason: newRow.reason.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to add event");

      setNewRow((prev) => ({ ...prev, from: "", to: "", reason: "" }));
      alert("Running SOF event added.");
      router.refresh();
    } catch (error: unknown) {
      alert(`Error: ${error instanceof Error ? error.message : "Failed to add event"}`);
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (row: RowState) => {
    setEditingId(row.id);
    setEditDraft({
      from: toInputDateTime(row.from),
      reason: row.reason,
    });
  };

  const saveEdit = async (row: RowState) => {
    await saveRow({
      ...row,
      from: editDraft.from,
      reason: editDraft.reason,
    });
    setEditingId(null);
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-slate-100">Running SOF Editor</h3>
      <p className="mb-3 text-xs text-slate-400">Admin can add, edit, or delete any running SOF event.</p>

      <div className="mb-3 grid grid-cols-12 items-end gap-2 rounded border border-slate-700 p-3">
        <div className="col-span-3">
          <label className="mb-1 block text-xs text-slate-400">Shift</label>
          <select
            value={newRow.shiftId}
            onChange={(e) => setNewRow((prev) => ({ ...prev, shiftId: e.target.value }))}
            className={fieldClass}
          >
            {shiftOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-3">
          <label className="mb-1 block text-xs text-slate-400">From</label>
          <input
            type="datetime-local"
            value={newRow.from}
            onChange={(e) => setNewRow((prev) => ({ ...prev, from: e.target.value }))}
            className={fieldClass}
          />
        </div>
        <div className="col-span-3">
          <label className="mb-1 block text-xs text-slate-400">To</label>
          <input
            type="datetime-local"
            value={newRow.to}
            onChange={(e) => setNewRow((prev) => ({ ...prev, to: e.target.value }))}
            className={fieldClass}
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs text-slate-400">Reason</label>
          <input
            type="text"
            value={newRow.reason}
            onChange={(e) => setNewRow((prev) => ({ ...prev, reason: e.target.value }))}
            className={fieldClass}
          />
        </div>
        <button
          type="button"
          onClick={addRow}
          disabled={adding}
          className="col-span-1 min-h-[44px] rounded bg-zinc-900 px-2 py-2 text-sm text-white disabled:opacity-50"
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
                        type="datetime-local"
                        value={editDraft.from}
                        onChange={(e) => setEditDraft((prev) => ({ ...prev, from: e.target.value }))}
                        className={fieldClass}
                      />
                    ) : (
                      <span className="text-slate-400">{toInputDateTime(row.from).replace("T", " ")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === row.id ? (
                      <input
                        type="text"
                        value={editDraft.reason}
                        onChange={(e) => setEditDraft((prev) => ({ ...prev, reason: e.target.value }))}
                        className={fieldClass}
                      />
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
    </div>
  );
}
