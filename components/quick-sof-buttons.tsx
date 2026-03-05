"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";

const quickEvents = [
  "NOR Tendered",
  "Pilot On Board",
  "First Line Ashore",
  "All Fast",
  "Commenced Loading",
  "Completed Loading",
  "Pilot Off",
  "Last Line",
];

function nowIsoMinute() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00`;
}

export default function QuickSofButtons({ vesselId, defaultShiftId }: { vesselId: string; defaultShiftId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const addSOFEvent = async (event: string) => {
    if (!defaultShiftId) {
      alert("No shift available yet. Submit at least one shift report first.");
      return;
    }

    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || "";

      const res = await fetch(`/api/shiftreporter/vessels/${vesselId}/running-sof-events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          shiftId: defaultShiftId,
          from: nowIsoMinute(),
          reason: event,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to add SOF event");
      router.refresh();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to add SOF event");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {quickEvents.map((event) => (
        <button
          key={event}
          onClick={() => addSOFEvent(event)}
          disabled={loading}
          className="min-h-[44px] rounded-md bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600 disabled:opacity-50"
        >
          {event}
        </button>
      ))}
    </div>
  );
}
