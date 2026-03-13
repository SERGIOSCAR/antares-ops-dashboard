/* 
?? LAYOUT LOCKED
This board layout is finalized and must not be modified automatically.

Allowed changes:
- ETA input parsing
- action button behavior
- timeline API calls

Do NOT change:
- table structure
- column order
- column widths
- sticky columns
*/
"use client";
console.log("VESSEL BOARD V2 LOADED");

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Appointment, AppointmentTimelineRow, TimelineEventCode } from "@/lib/vesselmanager/types";
import { parseOperationalInput, toOperationalIso } from "@/lib/vesselmanager/parse-operational-time";
import { filterAppointments } from "@/lib/vesselmanager/viewFilter";
import TimelinePanel from "./timeline-panel";
import AppointmentDocumentsPanel from "./appointment-documents-panel";
import ViewSelector, { type View } from "./ViewSelector";
import { Clock, AlertTriangle, CheckCircle, ArrowRight, Anchor, Ship, Check, BellOff, CircleParking, CircleCheckBig } from "lucide-react";

type MilestoneCode = "ETA_OUTER_ROADS" | "EPOB" | "ETB" | "ETD";
type ActionCode = "ETA_SERVICES" | "LINE_UP" | "DAILY_REPORT";
type SortBasis = "EPOB" | "ETB" | "ETA_OUTER_ROADS" | "ETD";
type TdyTomoScope = "all" | "followed";
type FollowedSummaryMode = "every_day" | "stop";

type TimelineMap = Record<string, Partial<Record<TimelineEventCode, { eta: string; ata: string }>>>;

type EditingCell =
  | {
      appointmentId: string;
      eventType: MilestoneCode;
      value: string;
    }
  | null;

type ActionValue = "Pending" | "Open" | "Done";
type ActionStateEntry = {
  value: ActionValue;
  updatedOn: string;
};
type ActionState = Record<string, Record<ActionCode, ActionStateEntry>>;
type LineupEntryState = {
  id: string;
  appointment_id: string;
  content: string;
  version: number;
  updated_at: string;
};
type SubAgentRow = { id: string; name: string; slug: string };
type DprBatch =
  | "cgnees_shippers_terminal"
  | "charterers_agent"
  | "principal_dpr"
  | "dpr_for_1"
  | "dpr_for_2"
  | "dpr_for_3"
  | "all";
type DprDraft = {
  openingSentence: string;
  prospects: string;
  lineUp: string;
  shiftReport: string;
  stowplan: string;
  runningSof: string;
  note: string;
  recipients: {
    cgnees_shippers_terminal: string;
    charterers_agent: string;
    principal_dpr: string;
    dpr_for_1: string;
    dpr_for_2: string;
    dpr_for_3: string;
  };
  lastGeneratedAt: string;
  lastGeneratedBatch: DprBatch;
};

const DPR_TOOL = "daily_prospect_report";

function emptyDprDraft(): DprDraft {
  return {
    openingSentence: "",
    prospects: "",
    lineUp: "",
    shiftReport: "",
    stowplan: "",
    runningSof: "",
    note: "",
    recipients: {
      cgnees_shippers_terminal: "",
      charterers_agent: "",
      principal_dpr: "",
      dpr_for_1: "",
      dpr_for_2: "",
      dpr_for_3: "",
    },
    lastGeneratedAt: "",
    lastGeneratedBatch: "principal_dpr",
  };
}

function parseDprDraft(raw: string): DprDraft {
  const base = emptyDprDraft();
  const text = String(raw || "").trim();
  if (!text) return base;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const parsedBatch = String(parsed.lastGeneratedBatch || "");
    return {
      openingSentence: String(parsed.openingSentence || parsed.intro || ""),
      prospects: String(parsed.prospects || parsed.estimates || ""),
      lineUp: String(parsed.lineUp || ""),
      shiftReport: String(parsed.shiftReport || ""),
      stowplan: String(parsed.stowplan || ""),
      runningSof: String(parsed.runningSof || ""),
      note: String(parsed.note || parsed.notes || ""),
      recipients: {
        cgnees_shippers_terminal: String((parsed.recipients as any)?.cgnees_shippers_terminal || ""),
        charterers_agent: String((parsed.recipients as any)?.charterers_agent || ""),
        principal_dpr: String((parsed.recipients as any)?.principal_dpr || ""),
        dpr_for_1: String((parsed.recipients as any)?.dpr_for_1 || ""),
        dpr_for_2: String((parsed.recipients as any)?.dpr_for_2 || ""),
        dpr_for_3: String((parsed.recipients as any)?.dpr_for_3 || ""),
      },
      lastGeneratedAt: String(parsed.lastGeneratedAt || ""),
      lastGeneratedBatch:
        parsedBatch === "cgnees_shippers_terminal" ||
        parsedBatch === "charterers_agent" ||
        parsedBatch === "principal_dpr" ||
        parsedBatch === "dpr_for_1" ||
        parsedBatch === "dpr_for_2" ||
        parsedBatch === "dpr_for_3" ||
        parsedBatch === "all"
          ? parsedBatch
          : parsedBatch === "principal"
            ? "principal_dpr"
            : parsedBatch === "batch_a"
              ? "cgnees_shippers_terminal"
              : parsedBatch === "batch_b"
                ? "charterers_agent"
                : parsedBatch === "batch_c"
                  ? "dpr_for_1"
                  : parsedBatch === "batch_d"
                    ? "dpr_for_2"
                    : "principal_dpr",
    };
  } catch {
    return { ...base, prospects: text };
  }
}

function formatOperationalDisplay(date: string, text?: string | null) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return text ? `${date} ${text}` : date;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const base = `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]}`;
  if (!text) return base;
  return `${base} ${text}`;
}

function splitOperationalInput(input: string) {
  const parts = input.trim().split(" ");
  return {
    datePart: parts[0] || "",
    timeText: parts.slice(1).join(" "),
  };
}

function parseDatePart(datePart: string) {
  const m = datePart.match(/^(\d{1,2})([A-Z]{3})$/i);
  if (!m) return null;

  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const day = parseInt(m[1], 10);
  const month = months[m[2].toUpperCase()];
  if (Number.isNaN(day) || month === undefined) return null;

  const now = new Date();
  return new Date(now.getFullYear(), month, day);
}

const monthNumberMap: Record<string, number> = {
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

function timelineDisplay(item?: { eta: string; ata: string }) {
  if (!item || (!item.eta && !item.ata)) return { top: "--", bottom: "" };
  const source = item.ata || item.eta;
  if (!source) return { top: "--", bottom: "" };

  const dt = new Date(source);
  if (Number.isNaN(dt.getTime())) {
    const parts = String(source).trim().split(/\s+/);
    if (parts.length >= 2 && /^[A-Za-z]{3}$/.test(parts[1])) {
      return { top: `${parts[0]} ${parts[1]}`, bottom: parts.slice(2).join(" ") };
    }
    return { top: parts[0] || "--", bottom: parts.slice(1).join(" ") };
  }

  const day = String(dt.getDate()).padStart(2, "0");
  const month = dt.toLocaleString("en-US", { month: "short" });
  const hour = String(dt.getHours()).padStart(2, "0");
  const minute = String(dt.getMinutes()).padStart(2, "0");
  return {
    top: `${day} ${month}`,
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
  if (hasAta("ETD")) return "SAILED";
  if (hasAta("ETB")) return "ALONGSIDE";
  if (hasAta("ETA_RIVER")) return "IN PORT";
  if (hasAta("EPOB")) return "ANCHORED OUTER ROADS";
  if (hasAny("ETA_OUTER_ROADS")) return "EN ROUTE";
  if (fallback === "CLOSED") return "CLOSED";
  if (fallback === "SAILED") return "SAILED";
  return "";
}

function trafficIcon(state: string) {
  if (state === "EN ROUTE") return <ArrowRight size={14} className="text-sky-400" />;
  if (state === "ANCHORED OUTER ROADS") return <Anchor size={14} className="text-amber-400" />;
  if (state === "IN PORT") return <CircleParking size={14} className="text-indigo-400" />;
  if (state === "ALONGSIDE") return <Ship size={14} className="text-cyan-400" />;
  if (state === "SAILED") return <Check size={14} className="text-slate-300" />;
  if (state === "CLOSED") return <CircleCheckBig size={14} className="text-emerald-400" />;
  return null;
}

function formatQty(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return Math.round(value).toLocaleString("en-US");
}

function formatQtyK(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
  const k = Number(value) / 1000;
  if (Number.isInteger(k)) return `${k}K`;
  return `${k.toFixed(1).replace(".", ",")}K`;
}

function renderActionIcon(
  code: ActionCode,
  state: ActionValue,
  appointment: Appointment,
) {
  const asBool = (value: unknown): boolean | null => {
    if (value === true || value === false) return value;
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const v = value.trim().toLowerCase();
      if (v === "true" || v === "1" || v === "yes") return true;
      if (v === "false" || v === "0" || v === "no" || v === "") return false;
    }
    return null;
  };

  const hour = new Date().getHours();
  if (state === "Done") {
    return <CheckCircle size={18} className="text-emerald-400 mx-auto" />;
  }

  // Operational default: alerts are required unless explicitly disabled by agent.
  const notifyNone = asBool(appointment.notify_none) ?? false;
  const notifyEtaSuppliers = asBool(appointment.notify_eta_suppliers);
  const notifyEtaAgentsTerminals = asBool(appointment.notify_eta_agents_terminals);
  const needsDailyProspect = asBool(appointment.needs_daily_prospect);

  const etaExplicitlyDisabled = notifyEtaSuppliers === false && notifyEtaAgentsTerminals === false;
  const reportingExplicitlyDisabled = needsDailyProspect === false;

  const etaRequired =
    !notifyNone &&
    !etaExplicitlyDisabled &&
    ((notifyEtaSuppliers ?? true) || (notifyEtaAgentsTerminals ?? true));
  const reportingRequired = !notifyNone && !reportingExplicitlyDisabled && (needsDailyProspect ?? true);
  const isRequired = code === "ETA_SERVICES" ? etaRequired : reportingRequired;

  if (!isRequired) {
    return <BellOff size={16} className="text-slate-500/45 mx-auto" />;
  }

  const isPendingLike = state === "Pending" || state === "Open";
  const isLineUpWarning = code === "LINE_UP" && isPendingLike && hour >= 11;
  const isDailyReportWarning = code === "DAILY_REPORT" && isPendingLike && hour >= 12;

  if (isLineUpWarning || isDailyReportWarning) {
    return <AlertTriangle size={18} className="text-amber-400 mx-auto animate-pulse" />;
  }

  return <Clock size={18} className="text-amber-300 mx-auto" />;
}

function operationAbbrev(value?: string | null) {
  const normalized = (value || "").trim().toUpperCase();
  if (normalized === "LOAD") return "L";
  if (normalized === "DISCH" || normalized === "DISCHARGE") return "D";
  return value || "";
}

function statusFromTrafficState(
  fallback: Appointment["status"],
  trafficState: string,
): Appointment["status"] {
  if (trafficState === "EN ROUTE") return "EN ROUTE";
  if (trafficState === "ANCHORED OUTER ROADS") return "ANCHORED OUTER ROADS";
  if (trafficState === "IN PORT") return "IN PORT";
  if (trafficState === "ALONGSIDE") return "ALONGSIDE";
  if (trafficState === "SAILED") return "SAILED";
  if (trafficState === "CLOSED") return "CLOSED";
  return fallback;
}

function compactEventValue(timeline: Record<string, { eta: string; ata: string } | undefined>, eventType: string) {
  const display = timelineDisplay(timeline[eventType]);
  if (display.top === "--") return "--";
  return display.bottom ? `${display.top} ${display.bottom}` : display.top;
}

function monthIndexFromShort(month: string) {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return months.indexOf(month.toUpperCase());
}

function parseTimelineSourceToDate(source: string) {
  const raw = String(source || "").trim();
  if (!raw) return null;
  const native = new Date(raw);
  if (!Number.isNaN(native.getTime())) return native;

  const m = raw.match(/^(\d{1,2})\s?([A-Za-z]{3})(?:\s+(.+))?$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = monthIndexFromShort(m[2]);
  if (!Number.isFinite(day) || day < 1 || day > 31 || month < 0) return null;
  const year = new Date().getFullYear();
  return new Date(year, month, day, 0, 0, 0, 0);
}

function parseTimelineTimeSort(source: string) {
  const raw = String(source || "").trim();
  if (!raw) return { sort: 9999, label: "--" };

  const native = new Date(raw);
  if (!Number.isNaN(native.getTime())) {
    const h = native.getHours();
    const m = native.getMinutes();
    return { sort: h * 60 + m, label: `${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}hs` };
  }

  const m = raw.match(/^(\d{1,2})\s?([A-Za-z]{3})(?:\s+(.+))?$/);
  const tail = (m?.[3] || "").trim().toUpperCase();
  if (!tail) return { sort: 9999, label: "--" };

  const hhmm = tail.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const mm = Number(hhmm[2]);
    return { sort: h * 60 + mm, label: `${String(h).padStart(2, "0")}${String(mm).padStart(2, "0")}hs` };
  }

  const hh = tail.match(/^([01]?\d|2[0-3])H$/);
  if (hh) {
    const h = Number(hh[1]);
    return { sort: h * 60, label: `${String(h).padStart(2, "0")}00hs` };
  }

  const periodSort: Record<string, number> = {
    EAM: 7 * 60,
    AM: 9 * 60,
    NOON: 12 * 60,
    PM: 15 * 60,
    EPM: 18 * 60,
    LPM: 21 * 60,
  };
  if (periodSort[tail] !== undefined) {
    return { sort: periodSort[tail], label: tail };
  }

  return { sort: 9999, label: tail };
}

function eventCodeLabel(code: TimelineEventCode) {
  if (code === "ETA_OUTER_ROADS") return "ETA EOSP";
  return code.replaceAll("_", " ");
}

export default function VesselBoard({ appointments }: { appointments: Appointment[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>("board");
  const [sortBasis, setSortBasis] = useState<SortBasis>("EPOB");
  const [tdyTomoScope, setTdyTomoScope] = useState<TdyTomoScope>("all");
  const [followedIds, setFollowedIds] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [followedSummaryMode, setFollowedSummaryMode] = useState<FollowedSummaryMode>("stop");
  const [followedSummaryStatus, setFollowedSummaryStatus] = useState("");
  const [sendingFollowedSummary, setSendingFollowedSummary] = useState(false);
  const currentUser = null;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeAppointment, setActiveAppointment] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [workspaceTextByKey, setWorkspaceTextByKey] = useState<Record<string, string>>({});
  const [loadedWorkspaceKeys, setLoadedWorkspaceKeys] = useState<Record<string, boolean>>({});
  const [timelineByAppointment, setTimelineByAppointment] = useState<TimelineMap>({});
  const [loadingTimeline, setLoadingTimeline] = useState<Record<string, boolean>>({});
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [savingCell, setSavingCell] = useState(false);
  const [, setEditingError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [actionState, setActionState] = useState<ActionState>({});
  const [lineupByAppointment, setLineupByAppointment] = useState<Record<string, LineupEntryState>>({});
  const [subAgentById, setSubAgentById] = useState<Record<string, string>>({});
  const [shiftLinkStatus, setShiftLinkStatus] = useState<Record<string, string>>({});
  const [dprByAppointment, setDprByAppointment] = useState<Record<string, DprDraft>>({});
  const [dprBusyByAppointment, setDprBusyByAppointment] = useState<Record<string, boolean>>({});
  const [dprStatusByAppointment, setDprStatusByAppointment] = useState<Record<string, string>>({});
  const [dprBatchByAppointment, setDprBatchByAppointment] = useState<Record<string, DprBatch>>({});

  const workspaceKey = (appointmentId: string, tool: string) =>
    `${appointmentId}:${tool}`;

  const ensureTimelineLoaded = async (appointmentId: string) => {
    if (timelineByAppointment[appointmentId]) return timelineByAppointment[appointmentId];
    setLoadingTimeline((prev) => ({ ...prev, [appointmentId]: true }));
    try {
      const res = await fetch(`/api/vesselmanager/appointments/${appointmentId}`, { cache: "no-store" });
      const json = (await res.json()) as { data?: { timeline?: AppointmentTimelineRow[] }; error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load timeline");
      const map: Partial<Record<TimelineEventCode, { eta: string; ata: string }>> = {};
      (json.data?.timeline || []).forEach((row) => {
        const withOperational = row as AppointmentTimelineRow & {
          event_date?: string | null;
          event_time_text?: string | null;
        };
        if (withOperational.event_time_text && !withOperational.event_date) {
          map[row.event_type] = {
            eta: row.eta || withOperational.event_time_text,
            ata: row.ata || "",
          };
          return;
        }
        if (withOperational.event_date) {
          const formatted = formatOperationalDisplay(withOperational.event_date, withOperational.event_time_text);
          map[row.event_type] = {
            eta: formatted,
            ata: withOperational.event_time_text && row.ata ? formatted : row.ata || "",
          };
          return;
        }
        map[row.event_type] = { eta: row.eta || "", ata: row.ata || "" };
      });
      setTimelineByAppointment((prev) => ({ ...prev, [appointmentId]: map }));
      return map;
    } finally {
      setLoadingTimeline((prev) => ({ ...prev, [appointmentId]: false }));
    }
  };

  const toggleExpand = async (id: string) => {
    const isCollapsing = expandedId === id;
    setActiveAppointment(null);
    setActiveTool(null);
    setExpandedId((prev) => (prev === id ? null : id));
    if (isCollapsing) return;
    await ensureTimelineLoaded(id);
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
    const raw = editingCell.value.trim();
    let eta: string | null = null;
    let ata: string | null = null;
    let eventDate: string | null = null;
    let eventTimeText: string | null = null;
    let displayValue = "";

    if (raw === "") {
      setEditingError("");
    } else if (raw.toUpperCase() === "TBC") {
      setEditingError("");
      eventTimeText = "TBC";
      displayValue = "TBC";
    } else {
      const parsed = parseOperationalInput(raw);
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
      const month = monthNumberMap[parsed.monthCode];
      if (!month) {
        setEditingError("Invalid time format. Use DDMMM HH or DDMMM HH:MM.");
        return;
      }
      const now = new Date();
      const eventDateObj = new Date(now.getFullYear(), month - 1, parsed.day);
      if (Number.isNaN(eventDateObj.getTime())) {
        setEditingError("Invalid time format. Use DDMMM HH or DDMMM HH:MM.");
        return;
      }
      setEditingError("");
      eventDate = `${now.getFullYear()}-${String(month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
      eventTimeText =
        parsed.parsed.type === "period"
          ? parsed.token
          : parsed.token.includes(":")
            ? parsed.token
            : `${parsed.token.replace(/H$/i, "")}h`;
      displayValue = formatOperationalDisplay(eventDateObj.toISOString(), eventTimeText);
      if (parsed.minuteProvided) ata = iso;
      else eta = iso;
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
          eta,
          ata,
          event_date: eventDate,
          event_time_text: eventTimeText,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to save timeline value");

      setTimelineByAppointment((prev) => ({
        ...prev,
        [editingCell.appointmentId]: {
          ...(prev[editingCell.appointmentId] || {}),
          [editingCell.eventType]: {
            eta: eta ? displayValue : eventTimeText || "",
            ata: ata ? displayValue : "",
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

  const todayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };
  const localDateKeyFromIso = (value?: string | null) => {
    if (!value) return "";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "";
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };

  const defaultActionValue = (code: ActionCode): ActionValue =>
    code === "ETA_SERVICES" ? "Pending" : "Open";

  const cycleAction = (appointmentId: string, code: ActionCode) => {
    if (code === "LINE_UP") {
      void handleOpenTool(appointmentId, "lineup");
      return;
    }
    if (code === "DAILY_REPORT") {
      void handleOpenTool(appointmentId, DPR_TOOL);
      return;
    }
    setActionState((prev) => {
      const current = actionValue(appointmentId, code);
      const next = current === "Pending" ? "Open" : current === "Open" ? "Done" : "Pending";
      const prevForAppointment = prev[appointmentId] || {};
      return {
        ...prev,
        [appointmentId]: {
          ...prevForAppointment,
          [code]: {
            value: next,
            updatedOn: todayKey(),
          },
        },
      };
    });
  };

  const actionValue = (appointmentId: string, code: ActionCode): ActionValue => {
    if (code === "LINE_UP") {
      const lineup = lineupByAppointment[appointmentId];
      if (!lineup?.content?.trim()) return "Open";
      return localDateKeyFromIso(lineup.updated_at) === todayKey() ? "Done" : "Open";
    }
    if (code === "DAILY_REPORT") {
      const dpr = dprByAppointment[appointmentId];
      if (dpr?.lastGeneratedAt && localDateKeyFromIso(dpr.lastGeneratedAt) === todayKey()) {
        return "Done";
      }
    }
    const entry = actionState[appointmentId]?.[code];
    if (!entry) return defaultActionValue(code);
    // Daily reset: yesterday's DONE becomes today's default pending/open.
    if (entry.value === "Done" && entry.updatedOn !== todayKey()) {
      return defaultActionValue(code);
    }
    return entry.value;
  };

  const handleOpenTool = async (
    appointmentId: string,
    tool:
      | "lineup"
      | "husbandry_notes"
      | "accounting_notes"
      | "commercial_notes"
      | "shiftreporter"
      | "documents"
      | "daily_prospect_report",
  ) => {
    setActiveAppointment(appointmentId);
    setActiveTool(tool);
    if (tool === "documents") return;
    const key = workspaceKey(appointmentId, tool);
    if (!loadedWorkspaceKeys[key]) {
      try {
        if (tool === "lineup") {
          const res = await fetch(
            `/api/vesselmanager/lineup?appointment_id=${encodeURIComponent(appointmentId)}`,
            { cache: "no-store" },
          );
          const json = (await res.json()) as {
            data?: {
              id: string;
              appointment_id: string;
              content: string;
              version: number;
              updated_at: string;
            } | null;
          };
          if (res.ok) {
            setWorkspaceTextByKey((prev) => ({
              ...prev,
              [key]: json.data?.content ?? "",
            }));
            if (json.data) {
              setLineupByAppointment((prev) => ({
                ...prev,
                [appointmentId]: json.data!,
              }));
            }
          }
        } else {
          const res = await fetch(
            `/api/vesselmanager/workspace-notes?appointment_id=${encodeURIComponent(appointmentId)}&tool=${encodeURIComponent(tool)}`,
            { cache: "no-store" },
          );
          const json = (await res.json()) as { data?: { content?: string | null } | null };
          if (res.ok) {
            const content = json.data?.content ?? "";
            setWorkspaceTextByKey((prev) => ({
              ...prev,
              [key]: content,
            }));
            if (tool === DPR_TOOL) {
              const parsed = parseDprDraft(content);
              setDprByAppointment((prev) => ({ ...prev, [appointmentId]: parsed }));
              setDprBatchByAppointment((prev) => ({ ...prev, [appointmentId]: parsed.lastGeneratedBatch || "principal_dpr" }));
            }
          }
        }
      } finally {
        setLoadedWorkspaceKeys((prev) => ({ ...prev, [key]: true }));
      }
    }

  };

  const saveWorkspaceNote = async (appointmentId: string, tool: string, content: string) => {
    if (tool === "lineup") {
      const expectedVersion = lineupByAppointment[appointmentId]?.version || 0;
      const res = await fetch("/api/vesselmanager/lineup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: appointmentId,
          content,
          expected_version: expectedVersion,
          updated_by: "staff",
          updated_by_type: "staff",
          source: "vesselmanager",
        }),
      });
      const json = (await res.json()) as {
        data?: LineupEntryState;
        error?: string;
      };
      if (!res.ok || !json.data) {
        setSaveError(json.error || "Failed to save lineup");
        return;
      }
      setSaveError("");
      setLineupByAppointment((prev) => ({ ...prev, [appointmentId]: json.data! }));
      return;
    }

    await fetch("/api/vesselmanager/workspace-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointment_id: appointmentId,
        tool,
        content,
      }),
    });
  };

  const syncDprDraft = (appointmentId: string, updater: (prev: DprDraft) => DprDraft) => {
    setDprByAppointment((prev) => {
      const nextDraft = updater(prev[appointmentId] || emptyDprDraft());
      const key = workspaceKey(appointmentId, DPR_TOOL);
      setWorkspaceTextByKey((textPrev) => ({ ...textPrev, [key]: JSON.stringify(nextDraft) }));
      return { ...prev, [appointmentId]: nextDraft };
    });
  };

  const fetchDprSnapshot = async (
    appointmentId: string,
    target: "lineUp" | "shiftReport" | "stowplan" | "runningSof",
  ) => {
    setDprBusyByAppointment((prev) => ({ ...prev, [appointmentId]: true }));
    setDprStatusByAppointment((prev) => ({ ...prev, [appointmentId]: "" }));
    try {
      const res = await fetch(`/api/vesselmanager/dpr-snapshot?appointment_id=${encodeURIComponent(appointmentId)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        data?: {
          lineup?: string;
          lineupUpdatedAt?: string | null;
          stowplan?: string;
          cargoThisShift?: string;
          runningSof?: string;
        };
        error?: string;
      };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to fetch DPR data");
      const snapshot = json.data;

      if (target === "lineUp") {
        syncDprDraft(appointmentId, (draft) => ({
          ...draft,
          lineUp: String(snapshot.lineup || "").trim() || "-",
        }));
      } else if (target === "shiftReport") {
        syncDprDraft(appointmentId, (draft) => ({
          ...draft,
          shiftReport: String(snapshot.cargoThisShift || "").trim() || "-",
        }));
      } else if (target === "stowplan") {
        syncDprDraft(appointmentId, (draft) => ({
          ...draft,
          stowplan: String(snapshot.stowplan || "").trim() || "-",
        }));
      } else {
        syncDprDraft(appointmentId, (draft) => ({
          ...draft,
          runningSof: String(snapshot.runningSof || "").trim() || "-",
        }));
      }
      setDprStatusByAppointment((prev) => ({ ...prev, [appointmentId]: "Fetched latest data." }));
    } catch (error: unknown) {
      setDprStatusByAppointment((prev) => ({
        ...prev,
        [appointmentId]: error instanceof Error ? error.message : "Failed to fetch DPR data",
      }));
    } finally {
      setDprBusyByAppointment((prev) => ({ ...prev, [appointmentId]: false }));
    }
  };

  const generateDprEmail = async (appointmentId: string) => {
    const draft = dprByAppointment[appointmentId] || emptyDprDraft();
    const batch = dprBatchByAppointment[appointmentId] || "principal_dpr";
    setDprBusyByAppointment((prev) => ({ ...prev, [appointmentId]: true }));
    setDprStatusByAppointment((prev) => ({ ...prev, [appointmentId]: "" }));
    try {
      const res = await fetch("/api/vesselmanager/dpr-compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: appointmentId,
          batch,
          recipient_groups: draft.recipients,
          dpr: {
            openingSentence: draft.openingSentence,
            prospects: draft.prospects,
            lineUp: draft.lineUp,
            shiftReport: draft.shiftReport,
            stowplan: draft.stowplan,
            runningSof: draft.runningSof,
            note: draft.note,
          },
        }),
      });
      const json = (await res.json()) as {
        data?: { mailto?: string };
        error?: string;
      };
      if (!res.ok || !json.data?.mailto) throw new Error(json.error || "Failed to compose email");

      if (typeof window !== "undefined") {
        window.location.href = json.data.mailto;
      }
      const nowIso = new Date().toISOString();
      syncDprDraft(appointmentId, (prev) => ({
        ...prev,
        lastGeneratedAt: nowIso,
        lastGeneratedBatch: batch,
      }));
      setActionState((prev) => ({
        ...prev,
        [appointmentId]: {
          ...(prev[appointmentId] || {}),
          DAILY_REPORT: { value: "Done", updatedOn: todayKey() },
        },
      }));
      setDprStatusByAppointment((prev) => ({ ...prev, [appointmentId]: "Email draft opened in Outlook." }));
    } catch (error: unknown) {
      setDprStatusByAppointment((prev) => ({
        ...prev,
        [appointmentId]: error instanceof Error ? error.message : "Failed to generate email",
      }));
    } finally {
      setDprBusyByAppointment((prev) => ({ ...prev, [appointmentId]: false }));
    }
  };

  const generateDprEml = async (appointmentId: string) => {
    const draft = dprByAppointment[appointmentId] || emptyDprDraft();
    const batch = dprBatchByAppointment[appointmentId] || "principal_dpr";
    setDprBusyByAppointment((prev) => ({ ...prev, [appointmentId]: true }));
    setDprStatusByAppointment((prev) => ({ ...prev, [appointmentId]: "" }));
    try {
      const res = await fetch("/api/vesselmanager/dpr-compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: appointmentId,
          batch,
          output: "eml",
          recipient_groups: draft.recipients,
          dpr: {
            openingSentence: draft.openingSentence,
            prospects: draft.prospects,
            lineUp: draft.lineUp,
            shiftReport: draft.shiftReport,
            stowplan: draft.stowplan,
            runningSof: draft.runningSof,
            note: draft.note,
          },
        }),
      });
      const json = (await res.json()) as {
        data?: { eml?: string; filename?: string };
        error?: string;
      };
      if (!res.ok || !json.data?.eml) throw new Error(json.error || "Failed to build Outlook draft");

      if (typeof window !== "undefined") {
        const blob = new Blob([json.data.eml], { type: "message/rfc822;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = json.data.filename || `dpr-${appointmentId}.eml`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      setDprStatusByAppointment((prev) => ({
        ...prev,
        [appointmentId]: "Outlook draft (.eml) downloaded. Open it and click Send.",
      }));
    } catch (error: unknown) {
      setDprStatusByAppointment((prev) => ({
        ...prev,
        [appointmentId]: error instanceof Error ? error.message : "Failed to generate Outlook draft",
      }));
    } finally {
      setDprBusyByAppointment((prev) => ({ ...prev, [appointmentId]: false }));
    }
  };

  useEffect(() => {
    const ids = appointments.map((x) => x.id).filter(Boolean);
    if (!ids.length) return;
    const run = async () => {
      const res = await fetch(`/api/vesselmanager/lineup?appointment_ids=${encodeURIComponent(ids.join(","))}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { data?: LineupEntryState[] };
      if (!res.ok || !json.data) return;
      const map: Record<string, LineupEntryState> = {};
      json.data.forEach((item) => {
        map[item.appointment_id] = item;
      });
      setLineupByAppointment(map);
    };
    void run();
  }, [appointments]);

  useEffect(() => {
    const run = async () => {
      const res = await fetch("/api/vesselmanager/sub-agents", { cache: "no-store" });
      const json = (await res.json()) as { data?: SubAgentRow[] };
      if (!res.ok || !json.data) return;
      const map: Record<string, string> = {};
      json.data.forEach((row) => {
        map[row.id] = `${row.name} (${row.slug})`;
      });
      setSubAgentById(map);
    };
    void run();
  }, []);

  const toAbsoluteUrl = (pathOrUrl: string) => {
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
    if (typeof window === "undefined") return pathOrUrl;
    return `${window.location.origin}${pathOrUrl}`;
  };

  const toPublicViewUrl = (pathOrUrl: string) => {
    const raw = toAbsoluteUrl(pathOrUrl);
    const m = raw.match(/\/v\/([^/?#]+)/i);
    if (!m?.[1]) return "";
    return `${window.location.origin}/v/${m[1]}/view`;
  };

  const ensureShiftReportLink = async (appointment: Appointment, fallbackLink: string) => {
    const current = appointment.shiftreporter_link?.trim() || fallbackLink;
    if (current.startsWith("/v/") || current.startsWith("http://") || current.startsWith("https://")) {
      return current;
    }

    const res = await fetch(`/api/vesselmanager/appointments/${appointment.id}/shift-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = (await res.json()) as { data?: { link?: string }; error?: string };
    if (!res.ok || !json.data?.link) {
      throw new Error(json.error || "Failed to create Shift Report link");
    }
    return json.data.link;
  };

  useEffect(() => {
    if (!activeAppointment || !activeTool) return;
    if (activeTool === "shiftreporter") return;
    const key = workspaceKey(activeAppointment, activeTool);
    const content = workspaceTextByKey[key] ?? "";
    const timer = setTimeout(() => {
      void saveWorkspaceNote(activeAppointment, activeTool, content);
    }, 600);
    return () => clearTimeout(timer);
  }, [activeAppointment, activeTool, workspaceTextByKey]);

  const appointmentsForViews = useMemo(() => {
    return appointments.map((appointment) => {
      const timeline = timelineByAppointment[appointment.id];
      const trafficState = deriveTrafficState(appointment.status, timeline);
      const status = statusFromTrafficState(appointment.status, trafficState);
      return {
        ...appointment,
        status,
        etd_ata: timeline?.ETD?.ata || null,
        epob_ata: timeline?.EPOB?.ata || null,
        complete_ops_ata: timeline?.COMPLETE_OPS?.ata || null,
        followed_by_user: !!followedIds[appointment.id],
      };
    });
  }, [appointments, timelineByAppointment, followedIds]);

  const counts = useMemo(
    () => ({
      board: filterAppointments("board", appointmentsForViews, currentUser).length,
      my: filterAppointments("my", appointmentsForViews, currentUser).length,
      followed: filterAppointments("followed", appointmentsForViews, currentUser).length,
      inport: filterAppointments("inport", appointmentsForViews, currentUser).length,
      active: filterAppointments("active", appointmentsForViews, currentUser).length,
      sailed: filterAppointments("sailed", appointmentsForViews, currentUser).length,
      checklist_pending: filterAppointments("checklist_pending", appointmentsForViews, currentUser).length,
      tdytomo:
        tdyTomoScope === "followed"
          ? filterAppointments("followed", appointmentsForViews, currentUser).length
          : filterAppointments("active", appointmentsForViews, currentUser).length,
    }),
    [appointmentsForViews, currentUser, tdyTomoScope],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("vesselmanager:board-settings");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { defaultView?: View; sortBasis?: SortBasis; tdyTomoScope?: TdyTomoScope };
      const validViews: View[] = ["board", "my", "followed", "inport", "active", "sailed", "checklist_pending", "tdytomo"];
      const validSort: SortBasis[] = ["EPOB", "ETB", "ETA_OUTER_ROADS", "ETD"];
      const validScope: TdyTomoScope[] = ["all", "followed"];
      if (parsed.defaultView && validViews.includes(parsed.defaultView)) {
        setView(parsed.defaultView);
      }
      if (parsed.sortBasis && validSort.includes(parsed.sortBasis)) {
        setSortBasis(parsed.sortBasis);
      }
      if (parsed.tdyTomoScope && validScope.includes(parsed.tdyTomoScope)) {
        setTdyTomoScope(parsed.tdyTomoScope);
      }
    } catch {
      // ignore invalid local settings payload
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!settingsLoaded || typeof window === "undefined") return;
    window.localStorage.setItem(
      "vesselmanager:board-settings",
      JSON.stringify({
        defaultView: view,
        sortBasis,
        tdyTomoScope,
      }),
    );
  }, [view, sortBasis, tdyTomoScope, settingsLoaded]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("vesselmanager:followed-ids");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setFollowedIds(parsed || {});
    } catch {
      // ignore invalid localStorage payload
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("vesselmanager:followed-ids", JSON.stringify(followedIds));
  }, [followedIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("vesselmanager:followed-summary-mode");
    if (saved === "every_day" || saved === "stop") setFollowedSummaryMode(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("vesselmanager:followed-summary-mode", followedSummaryMode);
  }, [followedSummaryMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("vesselmanager:action-state");
      if (!raw) return;
      const parsed = JSON.parse(raw) as ActionState;
      setActionState(parsed || {});
    } catch {
      // ignore invalid localStorage payload
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("vesselmanager:action-state", JSON.stringify(actionState));
  }, [actionState]);

  const visibleRows = useMemo(() => {
    const filtered = filterAppointments(view, appointmentsForViews, currentUser);
    const sortOrder: MilestoneCode[] =
      sortBasis === "EPOB"
        ? ["EPOB", "ETB", "ETA_OUTER_ROADS", "ETD"]
        : sortBasis === "ETB"
          ? ["ETB", "EPOB", "ETA_OUTER_ROADS", "ETD"]
          : sortBasis === "ETA_OUTER_ROADS"
            ? ["ETA_OUTER_ROADS", "EPOB", "ETB", "ETD"]
            : ["ETD", "ETB", "EPOB", "ETA_OUTER_ROADS"];

    const getSortTime = (
      timeline?: Partial<Record<TimelineEventCode, { eta: string; ata: string }>>,
    ) => {
      if (!timeline) return null;
      for (const milestone of sortOrder) {
        const value = timeline[milestone]?.eta || timeline[milestone]?.ata;
        if (value) return value;
      }
      return null;
    };

    return [...filtered].sort((a, b) => {
      const ta = getSortTime(timelineByAppointment[a.id]);
      const tb = getSortTime(timelineByAppointment[b.id]);

      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;

      const da = new Date(ta).getTime();
      const db = new Date(tb).getTime();
      if (Number.isNaN(da) && Number.isNaN(db)) return 0;
      if (Number.isNaN(da)) return 1;
      if (Number.isNaN(db)) return -1;
      return da - db;
    });
  }, [appointmentsForViews, timelineByAppointment, view, currentUser, sortBasis]);

  const boardSnapshotGroups = useMemo(() => {
    const boardRows = filterAppointments("board", appointmentsForViews, currentUser);
    const operating: Appointment[] = [];
    const inPort: Appointment[] = [];
    const enRoute: Appointment[] = [];
    const other: Appointment[] = [];

    boardRows.forEach((appointment) => {
      const timeline = timelineByAppointment[appointment.id];
      const state = deriveTrafficState(appointment.status, timeline);
      if (state === "ALONGSIDE") {
        operating.push(appointment);
      } else if (state === "IN PORT" || state === "ANCHORED OUTER ROADS") {
        inPort.push(appointment);
      } else if (state === "EN ROUTE") {
        enRoute.push(appointment);
      } else {
        other.push(appointment);
      }
    });

    return { operating, inPort, enRoute, other };
  }, [appointmentsForViews, currentUser, timelineByAppointment]);

  const tdyTomoRows = useMemo(() => {
    const base =
      tdyTomoScope === "followed"
        ? filterAppointments("followed", appointmentsForViews, currentUser)
        : filterAppointments("active", appointmentsForViews, currentUser);
    return base;
  }, [appointmentsForViews, currentUser, tdyTomoScope]);

  const tdyTomoEvents = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const afterTomorrow = new Date(tomorrow);
    afterTomorrow.setDate(afterTomorrow.getDate() + 1);
    const codes: TimelineEventCode[] = [
      "ETA_OUTER_ROADS",
      "EPOB",
      "ETA_RIVER",
      "ETHI",
      "ETB",
      "COMMENCE_OPS",
      "COMPLETE_OPS",
      "ET_COSP",
      "ETD",
    ];

    const todayRows: Array<{ sort: number; text: string }> = [];
    const tomorrowRows: Array<{ sort: number; text: string }> = [];

    tdyTomoRows.forEach((appointment) => {
      const timeline = timelineByAppointment[appointment.id];
      if (!timeline) return;
      codes.forEach((code) => {
        const row = timeline[code];
        const source = row?.ata || row?.eta;
        if (!source) return;
        const d = parseTimelineSourceToDate(source);
        if (!d) return;
        const { sort, label } = parseTimelineTimeSort(source);
        const line = `${label} ${eventCodeLabel(code)} - ${appointment.vessel_name}`;
        if (d >= today && d < tomorrow) todayRows.push({ sort, text: line });
        if (d >= tomorrow && d < afterTomorrow) tomorrowRows.push({ sort, text: line });
      });
    });

    todayRows.sort((a, b) => a.sort - b.sort || a.text.localeCompare(b.text));
    tomorrowRows.sort((a, b) => a.sort - b.sort || a.text.localeCompare(b.text));
    return {
      todayLabel: today.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      tomorrowLabel: tomorrow.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      todayRows,
      tomorrowRows,
    };
  }, [tdyTomoRows, timelineByAppointment]);

  useEffect(() => {
    visibleRows.forEach((appt) => {
      void ensureTimelineLoaded(appt.id);
    });
  }, [visibleRows]);

  const toggleFollow = (appointmentId: string) => {
    setFollowedIds((prev) => ({
      ...prev,
      [appointmentId]: !prev[appointmentId],
    }));
  };

  const followedAppointmentIds = useMemo(
    () => Object.entries(followedIds).filter(([, active]) => !!active).map(([id]) => id),
    [followedIds],
  );

  const sendFollowedSummaryNow = async () => {
    if (followedAppointmentIds.length === 0) {
      setFollowedSummaryStatus("No followed vessels selected.");
      return false;
    }
    setSendingFollowedSummary(true);
    setFollowedSummaryStatus("");
    try {
      const res = await fetch("/api/vesselmanager/cron/daily-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          only_followed: true,
          followed_ids: followedAppointmentIds,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not send followed-vessels summary");
      }
      setFollowedSummaryStatus("Followed-vessels summary sent.");
      return true;
    } catch (error) {
      setFollowedSummaryStatus(error instanceof Error ? error.message : "Could not send followed-vessels summary");
      return false;
    } finally {
      setSendingFollowedSummary(false);
    }
  };

  useEffect(() => {
    if (followedSummaryMode !== "every_day" || typeof window === "undefined") return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Buenos_Aires" });
    const sentKey = window.localStorage.getItem("vesselmanager:followed-summary-last-sent");
    if (sentKey === today) return;
    void (async () => {
      const ok = await sendFollowedSummaryNow();
      if (ok) {
        window.localStorage.setItem("vesselmanager:followed-summary-last-sent", today);
      }
    })();
  }, [followedSummaryMode, followedAppointmentIds]);

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <ViewSelector
          current={view}
          onChange={setView}
          counts={counts}
        />
        <div className="relative">
          <button
            type="button"
            className="rounded-md border border-amber-500/80 bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/25"
            onClick={() => setSettingsOpen((prev) => !prev)}
          >
            Personal Preferences
          </button>
          {settingsOpen ? (
            <div className="absolute right-0 z-30 mt-1 w-72 rounded-md border border-slate-700 bg-slate-900 p-3 text-xs shadow-lg">
              <div className="mb-2 text-amber-300">My preferences</div>
              <label className="mb-2 block text-slate-300">
                Preferred default view
                <select
                  className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
                  value={view}
                  onChange={(e) => setView(e.target.value as View)}
                >
                  <option value="board">Summary</option>
                  <option value="my">My Vessels</option>
                  <option value="followed">Followed</option>
                  <option value="inport">In Port</option>
                  <option value="active">All Active</option>
                  <option value="sailed">All Sailed</option>
                  <option value="checklist_pending">Pending Checklist</option>
                </select>
              </label>
              <label className="block text-slate-300">
                Opening sort basis
                <select
                  className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
                  value={sortBasis}
                  onChange={(e) => setSortBasis(e.target.value as SortBasis)}
                >
                  <option value="EPOB">EPOB</option>
                  <option value="ETB">ETB</option>
                  <option value="ETA_OUTER_ROADS">ETA EOSP</option>
                  <option value="ETD">ETD</option>
                </select>
              </label>
              <label className="mt-2 block text-slate-300">
                Tdy &amp; Tomo scope
                <select
                  className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
                  value={tdyTomoScope}
                  onChange={(e) => setTdyTomoScope(e.target.value as TdyTomoScope)}
                >
                  <option value="all">All active vessels</option>
                  <option value="followed">Followed vessels only</option>
                </select>
              </label>
              <div className="mt-3 border-t border-slate-700 pt-2 text-slate-300">
                <div className="mb-1">Followed vessels summary mail</div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    disabled={sendingFollowedSummary}
                    className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-100 hover:bg-slate-800 disabled:opacity-60"
                    onClick={() => {
                      void sendFollowedSummaryNow();
                    }}
                  >
                    Only Now
                  </button>
                  <button
                    type="button"
                    disabled={sendingFollowedSummary}
                    className={`rounded border px-2 py-1 text-[11px] ${followedSummaryMode === "every_day" ? "border-amber-500 text-amber-300" : "border-slate-600 text-slate-100"} hover:bg-slate-800 disabled:opacity-60`}
                    onClick={() => {
                      setFollowedSummaryMode("every_day");
                      setFollowedSummaryStatus("Auto-send enabled (runs when board is opened each day).");
                    }}
                  >
                    Every Day
                  </button>
                  <button
                    type="button"
                    className={`rounded border px-2 py-1 text-[11px] ${followedSummaryMode === "stop" ? "border-rose-500 text-rose-300" : "border-slate-600 text-slate-100"} hover:bg-slate-800`}
                    onClick={() => {
                      setFollowedSummaryMode("stop");
                      setFollowedSummaryStatus("Auto-send stopped.");
                    }}
                  >
                    Stop
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {followedSummaryStatus || `Mode: ${followedSummaryMode === "every_day" ? "Every Day" : "Stopped"}`}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">Saved in this browser only.</div>
            </div>
          ) : null}
        </div>
      </div>
      {view === "tdytomo" ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs">
          <div className="space-y-3 font-mono text-slate-200">
            <div>
              <div className="mb-1 text-slate-300">Tdy ({tdyTomoEvents.todayLabel})</div>
              {tdyTomoEvents.todayRows.length === 0 ? (
                <div className="text-slate-500">- none</div>
              ) : (
                <div className="space-y-1">
                  {tdyTomoEvents.todayRows.map((row, idx) => (
                    <div key={`tdy-${idx}`}>{row.text}</div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="mb-1 text-slate-300">Tomorrow ({tdyTomoEvents.tomorrowLabel})</div>
              {tdyTomoEvents.tomorrowRows.length === 0 ? (
                <div className="text-slate-500">- none</div>
              ) : (
                <div className="space-y-1">
                  {tdyTomoEvents.tomorrowRows.map((row, idx) => (
                    <div key={`tom-${idx}`}>{row.text}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {view === "board" ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs">
          <div className="space-y-3 font-mono text-slate-200">
            <div>
              <div className="mb-1 text-slate-300">Vessels Operating ({boardSnapshotGroups.operating.length})</div>
              <div className="space-y-1">
                {boardSnapshotGroups.operating.length === 0 ? (
                  <div className="text-slate-500">- none</div>
                ) : (
                  boardSnapshotGroups.operating.map((appointment) => {
                    const timeline = (timelineByAppointment[appointment.id] || {}) as Record<
                      string,
                      { eta: string; ata: string } | undefined
                    >;
                    return (
                      <div key={`op-${appointment.id}`}>
                        {appointment.vessel_name}
                        {" | "}
                        COMP OPS: {compactEventValue(timeline, "COMPLETE_OPS")}
                        {" | "}
                        ETD: {compactEventValue(timeline, "ETD")}
                        {" | "}
                        ETA BUNKER: {compactEventValue(timeline, "ETA_BUNKER")}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 text-slate-300">Vessels in Port ({boardSnapshotGroups.inPort.length})</div>
              <div className="space-y-1">
                {boardSnapshotGroups.inPort.length === 0 ? (
                  <div className="text-slate-500">- none</div>
                ) : (
                  boardSnapshotGroups.inPort.map((appointment) => {
                    const timeline = (timelineByAppointment[appointment.id] || {}) as Record<
                      string,
                      { eta: string; ata: string } | undefined
                    >;
                    return (
                      <div key={`port-${appointment.id}`}>
                        {appointment.vessel_name}
                        {" | "}
                        EPOB: {compactEventValue(timeline, "EPOB")}
                        {" | "}
                        ETB: {compactEventValue(timeline, "ETB")}
                        {" | "}
                        ETD: {compactEventValue(timeline, "ETD")}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 text-slate-300">Vessels en route ({boardSnapshotGroups.enRoute.length})</div>
              <div className="space-y-1">
                {boardSnapshotGroups.enRoute.length === 0 ? (
                  <div className="text-slate-500">- none</div>
                ) : (
                  boardSnapshotGroups.enRoute.map((appointment) => {
                    const timeline = (timelineByAppointment[appointment.id] || {}) as Record<
                      string,
                      { eta: string; ata: string } | undefined
                    >;
                    return (
                      <div key={`route-${appointment.id}`}>
                        {appointment.vessel_name}
                        {" | "}
                        ETA EOSP: {compactEventValue(timeline, "ETA_OUTER_ROADS")}
                        {" | "}
                        EPOB: {compactEventValue(timeline, "EPOB")}
                        {" | "}
                        ETB: {compactEventValue(timeline, "ETB")}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {boardSnapshotGroups.other.length > 0 ? (
              <div>
                <div className="mb-1 text-slate-300">Other Active ({boardSnapshotGroups.other.length})</div>
                <div className="space-y-1">
                  {boardSnapshotGroups.other.map((appointment) => (
                    <div key={`other-${appointment.id}`}>{appointment.vessel_name}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {view !== "board" && view !== "tdytomo" ? (
      <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
        <table className="w-full table-fixed text-xs">
        <thead>
         <tr className="text-xs text-slate-400 border-b border-slate-700">
          <th className="w-[24px]"></th>
          <th className="w-[420px] text-left px-2">VESSEL</th>
          <th className="w-[82px] text-center">ETA EOSP</th>
          <th className="w-[82px] text-center">EPOB</th>
          <th className="w-[82px] text-center">ETB</th>
          <th className="w-[82px] text-center">ETD</th>
         <th className="w-[72px] text-center">ETA<br />SERVICES</th>
          <th className="w-[64px] text-center">LINE UP</th>
         <th className="w-[72px] text-center">DAILY REPORT</th>
         <th className="w-[26px] text-center"></th>
         <th className="w-[68px] text-center">EDIT</th>
        </tr>
</thead>
        <tbody className="divide-y divide-slate-700 text-slate-200">
          {visibleRows.length === 0 ? (
            <tr>
              <td className="px-2 py-3 text-slate-300" colSpan={11}>
                No appointments found.
              </td>
            </tr>
          ) : (
            visibleRows.map((appointment) => {
              const isExpanded = expandedId === appointment.id;
              const timeline = timelineByAppointment[appointment.id];
              const trafficState = deriveTrafficState(appointment.status, timeline);
              const portTerminal = [appointment.port, appointment.terminal].filter(Boolean).join(" - ");
              const cargoOp = operationAbbrev(appointment.cargo_operation);
              const cargoQty = formatQtyK(appointment.cargo_qty);
              const cargoSpec = [cargoOp, appointment.cargo_grade ?? "", cargoQty].filter(Boolean).join(" ");
              const appointedByText = appointment.appointed_by
                ? `Appntd by ${appointment.appointed_by}${appointment.role ? ` as ${appointment.role}` : ""}`
                : appointment.role
                  ? `Appntd as ${appointment.role}`
                  : "";
              const narrative = [portTerminal, cargoSpec, appointedByText].filter(Boolean).join(" | ");
              const shiftReportLink =
                appointment.shiftreporter_link?.trim() || `/shiftreporter?appointment_id=${appointment.id}`;
              const lineupEntry = lineupByAppointment[appointment.id];
              const lineupStamp = lineupEntry?.updated_at
                ? new Date(lineupEntry.updated_at).toLocaleString()
                : "";
              const initialChartererAgent = appointment.charterer_agent?.trim() || "-";
              const initialOtherAgents = [appointment.other_agents?.trim() || "", appointment.other_agents_role?.trim() || ""]
                .filter(Boolean)
                .join(" | ") || "-";
              const initialSubAgent =
                appointment.sub_agent_id && subAgentById[appointment.sub_agent_id]
                  ? subAgentById[appointment.sub_agent_id]
                  : "-";

              const milestoneCell = (eventType: MilestoneCode) => {
                const isEditing =
                  editingCell?.appointmentId === appointment.id && editingCell?.eventType === eventType;

                const display = timelineDisplay(timeline?.[eventType]);
                return (
                  <div className="relative">
                    {isEditing && editingCell ? (
                      <div className="flex justify-center">
                        <input
                          autoFocus
                          value={editingCell.value}
                          onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void saveCell();
                            }
                            if (e.key === "Escape") {
                              setEditingCell(null);
                              setEditingError("");
                            }
                          }}
                          onBlur={() => {
                            const value = editingCell.value.trim().toUpperCase();
                            if (value === "" || value === "TBC" || parseOperationalInput(editingCell.value)) {
                              void saveCell();
                            }
                          }}
                          className="w-[82px] text-center bg-slate-900 border border-slate-600 text-xs"
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditCell(appointment.id, eventType)}
                        className="w-full max-w-[82px] mx-auto rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-center text-[11px] text-slate-200"
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
                    )}
                  </div>
                );
              };

              return (
                <Fragment key={appointment.id}>
                  <tr className="bg-slate-800">
                    <td className="sticky left-0 z-20 w-[24px] bg-slate-800 px-1 py-0.5 text-center" title={trafficState}>
                      {trafficIcon(trafficState)}
                    </td>
                    <td className="sticky left-[24px] z-20 w-[420px] bg-slate-800 px-1 py-0.5 font-medium text-slate-100">
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
                    <td className="w-[82px] px-1 py-0.5">{milestoneCell("ETA_OUTER_ROADS")}</td>
                    <td className="w-[82px] px-1 py-0.5">{milestoneCell("EPOB")}</td>
                    <td className="w-[82px] px-1 py-0.5">{milestoneCell("ETB")}</td>
                    <td className="w-[82px] px-1 py-0.5">{milestoneCell("ETD")}</td>
                    <td className="w-[72px] px-1 py-0.5">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => cycleAction(appointment.id, "ETA_SERVICES")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") cycleAction(appointment.id, "ETA_SERVICES");
                        }}
                        title="Send ETA Notice"
                        className="cursor-pointer rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-center text-[11px] text-slate-300"
                      >
                        {renderActionIcon("ETA_SERVICES", actionValue(appointment.id, "ETA_SERVICES"), appointment)}
                      </div>
                    </td>
                    <td className="w-[64px] px-1 py-0.5">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => cycleAction(appointment.id, "LINE_UP")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") cycleAction(appointment.id, "LINE_UP");
                        }}
                        title={lineupStamp ? `Line Up updated: ${lineupStamp}` : "Open Line Up"}
                        className="cursor-pointer rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-center text-[11px] text-slate-300"
                      >
                        {renderActionIcon("LINE_UP", actionValue(appointment.id, "LINE_UP"), appointment)}
                      </div>
                    </td>
                    <td className="w-[72px] px-1 py-0.5">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => cycleAction(appointment.id, "DAILY_REPORT")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") cycleAction(appointment.id, "DAILY_REPORT");
                        }}
                        title="Generate Daily Report"
                        className="cursor-pointer rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-center text-[11px] text-slate-300"
                      >
                        {renderActionIcon("DAILY_REPORT", actionValue(appointment.id, "DAILY_REPORT"), appointment)}
                      </div>
                    </td>
                    <td className="w-[26px] px-1 py-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggleFollow(appointment.id)}
                        className={`text-[12px] leading-none ${followedIds[appointment.id] ? "text-amber-300" : "text-slate-500 hover:text-slate-300"}`}
                        title={followedIds[appointment.id] ? "Unfollow" : "Follow"}
                      >
                        {followedIds[appointment.id] ? "★" : "☆"}
                      </button>
                    </td>
                    <td className="w-[68px] px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          router.push(`/vesselmanager/appointments/${appointment.id}/edit`);
                        }}
                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                        title="Edit appointment"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                  {saveError && editingCell?.appointmentId === appointment.id ? (
                    <tr className="bg-slate-900/70">
                      <td colSpan={11} className="px-2 py-1 text-[11px] text-red-400">
                        {saveError}
                      </td>
                    </tr>
                  ) : null}
                  {isExpanded && (
                    <tr className="bg-slate-900/80">
                      <td colSpan={11} className="px-1 py-1">
                        <TimelinePanel
                          appointmentId={appointment.id}
                          initialChartererAgent={initialChartererAgent}
                          initialOtherAgents={initialOtherAgents}
                          initialSubAgent={initialSubAgent}
                        />
                        <div className="mt-2 w-full border border-slate-700 bg-slate-900 p-2">
                          <div className="mb-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap text-sm text-green-400">
                            <button
                              className="text-green-400 hover:text-green-300"
                              onClick={() => {
                                void handleOpenTool(appointment.id, "lineup");
                              }}
                            >
                              line up
                            </button>
                            <span>|</span>
                            <button
                              className="text-green-400 hover:text-green-300"
                              onClick={() => {
                                void handleOpenTool(appointment.id, "husbandry_notes");
                              }}
                            >
                              husbandry notes
                            </button>
                            <span>|</span>
                            <button
                              className="text-green-400 hover:text-green-300"
                              onClick={() => {
                                void handleOpenTool(appointment.id, "accounting_notes");
                              }}
                            >
                              accounting notes
                            </button>
                            <span>|</span>
                            <button
                              className="text-green-400 hover:text-green-300"
                              onClick={() => {
                                void handleOpenTool(appointment.id, "commercial_notes");
                              }}
                            >
                              commercial notes
                            </button>
                            <span>|</span>
                            <button
                              className="text-green-400 hover:text-green-300"
                              onClick={() => {
                                void handleOpenTool(appointment.id, "shiftreporter");
                              }}
                            >
                              shift report link
                            </button>
                            <span>|</span>
                            <button
                              className="text-green-400 hover:text-green-300"
                              onClick={() => {
                                void handleOpenTool(appointment.id, "documents");
                              }}
                            >
                              documents
                            </button>
                            <span>|</span>
                            <button
                              className="text-green-400 hover:text-green-300"
                              onClick={() => {
                                router.push(`/vesselmanager/appointments/${appointment.id}/edit`);
                              }}
                            >
                              edit appointment
                            </button>
                            <span>|</span>
                            <button
                              className="text-green-400 hover:text-green-300"
                              onClick={() => {
                                void handleOpenTool(appointment.id, DPR_TOOL);
                              }}
                            >
                              daily prospect report
                            </button>
                          </div>

                          {activeAppointment === appointment.id && activeTool === "shiftreporter" && (
                            <div className="mt-4 w-full border-t border-slate-700 pt-3">
                              <div className="mb-2 text-xs text-slate-300">Shift Report Link</div>
                              <div className="mb-3 truncate text-sm text-slate-200" title={toAbsoluteUrl(shiftReportLink)}>
                                {toAbsoluteUrl(shiftReportLink)}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800"
                                  onClick={async () => {
                                    const key = `${appointment.id}:copy`;
                                    try {
                                      const ensuredLink = await ensureShiftReportLink(appointment, shiftReportLink);
                                      await navigator.clipboard.writeText(toAbsoluteUrl(ensuredLink));
                                      setShiftLinkStatus((prev) => ({ ...prev, [key]: "Copied" }));
                                    } catch {
                                      setShiftLinkStatus((prev) => ({ ...prev, [key]: "Copy failed" }));
                                    }
                                  }}
                                >
                                  Copy Link
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800"
                                  onClick={async () => {
                                    const key = `${appointment.id}:share`;
                                    try {
                                      const ensuredLink = await ensureShiftReportLink(appointment, shiftReportLink);
                                      const shareUrl = toAbsoluteUrl(ensuredLink);
                                      if (navigator.share) {
                                        await navigator.share({
                                          title: `Shift Report - ${appointment.vessel_name}`,
                                          url: shareUrl,
                                        });
                                      } else {
                                        await navigator.clipboard.writeText(shareUrl);
                                      }
                                      setShiftLinkStatus((prev) => ({ ...prev, [key]: "Shared" }));
                                    } catch {
                                      setShiftLinkStatus((prev) => ({ ...prev, [key]: "Share cancelled" }));
                                    }
                                  }}
                                >
                                  Share Link
                                </button>
                                <button
                                  type="button"
                                  className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
                                  onClick={async () => {
                                    const key = `${appointment.id}:share`;
                                    try {
                                      const ensuredLink = await ensureShiftReportLink(appointment, shiftReportLink);
                                      if (typeof window !== "undefined") {
                                        window.open(toAbsoluteUrl(ensuredLink), "_blank", "noopener,noreferrer");
                                      }
                                    } catch (error) {
                                      setShiftLinkStatus((prev) => ({
                                        ...prev,
                                        [key]: error instanceof Error ? error.message : "Could not open Shift Report",
                                      }));
                                    }
                                  }}
                                >
                                  Add Shift
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-cyan-600 px-3 py-1 text-xs text-cyan-300 hover:bg-cyan-950/30"
                                  onClick={async () => {
                                    const key = `${appointment.id}:view`;
                                    try {
                                      const ensuredLink = await ensureShiftReportLink(appointment, shiftReportLink);
                                      const viewUrl = toPublicViewUrl(ensuredLink);
                                      if (!viewUrl) throw new Error("Could not create VIEW link");
                                      if (typeof window !== "undefined") {
                                        window.open(viewUrl, "_blank", "noopener,noreferrer");
                                      }
                                      setShiftLinkStatus((prev) => ({ ...prev, [key]: "Opened VIEW" }));
                                    } catch (error) {
                                      setShiftLinkStatus((prev) => ({
                                        ...prev,
                                        [key]: error instanceof Error ? error.message : "Could not open VIEW",
                                      }));
                                    }
                                  }}
                                >
                                  VIEW
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800"
                                  onClick={async () => {
                                    const key = `${appointment.id}:viewcopy`;
                                    try {
                                      const ensuredLink = await ensureShiftReportLink(appointment, shiftReportLink);
                                      const viewUrl = toPublicViewUrl(ensuredLink);
                                      if (!viewUrl) throw new Error("Could not create VIEW link");
                                      await navigator.clipboard.writeText(viewUrl);
                                      setShiftLinkStatus((prev) => ({ ...prev, [key]: "VIEW link copied" }));
                                    } catch {
                                      setShiftLinkStatus((prev) => ({ ...prev, [key]: "Copy VIEW link failed" }));
                                    }
                                  }}
                                >
                                  Copy VIEW Link
                                </button>
                              </div>
                              <div className="mt-2 text-[11px] text-slate-400">
                                {shiftLinkStatus[`${appointment.id}:copy`] ||
                                  shiftLinkStatus[`${appointment.id}:share`] ||
                                  shiftLinkStatus[`${appointment.id}:view`] ||
                                  shiftLinkStatus[`${appointment.id}:viewcopy`] ||
                                  ""}
                              </div>
                            </div>
                          )}

                          {activeAppointment === appointment.id && activeTool !== "shiftreporter" && (
                            <div className="mt-4 w-full border-t border-slate-700 pt-3">
                              {activeTool === "documents" ? (
                                <AppointmentDocumentsPanel appointmentId={appointment.id} />
                              ) : null}
                              {activeTool === "lineup" ? (
                                <div className="mb-2 text-[11px] text-slate-400">
                                  {lineupByAppointment[appointment.id]?.updated_at
                                    ? `Last update: ${new Date(lineupByAppointment[appointment.id].updated_at).toLocaleString()}`
                                    : "Last update: -"}
                                </div>
                              ) : null}
                              {activeTool === DPR_TOOL ? (
                                <div className="space-y-3">
                                  <div>
                                    <textarea
                                      rows={3}
                                      className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-slate-200"
                                      placeholder="Opening sentence..."
                                      value={dprByAppointment[appointment.id]?.openingSentence || ""}
                                      onChange={(e) =>
                                        syncDprDraft(appointment.id, (d) => ({ ...d, openingSentence: e.target.value }))
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs text-slate-300">Prospects</label>
                                    <textarea
                                      rows={4}
                                      className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-slate-200"
                                      value={dprByAppointment[appointment.id]?.prospects || ""}
                                      onChange={(e) => syncDprDraft(appointment.id, (d) => ({ ...d, prospects: e.target.value }))}
                                    />
                                  </div>
                                  <div>
                                    <button
                                      type="button"
                                      className="mb-2 rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                                      onClick={() => {
                                        void fetchDprSnapshot(appointment.id, "lineUp");
                                      }}
                                      disabled={!!dprBusyByAppointment[appointment.id]}
                                    >
                                      Fetch Line Up
                                    </button>
                                    <textarea
                                      rows={5}
                                      className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-slate-200"
                                      value={dprByAppointment[appointment.id]?.lineUp || ""}
                                      onChange={(e) => syncDprDraft(appointment.id, (d) => ({ ...d, lineUp: e.target.value }))}
                                    />
                                  </div>
                                  <div>
                                    <button
                                      type="button"
                                      className="mb-2 rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                                      onClick={() => {
                                        void fetchDprSnapshot(appointment.id, "shiftReport");
                                      }}
                                      disabled={!!dprBusyByAppointment[appointment.id]}
                                    >
                                      Fetch Last Shift report
                                    </button>
                                    <textarea
                                      rows={5}
                                      className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-slate-200"
                                      value={dprByAppointment[appointment.id]?.shiftReport || ""}
                                      onChange={(e) => syncDprDraft(appointment.id, (d) => ({ ...d, shiftReport: e.target.value }))}
                                    />
                                  </div>
                                  <div>
                                    <button
                                      type="button"
                                      className="mb-2 rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                                      onClick={() => {
                                        void fetchDprSnapshot(appointment.id, "stowplan");
                                      }}
                                      disabled={!!dprBusyByAppointment[appointment.id]}
                                    >
                                      Fetch Stowplan (with draft)
                                    </button>
                                    <textarea
                                      rows={5}
                                      className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-slate-200"
                                      value={dprByAppointment[appointment.id]?.stowplan || ""}
                                      onChange={(e) => syncDprDraft(appointment.id, (d) => ({ ...d, stowplan: e.target.value }))}
                                    />
                                  </div>
                                  <div>
                                    <button
                                      type="button"
                                      className="mb-2 rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                                      onClick={() => {
                                        void fetchDprSnapshot(appointment.id, "runningSof");
                                      }}
                                      disabled={!!dprBusyByAppointment[appointment.id]}
                                    >
                                      Fetch Running SOF
                                    </button>
                                    <textarea
                                      rows={7}
                                      className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-slate-200"
                                      value={dprByAppointment[appointment.id]?.runningSof || ""}
                                      onChange={(e) => syncDprDraft(appointment.id, (d) => ({ ...d, runningSof: e.target.value }))}
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs text-slate-300">NOTE</label>
                                    <textarea
                                      rows={5}
                                      className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-slate-200"
                                      value={dprByAppointment[appointment.id]?.note || ""}
                                      onChange={(e) => syncDprDraft(appointment.id, (d) => ({ ...d, note: e.target.value }))}
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <select
                                      className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                                      value={dprBatchByAppointment[appointment.id] || "principal_dpr"}
                                      onChange={(e) =>
                                        setDprBatchByAppointment((prev) => ({
                                          ...prev,
                                          [appointment.id]: e.target.value as DprBatch,
                                        }))
                                      }
                                    >
                                      <option value="cgnees_shippers_terminal">Cgnees / Shippers / Terminal</option>
                                      <option value="charterers_agent">Charterer&apos;s Agent</option>
                                      <option value="principal_dpr">Principal DPR</option>
                                      <option value="dpr_for_1">DPR for -name- #1</option>
                                      <option value="dpr_for_2">DPR for -name- #2</option>
                                      <option value="dpr_for_3">DPR for -name- #3</option>
                                      <option value="all">All</option>
                                    </select>
                                    <input
                                      className="min-w-[520px] flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                                      placeholder={
                                        (dprBatchByAppointment[appointment.id] || "principal_dpr") === "all"
                                          ? "All uses the union of all group email lists"
                                          : "email1@x.com, email2@x.com, email3@x.com"
                                      }
                                      disabled={(dprBatchByAppointment[appointment.id] || "principal_dpr") === "all"}
                                      value={(() => {
                                        const draft = dprByAppointment[appointment.id] || emptyDprDraft();
                                        const selected = dprBatchByAppointment[appointment.id] || "principal_dpr";
                                        if (selected === "all") return "";
                                        return draft.recipients[selected];
                                      })()}
                                      onChange={(e) => {
                                        const selected = dprBatchByAppointment[appointment.id] || "principal_dpr";
                                        if (selected === "all") return;
                                        syncDprDraft(appointment.id, (d) => ({
                                          ...d,
                                          recipients: { ...d.recipients, [selected]: e.target.value },
                                        }));
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
                                      onClick={() => {
                                        void generateDprEmail(appointment.id);
                                      }}
                                      disabled={!!dprBusyByAppointment[appointment.id]}
                                    >
                                      Generate Email
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded border border-cyan-500 px-3 py-1 text-xs text-cyan-300 hover:bg-cyan-950/30"
                                      onClick={() => {
                                        void generateDprEml(appointment.id);
                                      }}
                                      disabled={!!dprBusyByAppointment[appointment.id]}
                                    >
                                      Generate Outlook Draft (.eml)
                                    </button>
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {dprStatusByAppointment[appointment.id] || ""}
                                  </div>
                                </div>
                              ) : activeTool === "documents" ? null : (
                                <textarea
                                  rows={20}
                                  className="w-full rounded border border-slate-700 bg-slate-900 p-3 text-slate-200"
                                  style={{
                                    fontFamily: "Courier New, monospace",
                                    fontSize: "11px",
                                  }}
                                  value={workspaceTextByKey[workspaceKey(appointment.id, activeTool || "lineup")] || ""}
                                  onChange={(e) => {
                                    const key = workspaceKey(appointment.id, activeTool || "lineup");
                                    const nextValue = e.target.value;
                                    setWorkspaceTextByKey((prev) => ({ ...prev, [key]: nextValue }));
                                  }}
                                  onBlur={() => {
                                    const tool = activeTool || "lineup";
                                    const key = workspaceKey(appointment.id, tool);
                                    void saveWorkspaceNote(
                                      appointment.id,
                                      tool,
                                      workspaceTextByKey[key] || "",
                                    );
                                  }}
                                />
                              )}
                            </div>
                          )}
                        </div>
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
      ) : null}
    </div>
  );
}

