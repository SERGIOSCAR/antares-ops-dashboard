"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppointmentTimelineRow, TimelineEventCode } from "@/lib/vesselmanager/types";
import TimeEntryInput from "./time-entry-input";

type AppointmentDetail = {
  id: string;
  port?: string | null;
};

type TimelineApiResponse = {
  data?: {
    appointment: AppointmentDetail;
    timeline: AppointmentTimelineRow[];
  };
  error?: string;
};

type EventCode = TimelineEventCode | "ETA_BUNKER";
type RowState = Record<string, { eta: string; ata: string }>;

const row1Events: Array<{ code: EventCode; label: string }> = [
  { code: "ETA_RIVER", label: "ETA_RIVER" },
  { code: "COMMENCE_OPS", label: "COMMENCE_OPS" },
  { code: "COMPLETE_OPS", label: "COMPLETE_OPS" },
  { code: "ETA_BUNKER", label: "ETA_BUNKER" },
];

const monthMap: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

const slotHour: Record<string, number> = {
  EAM: 7,
  AM: 9,
  NOON: 12,
  PM: 15,
  EPM: 18,
  LPM: 21,
};

const defaultRows: RowState = {
  ETA_RIVER: { eta: "", ata: "" },
  COMMENCE_OPS: { eta: "", ata: "" },
  COMPLETE_OPS: { eta: "", ata: "" },
  ETA_BUNKER: { eta: "", ata: "" },
};

function compactFromIso(value?: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  const d = String(dt.getDate()).padStart(2, "0");
  const m = dt.toLocaleString("en-US", { month: "short" });
  const h = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${d}${m} ${h}:${min}`;
}

function editableFromIso(value?: string | null) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const d = String(dt.getDate()).padStart(2, "0");
  const m = dt.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const h = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${d}${m} ${h}:${min}`;
}

function parseOperationalInput(raw: string) {
  const value = raw.trim().toUpperCase();
  const now = new Date();
  const m = value.match(/^(\d{1,2})([A-Z]{3})\s+([0-2]?\d(?::[0-5]\d)?|EAM|AM|NOON|PM|EPM|LPM)$/);
  if (!m) {
    return { ok: false as const, error: "Use format DDMMM HH, DDMMM HH:MM, DDMMM AM/PM/EAM/EPM/NOON/LPM" };
  }

  const day = Number(m[1]);
  const month = monthMap[m[2]];
  const token = m[3];
  if (month === undefined) return { ok: false as const, error: "Invalid month code" };

  let hour = 0;
  let minute = 0;
  let minuteProvided = false;
  if (slotHour[token] !== undefined) {
    hour = slotHour[token];
  } else {
    const [hh, mm] = token.split(":");
    hour = Number(hh);
    minute = mm ? Number(mm) : 0;
    minuteProvided = mm !== undefined;
    if (hour < 0 || hour > 24 || minute < 0 || minute > 59 || (hour === 24 && minute > 0)) {
      return { ok: false as const, error: "Invalid hour/minute" };
    }
    if (hour === 24) hour = 0;
  }

  const dt = new Date(now.getFullYear(), month, day, hour, minute, 0, 0);
  if (Number.isNaN(dt.getTime())) return { ok: false as const, error: "Invalid date" };

  const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}T${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:00`;
  return { ok: true as const, iso, minuteProvided };
}

export default function TimelinePanel({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<RowState>(defaultRows);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingError, setEditingError] = useState("");

  const [lineUpText, setLineUpText] = useState("");
  const [runningSofText, setRunningSofText] = useState("");
  const [editLineUp, setEditLineUp] = useState(false);
  const [editRunningSof, setEditRunningSof] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/vesselmanager/appointments/${appointmentId}`, { cache: "no-store" });
        const json = (await res.json()) as TimelineApiResponse;
        if (!res.ok) throw new Error(json.error || "Failed to load details");
        if (!active) return;

        const next = { ...defaultRows };
        (json.data?.timeline || []).forEach((item) => {
          if (next[item.event_type]) next[item.event_type] = { eta: item.eta || "", ata: item.ata || "" };
        });
        setRows(next);

        const lsLineup = localStorage.getItem(`vm:lineup:${appointmentId}`);
        const lsSof = localStorage.getItem(`vm:sof:${appointmentId}`);
        if (lsLineup !== null) setLineUpText(lsLineup);
        if (lsSof !== null) setRunningSofText(lsSof);
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load details");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [appointmentId]);

  const saveEvent = async (eventCode: string, eta: string | null, ata: string | null) => {
    setSavingCode(eventCode);
    setError("");
    try {
      const res = await fetch("/api/vesselmanager/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_id: appointmentId, event_type: eventCode, eta, ata }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to save timeline value");
      setRows((prev) => ({ ...prev, [eventCode]: { eta: eta || "", ata: ata || "" } }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save timeline value");
    } finally {
      setSavingCode(null);
    }
  };

  const beginEdit = (code: string) => {
    const row = rows[code];
    setEditingError("");
    setEditingCode(code);
    setEditingValue(editableFromIso(row?.ata || row?.eta));
  };

  const commitEdit = async () => {
    if (!editingCode) return;
    const parsed = parseOperationalInput(editingValue);
    if (!parsed.ok) {
      setEditingError("Invalid time format. Use DDMMM HH or DDMMM HH:MM.");
      return;
    }
    setEditingError("");

    if (parsed.minuteProvided) {
      const proceed = confirm(
        "Entering minutes locks the estimate as actual time. Continue?",
      );
      if (!proceed) return;
      await saveEvent(editingCode, null, parsed.iso);
    } else {
      await saveEvent(editingCode, parsed.iso, null);
    }

    setEditingCode(null);
    setEditingValue("");
  };

  const saveTextLocal = (key: "lineup" | "sof", text: string) => {
    const storageKey = key === "lineup" ? `vm:lineup:${appointmentId}` : `vm:sof:${appointmentId}`;
    localStorage.setItem(storageKey, text);
  };

  const shiftReporterLink = useMemo(() => "/shiftreporter", []);

  if (loading) return <div className="text-xs text-slate-300">Loading...</div>;

  return (
    <div className="space-y-1 text-xs text-slate-200">
      {error ? <div className="text-red-400">{error}</div> : null}

      <div className="grid grid-cols-6 gap-1">
        {row1Events.map((event) => {
          const current = rows[event.code];
          const displayValue = compactFromIso(current?.ata || current?.eta);
          const label = event.code === "ETA_RIVER" ? "ETA UPRIVER" : event.label.replaceAll("_", " ");
          return (
            <div key={event.code} className="border border-slate-700 bg-slate-900 px-2 py-1">
              <div className="text-[11px] text-slate-300">{label}</div>
              {editingCode === event.code ? (
                <TimeEntryInput
                  value={editingValue}
                  onChange={setEditingValue}
                  onSubmit={() => {
                    void commitEdit();
                  }}
                  onCancel={() => {
                    setEditingCode(null);
                    setEditingValue("");
                    setEditingError("");
                  }}
                  error={editingError}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => beginEdit(event.code)}
                  disabled={savingCode === event.code}
                  className="mt-1 w-full text-left text-slate-100 hover:text-blue-300 disabled:opacity-50"
                >
                  {savingCode === event.code ? "..." : displayValue}
                </button>
              )}
            </div>
          );
        })}
        <div className="border border-slate-700 bg-slate-900 px-2 py-1">
          <div className="text-[11px] text-slate-300">OTHER AGENT</div>
          <div className="mt-1 text-slate-100">-</div>
        </div>
        <div className="border border-slate-700 bg-slate-900 px-2 py-1">
          <div className="text-[11px] text-slate-300">HUSBANDRY</div>
          <div className="mt-1 text-slate-100">-</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        <div className="border border-slate-700 bg-slate-900 px-2 py-1">
          <button type="button" onClick={() => setEditLineUp((v) => !v)} className="w-full text-left text-slate-100">Line Up</button>
          {editLineUp ? (
            <textarea
              value={lineUpText}
              onChange={(e) => setLineUpText(e.target.value)}
              onBlur={() => {
                saveTextLocal("lineup", lineUpText);
                setEditLineUp(false);
              }}
              onKeyDown={(e) => {
                if (e.ctrlKey && e.key === "Enter") {
                  e.preventDefault();
                  saveTextLocal("lineup", lineUpText);
                  setEditLineUp(false);
                }
              }}
              className="mt-1 min-h-16 w-full border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100"
            />
          ) : null}
        </div>

        <div className="border border-slate-700 bg-slate-900 px-2 py-1">
          <button type="button" onClick={() => setEditRunningSof((v) => !v)} className="w-full text-left text-slate-100">Running SOF</button>
          {editRunningSof ? (
            <textarea
              value={runningSofText}
              onChange={(e) => setRunningSofText(e.target.value)}
              onBlur={() => {
                saveTextLocal("sof", runningSofText);
                setEditRunningSof(false);
              }}
              onKeyDown={(e) => {
                if (e.ctrlKey && e.key === "Enter") {
                  e.preventDefault();
                  saveTextLocal("sof", runningSofText);
                  setEditRunningSof(false);
                }
              }}
              className="mt-1 min-h-16 w-full border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100"
            />
          ) : null}
        </div>

        <div className="border border-slate-700 bg-slate-900 px-2 py-1">
          <a href={shiftReporterLink} target="_blank" rel="noopener noreferrer" className="inline-block text-slate-100 hover:text-blue-400">
            ShiftReporter
          </a>
        </div>
      </div>
    </div>
  );
}


