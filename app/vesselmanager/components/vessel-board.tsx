"use client";
console.log("VESSEL BOARD V2 LOADED");

import { Fragment, useMemo, useState } from "react";
import type { Appointment, AppointmentTimelineRow, TimelineEventCode } from "@/lib/vesselmanager/types";
import TimelinePanel from "./timeline-panel";
import TimeEntryInput from "./time-entry-input";

type MilestoneCode = "ETA_OUTER_ROADS" | "EPOB" | "ETB" | "ETD";
type ActionCode = "ETA_SERVICES" | "LINE_UP" | "DAILY_REPORT";

type TimelineMap = Record<string, Partial<Record<TimelineEventCode, { eta: string; ata: string }>>>;

type EditingCell =
  | {
      appointmentId: string;
      eventType: MilestoneCode;
      value: string;
    }
  | null;

type ActionState = Record<string, Record<ActionCode, "Pending" | "Open" | "Done">>;

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
    return { ok: false as const, error: "Use DDMMM HH, DDMMM HH:MM, DDMMM AM/PM/EAM/EPM/NOON/LPM" };
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

function timelineDisplay(item?: { eta: string; ata: string }) {
  if (!item || (!item.eta && !item.ata)) return { top: "--", bottom: "" };
  const source = item.ata || item.eta;
  if (!source) return { top: "--", bottom: "" };

  const dt = new Date(source);
  if (Number.isNaN(dt.getTime())) {
    return { top: String(source).slice(0, 5), bottom: String(source).slice(6, 11) };
  }

  const day = String(dt.getDate()).padStart(2, "0");
  const month = dt.toLocaleString("en-US", { month: "short" });
  const hour = String(dt.getHours()).padStart(2, "0");
  const minute = String(dt.getMinutes()).padStart(2, "0");
  return {
    top: `${day}${month}`,
    bottom: minute === "00" ? `${hour}h` : `${hour}:${minute}`,
  };
}

function deriveTrafficState(
  fallback: Appointment["status"],
  timeline?: Partial<Record<TimelineEventCode, { eta: string; ata: string }>>,
) {
  if (!timeline) return "";
  const hasAta = (code: TimelineEventCode) => !!timeline[code]?.ata;
  const hasAny = (code: TimelineEventCode) => !!timeline[code]?.eta || !!timeline[code]?.ata;
  if (hasAta("ETD")) return "CLOSED";
  if (hasAta("ETB")) return "ALONGSIDE";
  if (hasAta("EPOB")) return "AT_ROADS";
  if (hasAny("ETA_OUTER_ROADS")) return "EN_ROUTE";
  if (fallback === "SAILING") return "SAILING";
  return "";
}

function trafficIcon(state: string) {
  if (state === "EN_ROUTE") return "\u2192";
  if (state === "AT_ROADS") return "\u2693";
  if (state === "ALONGSIDE") return "\u2693\u2693";
  if (state === "SAILING") return "\u2197";
  if (state === "CLOSED") return "\u2713";
  return "";
}

function formatQty(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return Math.round(value).toLocaleString("en-US");
}

export default function VesselBoard({ appointments }: { appointments: Appointment[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timelineByAppointment, setTimelineByAppointment] = useState<TimelineMap>({});
  const [loadingTimeline, setLoadingTimeline] = useState<Record<string, boolean>>({});
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [savingCell, setSavingCell] = useState(false);
  const [editingError, setEditingError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [actionState, setActionState] = useState<ActionState>({});

  const ensureTimelineLoaded = async (appointmentId: string) => {
    if (timelineByAppointment[appointmentId]) return timelineByAppointment[appointmentId];
    setLoadingTimeline((prev) => ({ ...prev, [appointmentId]: true }));
    try {
      const res = await fetch(`/api/vesselmanager/appointments/${appointmentId}`, { cache: "no-store" });
      const json = (await res.json()) as { data?: { timeline?: AppointmentTimelineRow[] }; error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load timeline");
      const map: Partial<Record<TimelineEventCode, { eta: string; ata: string }>> = {};
      (json.data?.timeline || []).forEach((row) => {
        map[row.event_type] = { eta: row.eta || "", ata: row.ata || "" };
      });
      setTimelineByAppointment((prev) => ({ ...prev, [appointmentId]: map }));
      return map;
    } finally {
      setLoadingTimeline((prev) => ({ ...prev, [appointmentId]: false }));
    }
  };

  const toggleExpand = async (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    if (expandedId !== id) await ensureTimelineLoaded(id);
  };

  const startEditCell = async (appointmentId: string, eventType: MilestoneCode) => {
    const timeline = await ensureTimelineLoaded(appointmentId);
    const current = timeline?.[eventType];
    setEditingError("");
    setSaveError("");
    setEditingCell({
      appointmentId,
      eventType,
      value: editableFromIso(current?.ata || current?.eta),
    });
  };

  const saveCell = async () => {
    if (!editingCell) return;
    const parsed = parseOperationalInput(editingCell.value);
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
    }

    setSavingCell(true);
    setSaveError("");
    try {
      const res = await fetch("/api/vesselmanager/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: editingCell.appointmentId,
          event_type: editingCell.eventType,
          eta: parsed.minuteProvided ? null : parsed.iso,
          ata: parsed.minuteProvided ? parsed.iso : null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to save timeline value");

      setTimelineByAppointment((prev) => ({
        ...prev,
        [editingCell.appointmentId]: {
          ...(prev[editingCell.appointmentId] || {}),
          [editingCell.eventType]: {
            eta: parsed.minuteProvided ? "" : parsed.iso,
            ata: parsed.minuteProvided ? parsed.iso : "",
          },
        },
      }));
      setEditingCell(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save timeline value");
    } finally {
      setSavingCell(false);
    }
  };

  const cycleAction = (appointmentId: string, code: ActionCode) => {
    setActionState((prev) => {
      const current = prev[appointmentId]?.[code] || (code === "ETA_SERVICES" ? "Pending" : "Open");
      const next = current === "Pending" ? "Open" : current === "Open" ? "Done" : "Pending";
      return {
        ...prev,
        [appointmentId]: {
          ETA_SERVICES: prev[appointmentId]?.ETA_SERVICES || "Pending",
          LINE_UP: prev[appointmentId]?.LINE_UP || "Open",
          DAILY_REPORT: prev[appointmentId]?.DAILY_REPORT || "Open",
          ...(prev[appointmentId] || {}),
          [code]: next,
        },
      };
    });
  };

  const actionValue = (appointmentId: string, code: ActionCode) =>
    actionState[appointmentId]?.[code] || (code === "ETA_SERVICES" ? "Pending" : "Open");

  const visibleRows = useMemo(() => appointments, [appointments]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
      <table className="w-full table-fixed text-xs">
        <thead>
         <tr className="text-xs text-slate-400 border-b border-slate-700">
          <th className="w-[28px]">ICON</th>
          <th className="w-[300px] text-left px-2">VESSEL</th>
          <th className="w-[90px] text-center">ETA_EOSP</th>
          <th className="w-[90px] text-center">EPOB</th>
          <th className="w-[90px] text-center">ETB</th>
          <th className="w-[90px] text-center">ETD</th>
          <th className="w-[110px] text-center">ETA<br />SERVICES</th>
          <th className="w-[100px] text-center">LINE_UP</th>
         <th className="w-[110px] text-center">DAILY_REPORT</th>
        </tr>
</thead>
        <tbody className="divide-y divide-slate-700 text-slate-200">
          {visibleRows.length === 0 ? (
            <tr>
              <td className="px-2 py-3 text-slate-300" colSpan={9}>
                No appointments found.
              </td>
            </tr>
          ) : (
            visibleRows.map((appointment) => {
              const isExpanded = expandedId === appointment.id;
              const timeline = timelineByAppointment[appointment.id];
              const trafficState = deriveTrafficState(appointment.status, timeline);
              const narrative =
                `${appointment.port ?? ""} – ${appointment.terminal ?? ""} | ` +
                `${appointment.cargo_operation ?? ""} – ${appointment.cargo_grade ?? ""} – ${appointment.cargo_qty ?? ""} | ` +
                `Appointed by: ${appointment.appointed_by ?? ""} as ${appointment.role ?? ""}`;

              const milestoneCell = (eventType: MilestoneCode) => {
                const isEditing =
                  editingCell?.appointmentId === appointment.id && editingCell?.eventType === eventType;

                const display = timelineDisplay(timeline?.[eventType]);
                return (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => startEditCell(appointment.id, eventType)}
                      className="w-full max-w-[90px] mx-auto rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-center text-[11px] text-slate-200"
                      title="Click to edit ETA/ATA"
                    >
                      {loadingTimeline[appointment.id] && !timeline ? (
                        "..."
                      ) : (
                        <span className="block leading-tight">
                          <span className="block">{display.top}</span>
                          <span className="block text-slate-400">{display.bottom}</span>
                        </span>
                      )}
                    </button>
                    {isEditing && editingCell ? (
                      <div className="absolute left-0 top-full z-40 mt-1 w-[220px]">
                        <TimeEntryInput
                          value={editingCell.value}
                          onChange={(value) => setEditingCell({ ...editingCell, value })}
                          onSubmit={() => {
                            void saveCell();
                          }}
                          onCancel={() => {
                            setEditingCell(null);
                            setEditingError("");
                          }}
                          error={editingError}
                          disabled={savingCell}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              };

              return (
                <Fragment key={appointment.id}>
                  <tr className="bg-slate-800">
                    <td className="sticky left-0 z-20 w-[28px] bg-slate-800 px-1 py-0.5 text-center" title={trafficState}>
                      {trafficIcon(trafficState)}
                    </td>
                    <td className="sticky left-[28px] z-20 w-[300px] bg-slate-800 px-1 py-0.5 font-medium text-slate-100">
                      <button
                        type="button"
                        onClick={() => toggleExpand(appointment.id)}
                        className="max-w-full truncate text-left hover:underline"
                        title={appointment.vessel_name}
                      >
                        {appointment.vessel_name}
                      </button>
                      <div className="text-xs text-slate-400 truncate" title={narrative}>
                        {narrative}
                      </div>
                    </td>
                    <td className="w-[90px] px-1 py-0.5">{milestoneCell("ETA_OUTER_ROADS")}</td>
                    <td className="w-[90px] px-1 py-0.5">{milestoneCell("EPOB")}</td>
                    <td className="w-[90px] px-1 py-0.5">{milestoneCell("ETB")}</td>
                    <td className="w-[90px] px-1 py-0.5">{milestoneCell("ETD")}</td>
                    <td className="w-[110px] px-1 py-0.5">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => cycleAction(appointment.id, "ETA_SERVICES")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") cycleAction(appointment.id, "ETA_SERVICES");
                        }}
                        className="cursor-pointer rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-center text-[11px] text-slate-300"
                      >
                        {actionValue(appointment.id, "ETA_SERVICES")}
                      </div>
                    </td>
                    <td className="w-[100px] px-1 py-0.5">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => cycleAction(appointment.id, "LINE_UP")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") cycleAction(appointment.id, "LINE_UP");
                        }}
                        className="cursor-pointer rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-center text-[11px] text-slate-300"
                      >
                        {actionValue(appointment.id, "LINE_UP")}
                      </div>
                    </td>
                    <td className="w-[110px] px-1 py-0.5">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => cycleAction(appointment.id, "DAILY_REPORT")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") cycleAction(appointment.id, "DAILY_REPORT");
                        }}
                        className="cursor-pointer rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-center text-[11px] text-slate-300"
                      >
                        {actionValue(appointment.id, "DAILY_REPORT")}
                      </div>
                    </td>
                  </tr>
                  {saveError && editingCell?.appointmentId === appointment.id ? (
                    <tr className="bg-slate-900/70">
                      <td colSpan={9} className="px-2 py-1 text-[11px] text-red-400">
                        {saveError}
                      </td>
                    </tr>
                  ) : null}
                  {isExpanded && (
                    <tr className="bg-slate-900/80">
                      <td colSpan={9} className="px-1 py-1">
                        <TimelinePanel appointmentId={appointment.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
