"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

type EditablePreOpEvent = {
  id: string;
  from: string;
  to: string;
  reason: string;
};

type RowState = EditablePreOpEvent & {
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

export default function PreOperationsSofManager({
  vesselId,
  events,
}: {
  vesselId: string;
  events: EditablePreOpEvent[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(events);
  const hasRows = useMemo(() => rows.length > 0, [rows]);

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
      const res = await fetch(`/api/shiftreporter/vessels/${vesselId}/pre-operations-events/${row.id}`, {
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
      if (!res.ok) throw new Error(json?.error || "Failed to update pre-operation event");

      alert("Pre-operation SOF event updated.");
      router.refresh();
    } catch (error: unknown) {
      alert(`Error: ${error instanceof Error ? error.message : "Failed to update pre-operation event"}`);
    } finally {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, saving: false } : r)));
    }
  };

  const deleteRow = async (id: string) => {
    const confirmed = confirm("Delete this pre-operation SOF event?");
    if (!confirmed) return;

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, deleting: true } : r)));
    try {
      const token = await withToken();
      const res = await fetch(`/api/shiftreporter/vessels/${vesselId}/pre-operations-events/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to delete pre-operation event");

      setRows((prev) => prev.filter((r) => r.id !== id));
      alert("Pre-operation SOF event deleted.");
      router.refresh();
    } catch (error: unknown) {
      alert(`Error: ${error instanceof Error ? error.message : "Failed to delete pre-operation event"}`);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, deleting: false } : r)));
    }
  };

  return (
    <div className="rounded-2xl border bg-slate-800 shadow-sm p-6">
      <h2 className="text-lg font-semibold mb-2">Pre-Operations SOF Manager</h2>
      <p className="text-sm text-zinc-600 mb-4">
        Admin-only editor for pre-operation SOF entries.
      </p>

      {!hasRows ? (
        <p className="text-sm text-zinc-500">No pre-operation SOF events to edit.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-12 gap-2 items-center border rounded-lg p-3">
              <input
                type="datetime-local"
                value={toInputDateTime(row.from)}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, from: e.target.value } : r))
                  )
                }
                className="col-span-3 touch-manipulation rounded border border-slate-600 bg-slate-900 p-2 text-slate-100"
              />
              <input
                type="datetime-local"
                value={toInputDateTime(row.to)}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, to: e.target.value } : r))
                  )
                }
                className="col-span-3 touch-manipulation rounded border border-slate-600 bg-slate-900 p-2 text-slate-100"
              />
              <input
                type="text"
                value={row.reason}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, reason: e.target.value } : r))
                  )
                }
                className="col-span-4 touch-manipulation rounded border border-slate-600 bg-slate-900 p-2 text-slate-100"
                placeholder="Reason"
              />
              <button
                type="button"
                disabled={!!row.saving || !!row.deleting}
                onClick={() => saveRow(row)}
                className="col-span-1 min-h-[44px] rounded bg-zinc-900 px-2 py-2 text-sm text-white disabled:opacity-50"
              >
                {row.saving ? "..." : "Save"}
              </button>
              <button
                type="button"
                disabled={!!row.saving || !!row.deleting}
                onClick={() => deleteRow(row.id)}
                className="col-span-1 min-h-[44px] rounded border border-red-300 px-2 py-2 text-sm text-red-600 disabled:opacity-50"
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


