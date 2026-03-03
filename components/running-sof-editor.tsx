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
  const [newRow, setNewRow] = useState({
    shiftId: shiftOptions[0]?.id || "",
    from: "",
    to: "",
    reason: "",
  });
  const [adding, setAdding] = useState(false);

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
    } catch (error: any) {
      alert(`Error: ${error?.message || "Failed to update event"}`);
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
    } catch (error: any) {
      alert(`Error: ${error?.message || "Failed to delete event"}`);
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
    } catch (error: any) {
      alert(`Error: ${error?.message || "Failed to add event"}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4 mt-3">
      <h3 className="text-base font-semibold mb-2">Running SOF Editor</h3>
      <p className="text-xs text-zinc-600 mb-3">Admin can add, edit, or delete any running SOF event.</p>

      <div className="grid grid-cols-12 gap-2 items-end border rounded p-3 mb-3">
        <div className="col-span-3">
          <label className="text-xs text-zinc-600 block mb-1">Shift</label>
          <select
            value={newRow.shiftId}
            onChange={(e) => setNewRow((prev) => ({ ...prev, shiftId: e.target.value }))}
            className="w-full border rounded p-2"
          >
            {shiftOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-3">
          <label className="text-xs text-zinc-600 block mb-1">From</label>
          <input
            type="datetime-local"
            value={newRow.from}
            onChange={(e) => setNewRow((prev) => ({ ...prev, from: e.target.value }))}
            className="w-full border rounded p-2"
          />
        </div>
        <div className="col-span-3">
          <label className="text-xs text-zinc-600 block mb-1">To</label>
          <input
            type="datetime-local"
            value={newRow.to}
            onChange={(e) => setNewRow((prev) => ({ ...prev, to: e.target.value }))}
            className="w-full border rounded p-2"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-zinc-600 block mb-1">Reason</label>
          <input
            type="text"
            value={newRow.reason}
            onChange={(e) => setNewRow((prev) => ({ ...prev, reason: e.target.value }))}
            className="w-full border rounded p-2"
          />
        </div>
        <button
          type="button"
          onClick={addRow}
          disabled={adding}
          className="col-span-1 rounded bg-zinc-900 text-white px-2 py-2 text-sm disabled:opacity-50"
        >
          {adding ? "..." : "Add"}
        </button>
      </div>

      {!hasRows ? (
        <p className="text-sm text-zinc-500">No events to edit.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-12 gap-2 items-center border rounded p-3">
              <input
                type="datetime-local"
                value={toInputDateTime(row.from)}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, from: e.target.value } : r))
                  )
                }
                className="col-span-3 border rounded p-2"
              />
              <input
                type="datetime-local"
                value={toInputDateTime(row.to)}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, to: e.target.value } : r))
                  )
                }
                className="col-span-3 border rounded p-2"
              />
              <input
                type="text"
                value={row.reason}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, reason: e.target.value } : r))
                  )
                }
                className="col-span-4 border rounded p-2"
              />
              <button
                type="button"
                disabled={!!row.saving || !!row.deleting}
                onClick={() => saveRow(row)}
                className="col-span-1 rounded bg-zinc-900 text-white px-2 py-2 text-sm disabled:opacity-50"
              >
                {row.saving ? "..." : "Save"}
              </button>
              <button
                type="button"
                disabled={!!row.saving || !!row.deleting}
                onClick={() => deleteRow(row.id)}
                className="col-span-1 rounded border border-red-300 text-red-600 px-2 py-2 text-sm disabled:opacity-50"
              >
                {row.deleting ? "..." : "Del"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

