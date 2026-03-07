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
import ViewSelector, { type View } from "./ViewSelector";
import { Clock, AlertTriangle, CheckCircle, ArrowRight, Anchor, Ship, Check, BellOff } from "lucide-react";

type MilestoneCode = "ETA_OUTER_ROADS" | "EPOB" | "ETB" | "ETD";
type ActionCode = "ETA_SERVICES" | "LINE_UP" | "DAILY_REPORT";
type SortBasis = "EPOB" | "ETB" | "ETA_OUTER_ROADS" | "ETD";

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
  if (hasAta("ETD")) return "CLOSED";
  if (hasAta("ETB")) return "ALONGSIDE";
  if (hasAta("EPOB")) return "AT_ROADS";
  if (hasAny("ETA_OUTER_ROADS")) return "EN_ROUTE";
  if (fallback === "SAILING") return "SAILING";
  return "";
}

function trafficIcon(state: string) {
  if (state === "EN_ROUTE") return <ArrowRight size={14} className="text-sky-400" />;
  if (state === "AT_ROADS") return <Anchor size={14} className="text-amber-400" />;
  if (state === "ALONGSIDE") {
    return (
      <span className="flex flex-col items-center">
        <Anchor size={12} className="text-sky-400" />
        <Anchor size={12} className="-mt-1 text-sky-400" />
      </span>
    );
  }
  if (state === "SAILING") return <Ship size={14} className="text-purple-400" />;
  if (state === "CLOSED") return <Check size={14} className="text-slate-400" />;
  return null;
}

function formatQty(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return Math.round(value).toLocaleString("en-US");
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
  if (trafficState === "CLOSED") return "SAILING";
  if (trafficState === "ALONGSIDE") return "ALONGSIDE";
  if (trafficState === "AT_ROADS") return "OUTER_ROADS";
  if (trafficState === "EN_ROUTE") return "EN_ROUTE";
  return fallback;
}

function compactEventValue(timeline: Record<string, { eta: string; ata: string } | undefined>, eventType: string) {
  const display = timelineDisplay(timeline[eventType]);
  if (display.top === "--") return "--";
  return display.bottom ? `${display.top} ${display.bottom}` : display.top;
}

export default function VesselBoard({ appointments }: { appointments: Appointment[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>("board");
  const [sortBasis, setSortBasis] = useState<SortBasis>("EPOB");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
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
  const [shiftLinkStatus, setShiftLinkStatus] = useState<Record<string, string>>({});

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
            eta: row.eta || formatted,
            ata: row.ata || "",
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

  const defaultActionValue = (code: ActionCode): ActionValue =>
    code === "ETA_SERVICES" ? "Pending" : "Open";

  const cycleAction = (appointmentId: string, code: ActionCode) => {
    setActionState((prev) => {
      const current = actionValue(appointmentId, code);
      const next = current === "Pending" ? "Open" : current === "Open" ? "Done" : "Pending";
      return {
        ...prev,
        [appointmentId]: {
          ETA_SERVICES: prev[appointmentId]?.ETA_SERVICES || { value: "Pending", updatedOn: todayKey() },
          LINE_UP: prev[appointmentId]?.LINE_UP || { value: "Open", updatedOn: todayKey() },
          DAILY_REPORT: prev[appointmentId]?.DAILY_REPORT || { value: "Open", updatedOn: todayKey() },
          ...(prev[appointmentId] || {}),
          [code]: {
            value: next,
            updatedOn: todayKey(),
          },
        },
      };
    });
  };

  const actionValue = (appointmentId: string, code: ActionCode): ActionValue => {
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
      | "running_sof"
      | "husbandry_notes"
      | "other_services"
      | "shiftreporter"
      | "future_box_1"
      | "future_clickable_1"
      | "future_clickable_2",
  ) => {
    setActiveAppointment(appointmentId);
    setActiveTool(tool);
    const key = workspaceKey(appointmentId, tool);
    if (!loadedWorkspaceKeys[key]) {
      try {
        const res = await fetch(
          `/api/vesselmanager/workspace-notes?appointment_id=${encodeURIComponent(appointmentId)}&tool=${encodeURIComponent(tool)}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as { data?: { content?: string | null } | null };
        if (res.ok) {
          setWorkspaceTextByKey((prev) => ({
            ...prev,
            [key]: json.data?.content ?? "",
          }));
        }
      } finally {
        setLoadedWorkspaceKeys((prev) => ({ ...prev, [key]: true }));
      }
    }

    if (tool === "lineup") {
      try {
        await fetch("/api/vesselmanager/lineup-opened", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appointment_id: appointmentId }),
        });
      } catch {
        // non-blocking: workspace should still open even if timestamp logging fails
      }
    }
  };

  const saveWorkspaceNote = async (appointmentId: string, tool: string, content: string) => {
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

  const toAbsoluteUrl = (pathOrUrl: string) => {
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
    if (typeof window === "undefined") return pathOrUrl;
    return `${window.location.origin}${pathOrUrl}`;
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
      };
    });
  }, [appointments, timelineByAppointment]);

  const counts = useMemo(
    () => ({
      board: filterAppointments("board", appointmentsForViews, currentUser).length,
      my: filterAppointments("my", appointmentsForViews, currentUser).length,
      followed: filterAppointments("followed", appointmentsForViews, currentUser).length,
      inport: filterAppointments("inport", appointmentsForViews, currentUser).length,
      active: filterAppointments("active", appointmentsForViews, currentUser).length,
      sailed: filterAppointments("sailed", appointmentsForViews, currentUser).length,
    }),
    [appointmentsForViews, currentUser],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("vesselmanager:board-settings");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { defaultView?: View; sortBasis?: SortBasis };
      const validViews: View[] = ["board", "my", "followed", "inport", "active", "sailed"];
      const validSort: SortBasis[] = ["EPOB", "ETB", "ETA_OUTER_ROADS", "ETD"];
      if (parsed.defaultView && validViews.includes(parsed.defaultView)) {
        setView(parsed.defaultView);
      }
      if (parsed.sortBasis && validSort.includes(parsed.sortBasis)) {
        setSortBasis(parsed.sortBasis);
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
      }),
    );
  }, [view, sortBasis, settingsLoaded]);

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
      } else if (state === "AT_ROADS") {
        inPort.push(appointment);
      } else if (state === "EN_ROUTE") {
        enRoute.push(appointment);
      } else {
        other.push(appointment);
      }
    });

    return { operating, inPort, enRoute, other };
  }, [appointmentsForViews, currentUser, timelineByAppointment]);

  useEffect(() => {
    visibleRows.forEach((appt) => {
      void ensureTimelineLoaded(appt.id);
    });
  }, [visibleRows]);

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
            Settings
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
              <div className="mt-2 text-[11px] text-slate-400">Saved in this browser only.</div>
            </div>
          ) : null}
        </div>
      </div>
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
                        {" -|- "}
                        COMP OPS: {compactEventValue(timeline, "COMPLETE_OPS")}
                        {" -|- "}
                        ETD: {compactEventValue(timeline, "ETD")}
                        {" -|- "}
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
                        {" -|- "}
                        EPOB: {compactEventValue(timeline, "EPOB")}
                        {" -|- "}
                        ETB: {compactEventValue(timeline, "ETB")}
                        {" -|- "}
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
                        {" -|- "}
                        ETA EOSP: {compactEventValue(timeline, "ETA_OUTER_ROADS")}
                        {" -|- "}
                        EPOB: {compactEventValue(timeline, "EPOB")}
                        {" -|- "}
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
      {view !== "board" ? (
      <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
        <table className="w-full table-fixed text-xs">
        <thead>
         <tr className="text-xs text-slate-400 border-b border-slate-700">
          <th className="w-[28px]"></th>
          <th className="w-[420px] text-left px-2">VESSEL</th>
          <th className="w-[90px] text-center">ETA EOSP</th>
          <th className="w-[90px] text-center">EPOB</th>
          <th className="w-[90px] text-center">ETB</th>
          <th className="w-[90px] text-center">ETD</th>
         <th className="w-[90px] text-center">ETA<br />SERVICES</th>
          <th className="w-[80px] text-center">LINE UP</th>
         <th className="w-[90px] text-center">DAILY REPORT</th>
         <th className="w-[80px] text-center">EDIT</th>
        </tr>
</thead>
        <tbody className="divide-y divide-slate-700 text-slate-200">
          {visibleRows.length === 0 ? (
            <tr>
              <td className="px-2 py-3 text-slate-300" colSpan={10}>
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
                `${operationAbbrev(appointment.cargo_operation)} – ${appointment.cargo_grade ?? ""} – ${appointment.cargo_qty ?? ""} | ` +
                `Appointed by: ${appointment.appointed_by ?? ""} as ${appointment.role ?? ""}`;
              const shiftReportLink =
                appointment.shiftreporter_link?.trim() || `/shiftreporter?appointment_id=${appointment.id}`;

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
                          className="w-[90px] text-center bg-slate-900 border border-slate-600 text-xs"
                        />
                      </div>
                    ) : (
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
                    )}
                  </div>
                );
              };

              return (
                <Fragment key={appointment.id}>
                  <tr className="bg-slate-800">
                    <td className="sticky left-0 z-20 w-[28px] bg-slate-800 px-1 py-0.5 text-center" title={trafficState}>
                      {trafficIcon(trafficState)}
                    </td>
                    <td className="sticky left-[28px] z-20 w-[420px] bg-slate-800 px-1 py-0.5 font-medium text-slate-100">
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
                    <td className="w-[90px] px-1 py-0.5">
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
                    <td className="w-[80px] px-1 py-0.5">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => cycleAction(appointment.id, "LINE_UP")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") cycleAction(appointment.id, "LINE_UP");
                        }}
                        title="Open Line Up"
                        className="cursor-pointer rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-center text-[11px] text-slate-300"
                      >
                        {renderActionIcon("LINE_UP", actionValue(appointment.id, "LINE_UP"), appointment)}
                      </div>
                    </td>
                    <td className="w-[90px] px-1 py-0.5">
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
                    <td className="w-[80px] px-1 py-0.5">
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
                      <td colSpan={10} className="px-2 py-1 text-[11px] text-red-400">
                        {saveError}
                      </td>
                    </tr>
                  ) : null}
                  {isExpanded && (
                    <tr className="bg-slate-900/80">
                      <td colSpan={10} className="px-1 py-1">
                        <TimelinePanel
                          appointmentId={appointment.id}
                          initialOtherAppointmentsAgents={
                            appointment.other_agents?.trim() ||
                            appointment.other_agents_role?.trim() ||
                            "-"
                          }
                        />
                        <div className="mt-2 w-full border border-slate-700 bg-slate-900 p-2">
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-green-400">
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
                                void handleOpenTool(appointment.id, "running_sof");
                              }}
                            >
                              running sof
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
                                void handleOpenTool(appointment.id, "other_services");
                              }}
                            >
                              notes
                            </button>
                            <span>|</span>
                            <button
                              className="text-green-400 hover:text-green-300"
                              onClick={() => {
                                void handleOpenTool(appointment.id, "shiftreporter");
                              }}
                            >
                              shift report
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
                              className="italic text-slate-500 hover:text-slate-400"
                              onClick={() => {
                                void handleOpenTool(appointment.id, "future_box_1");
                              }}
                            >
                              FutureBox1
                            </button>
                            <span>|</span>
                            <button
                              className="italic text-slate-500 hover:text-slate-400"
                              onClick={() => {
                                void handleOpenTool(appointment.id, "future_clickable_1");
                              }}
                            >
                              FutureClickable1
                            </button>
                            <span>|</span>
                            <button
                              className="italic text-slate-500 hover:text-slate-400"
                              onClick={() => {
                                void handleOpenTool(appointment.id, "future_clickable_2");
                              }}
                            >
                              FutureClickable2
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
                              </div>
                              <div className="mt-2 text-[11px] text-slate-400">
                                {shiftLinkStatus[`${appointment.id}:copy`] || shiftLinkStatus[`${appointment.id}:share`] || ""}
                              </div>
                            </div>
                          )}

                          {activeAppointment === appointment.id && activeTool !== "shiftreporter" && (
                            <div className="mt-4 w-full border-t border-slate-700 pt-3">
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

