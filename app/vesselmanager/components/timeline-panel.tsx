"use client";

import { useEffect, useState } from "react";
import type { AppointmentTimelineRow, TimelineEventCode } from "@/lib/vesselmanager/types";
import { parseOperationalInput, toOperationalIso } from "@/lib/vesselmanager/parse-operational-time";

type AppointmentDetail = {
  id: string;
  charterer_agent?: string | null;
  port?: string | null;
  other_agents?: string | null;
  other_agents_role?: string | null;
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
  { code: "ETHI", label: "ETHI" },
  { code: "COMMENCE_OPS", label: "ET_COMMENCE_OPS" },
  { code: "COMPLETE_OPS", label: "ET_COMPLETE_OPS" },
  { code: "ETA_BUNKER", label: "ETA_BUNKER" },
  { code: "ET_COSP", label: "ET_COSP" },
];

const defaultRows: RowState = {
  ETA_RIVER: { eta: "", ata: "" },
  ETHI: { eta: "", ata: "" },
  COMMENCE_OPS: { eta: "", ata: "" },
  COMPLETE_OPS: { eta: "", ata: "" },
  ETA_BUNKER: { eta: "", ata: "" },
  ET_COSP: { eta: "", ata: "" },
};

function compactFromIso(value?: string | null) {
  if (!value) return "-";
  if (/^\d{2}\s?[A-Za-z]{3}(?:\s+.+)?$/.test(value)) return value;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  const d = String(dt.getDate()).padStart(2, "0");
  const m = dt.toLocaleString("en-US", { month: "short" });
  const h = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${d} ${m} ${h}:${min}`;
}

function splitDisplay(value?: string | null) {
  const base = compactFromIso(value);
  if (base === "-") return { top: "--", bottom: "" };
  const parts = base.trim().split(/\s+/);
  if (parts.length >= 2 && /^[A-Za-z]{3}$/.test(parts[1])) {
    return { top: `${parts[0]} ${parts[1]}`, bottom: parts.slice(2).join(" ") };
  }
  return { top: parts[0], bottom: parts.slice(1).join(" ") };
}

function formatOperationalDisplay(date: string, text?: string | null) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return text ? `${date} ${text}` : date;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const base = `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]}`;
  if (!text) return base;
  return `${base} ${text}`;
}

function editableFromIso(value?: string | null) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  const d = String(dt.getDate()).padStart(2, "0");
  const m = dt.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const h = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${d}${m} ${h}:${min}`;
}

function periodInputToIso(parsed: {
  day: number;
  monthCode: string;
  token: string;
}) {
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
  const periodHour: Record<string, number> = {
    EAM: 7,
    AM: 9,
    NOON: 12,
    PM: 15,
    EPM: 18,
    LPM: 21,
  };
  const month = monthMap[parsed.monthCode];
  const hour = periodHour[parsed.token];
  if (month === undefined || hour === undefined) return null;

  const now = new Date();
  const dt = new Date(now.getFullYear(), month, parsed.day, hour, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}T${String(dt.getHours()).padStart(2, "0")}:00:00`;
}

export default function TimelinePanel({
  appointmentId,
  initialChartererAgent = "-",
  initialSubAgent = "-",
  initialOtherAgents = "-",
}: {
  appointmentId: string;
  initialChartererAgent?: string;
  initialSubAgent?: string;
  initialOtherAgents?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<RowState>(defaultRows);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingError, setEditingError] = useState("");
  const [chartererAgentText, setChartererAgentText] = useState(initialChartererAgent);
  const [subAgentText, setSubAgentText] = useState(initialSubAgent);
  const [otherAgentsText, setOtherAgentsText] = useState(initialOtherAgents);

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
          if (!next[item.event_type]) return;
          const row = item as AppointmentTimelineRow & {
            event_date?: string | null;
            event_time_text?: string | null;
          };
          if (row.event_time_text && !row.event_date) {
            next[item.event_type] = { eta: row.event_time_text, ata: "" };
            return;
          }
          if (row.event_date) {
            const display = formatOperationalDisplay(row.event_date, row.event_time_text);
            next[item.event_type] = { eta: display, ata: row.ata ? display : "" };
            return;
          }
          next[item.event_type] = { eta: item.eta || "", ata: item.ata || "" };
        });
        setRows(next);
        setChartererAgentText(json.data?.appointment?.charterer_agent?.trim() || initialChartererAgent || "-");
        setSubAgentText(initialSubAgent || "-");
        const fetchedOtherAgents = [
          json.data?.appointment?.other_agents?.trim() || "",
          json.data?.appointment?.other_agents_role?.trim() || "",
        ]
          .filter((x) => x && x !== "-")
          .join(" | ");
        setOtherAgentsText(
          fetchedOtherAgents || initialOtherAgents || "-",
        );

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
  }, [appointmentId, initialChartererAgent, initialSubAgent, initialOtherAgents]);

  const labelFor = (code: EventCode, row?: { eta: string; ata: string }) => {
    const source = row?.ata || row?.eta || "";
    const dt = source ? new Date(source) : null;
    const completedPast = !!row?.ata && dt && !Number.isNaN(dt.getTime()) && dt.getTime() <= Date.now();
    if (code === "ETA_RIVER") return completedPast ? "ARRIVED UPRIVER" : "ETA UPRIVER";
    if (code === "ETHI") return completedPast ? "HOLDS INSPECTED" : "ETHI";
    if (code === "COMMENCE_OPS") return completedPast ? "COMMENCED OPS" : "ET-BEGIN OPS";
    if (code === "COMPLETE_OPS") return completedPast ? "COMPLETED OPS" : "ET-FINISH OPS";
    if (code === "ETA_BUNKER") return completedPast ? "ARRIVED BUNKER ZONE" : "ETA BUNKER";
    if (code === "ET_COSP") return completedPast ? "COMMENCED SEA PASSAGE" : "ET-COSP";
    return String(code).replaceAll("_", " ");
  };

  const saveEvent = async (eventCode: string, value: string, target: "eta" | "ata") => {
    setSavingCode(eventCode);
    setError("");
    try {
      const raw = value.trim();
      let eta: string | null = null;
      let ata: string | null = null;
      let eventDate: string | null = null;
      let eventTimeText: string | null = null;
      let displayValue = "";
      let parsed: ReturnType<typeof parseOperationalInput> = null;

      if (raw === "") {
        setEditingError("");
      } else if (raw.toUpperCase() === "TBC") {
        setEditingError("");
        eventTimeText = "TBC";
        displayValue = "TBC";
      } else {
        parsed = parseOperationalInput(raw);
        if (!parsed) {
          setEditingError("Invalid time format. Use DDMMM HH or DDMMM HH:MM.");
          return;
        }

        const iso =
          parsed.parsed.type === "period"
            ? periodInputToIso(parsed)
            : toOperationalIso(parsed);
        if (!iso) {
          setEditingError("Invalid time format. Use DDMMM HH or DDMMM HH:MM.");
          return;
        }

        const monthMap: Record<string, number> = {
          JAN: 1,
          FEB: 2,
          MAR: 3,
          APR: 4,
          MAY: 5,
          JUN: 6,
          JUL: 7,
          AUG: 8,
          SEP: 9,
          OCT: 10,
          NOV: 11,
          DEC: 12,
        };
        const month = monthMap[parsed.monthCode];
        if (!month) {
          setEditingError("Invalid time format. Use DDMMM HH or DDMMM HH:MM.");
          return;
        }
        const now = new Date();
        eventDate = `${now.getFullYear()}-${String(month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
        eventTimeText = parsed.token || null;
        displayValue =
          parsed.parsed.type === "period"
            ? `${String(parsed.day).padStart(2, "0")}${parsed.monthCode} ${parsed.token}`
            : raw.toUpperCase();

        if (target === "eta") eta = iso;
        if (target === "ata") ata = iso;
      }

      const res = await fetch("/api/vesselmanager/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: appointmentId,
          event_type: eventCode,
          eta,
          ata,
          event_date: eventDate,
          event_time_text: eventTimeText,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to save timeline value");

      setRows((prev) => ({
        ...prev,
        [eventCode]: target === "eta"
          ? { eta: displayValue || eventTimeText || "", ata: prev[eventCode]?.ata || "" }
          : { eta: prev[eventCode]?.eta || "", ata: displayValue || eventTimeText || "" },
      }));
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

  const commitEdit = async (eventCode: EventCode) => {
    const value = editingValue.trim();
    if (value === "" || value.toUpperCase() === "TBC") {
      setEditingError("");
      await saveEvent(eventCode, value, "eta");
      setEditingCode(null);
      return;
    }
    const parsed = parseOperationalInput(value);
    if (!parsed) {
      setEditingError("Invalid time format. Use DDMMM HH or DDMMM HH:MM.");
      return;
    }

    setEditingError("");
    const target: "eta" | "ata" = value.includes(":") ? "ata" : "eta";
    await saveEvent(eventCode, value, target);
    setEditingCode(null);
  };

  if (loading) return <div className="text-xs text-slate-300">Loading...</div>;

  return (
    <div className="space-y-1 text-xs text-slate-200">
      {error ? <div className="text-red-400">{error}</div> : null}

      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr)) minmax(0, 1.6fr) repeat(2, minmax(0, 1fr))" }}>
        {row1Events.map((event) => {
          const current = rows[event.code];
          const displayValue = compactFromIso(current?.ata || current?.eta);
          const label = labelFor(event.code, current);
          return (
            <div key={event.code} className="border border-slate-700 bg-slate-900 px-2 py-1">
              <div className="text-[11px] text-slate-300">{label}</div>
              {editingCode === event.code ? (
                <input
                  autoFocus
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitEdit(event.code);
                    }
                    if (e.key === "Escape") {
                      setEditingCode(null);
                      setEditingError("");
                    }
                  }}
                  onBlur={() => {
                    if (editingCode === event.code) void commitEdit(event.code);
                  }}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => beginEdit(event.code)}
                  disabled={savingCode === event.code}
                  className="mt-1 w-full text-left text-slate-100 hover:text-blue-300 disabled:opacity-50"
                >
                  {savingCode === event.code ? (
                    "..."
                  ) : (
                    <span className="block leading-tight">
                      <span className="block">{splitDisplay(displayValue).top}</span>
                      <span className="block text-slate-400">{splitDisplay(displayValue).bottom || "\u00A0"}</span>
                    </span>
                  )}
                </button>
              )}
              {editingCode === event.code && editingError ? (
                <div className="mt-1 text-[11px] text-red-400">{editingError}</div>
              ) : null}
            </div>
          );
        })}
        <div className="border border-slate-700 bg-slate-900 px-2 py-1">
          <div className="text-[11px] text-slate-300">OTHER AGENTS</div>
          <div className="mt-1 truncate text-slate-100" title={otherAgentsText}>
            {otherAgentsText || "-"}
          </div>
        </div>
        <div className="border border-slate-700 bg-slate-900 px-2 py-1">
          <div className="text-[11px] text-slate-300">CHARTERER&apos;S AGENT</div>
          <div className="mt-1 truncate text-slate-100" title={chartererAgentText}>
            {chartererAgentText || "-"}
          </div>
        </div>
        <div className="border border-slate-700 bg-slate-900 px-2 py-1">
          <div className="text-[11px] text-slate-300">SUB-AGENT</div>
          <div className="mt-1 truncate text-slate-100" title={subAgentText}>
            {subAgentText || "-"}
          </div>
        </div>
      </div>

    </div>
  );
}


