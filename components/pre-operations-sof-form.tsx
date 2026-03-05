"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { PREDEFINED_EVENTS } from "@/lib/event-options";
import { useRouter } from "next/navigation";

export default function PreOperationsSofForm({ vesselId }: { vesselId: string }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [eventType, setEventType] = useState("");
  const [addon, setAddon] = useState("");
  const [loading, setLoading] = useState(false);

  const normalizeHHMMInput = (value: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    if (/^\d{2}:\d{2}$/.test(raw)) return raw;

    const digits = raw.replace(/\D/g, "");
    if (digits.length === 4) {
      return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    }

    return "";
  };

  const onSubmit = async () => {
    const fromNormalized = normalizeHHMMInput(from);
    const toNormalized = to.trim() ? normalizeHHMMInput(to) : "";
    const reason = eventType.trim()
      ? `${eventType.trim()}${addon.trim() ? ` - ${addon.trim()}` : ""}`
      : addon.trim();

    if (!date || !fromNormalized || !reason) {
      alert("Date, FROM time and event description are required.");
      return;
    }

    if (to.trim() && !toNormalized) {
      alert("TO time must be HHMM or HH:MM.");
      return;
    }

    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch(`/api/shiftreporter/vessels/${vesselId}/pre-operations-events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date,
          from: fromNormalized,
          to: toNormalized,
          reason,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save pre-operation event");

      setDate("");
      setFrom("");
      setTo("");
      setEventType("");
      setAddon("");
      alert("✅ Pre-operation SOF event saved (no email sent).");
      router.refresh();
    } catch (e: any) {
      alert(`Error: ${e?.message || "Failed to save pre-operation event"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-slate-800 shadow-sm p-6">
      <h2 className="text-lg font-semibold mb-2">Pre-Operations / SOF Events</h2>
      <p className="text-sm text-zinc-600 mb-4">
        Agent-only input for events before commencement. Saved to Running SOF and future reports (no email trigger).
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium block mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 w-full rounded-md border bg-slate-800 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-medium block mb-1">From</label>
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="HH:MM"
              className="h-10 w-full rounded-md border bg-slate-800 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">To (optional)</label>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="HH:MM"
              className="h-10 w-full rounded-md border bg-slate-800 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 mt-3">
        <div>
          <label className="text-sm font-medium block mb-1">Event</label>
          <input
            list="pre-op-predefined-events"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            placeholder="Select/type event"
            className="h-10 w-full rounded-md border bg-slate-800 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
          />
          <datalist id="pre-op-predefined-events">
            {PREDEFINED_EVENTS.map((event) => (
              <option key={event} value={event} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Add-on / Details</label>
          <input
            value={addon}
            onChange={(e) => setAddon(e.target.value)}
            placeholder="Specific detail"
            className="h-10 w-full rounded-md border bg-slate-800 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={loading}
        className="mt-4 h-10 rounded-md bg-zinc-900 text-white font-medium px-4 hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save Pre-Operation SOF Event"}
      </button>
    </div>
  );
}


