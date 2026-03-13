"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { Fragment, useState } from "react";
import type { DisbursementBoardRow } from "@/lib/disbursementmanager/types";

const statusTone: Record<string, string> = {
  OK: "border-emerald-400/60 bg-emerald-500/15 text-emerald-100 shadow-[0_0_14px_rgba(16,185,129,0.18)]",
  ATENCION: "animate-pulse border-rose-500/70 bg-rose-500/20 font-semibold text-rose-100 shadow-[0_0_16px_rgba(244,63,94,0.28)]",
  URGENTE: "animate-pulse border-red-400/90 bg-red-500/25 font-bold text-red-50 shadow-[0_0_18px_rgba(248,113,113,0.35)]",
  SI: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  NO: "border-slate-500/30 bg-slate-100/5 text-slate-100",
  "N/A": "border-slate-500/30 bg-slate-100/5 text-slate-100",
  PENDIENTE: "border-amber-400/70 bg-amber-400/18 text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.18)]",
};

const accountingStageTone: Record<string, string> = {
  "Falta Hacer": "border-amber-500/40 bg-amber-500/10 text-amber-200",
  "Falta Enviar": "border-orange-500/40 bg-orange-500/10 text-orange-200",
  "Falta Zarpar": "border-slate-500/40 bg-slate-500/10 text-slate-200",
  OK: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
};

type Props = {
  initialRows: DisbursementBoardRow[];
};

type EditState = {
  accounting_reference: string;
  roe: string;
  pda_due_days_override: string;
  pda_sent_on: string;
  pda_not_required: boolean;
  ada_attention_days_override: string;
  ada_urgent_days_override: string;
  ada_created_on: string;
  ada_sent_on: string;
  fda_attention_days_override: string;
  fda_urgent_days_override: string;
  fda_created_on: string;
  fda_sent_on: string;
};

type BoardFilter =
  | "all"
  | "pda_pending"
  | "ada_pending"
  | "ada_attention"
  | "ada_urgent"
  | "fda_pending"
  | "fda_attention"
  | "fda_urgent";

type ScopeFilter = "all" | "sailed_today" | "appointed_today" | "appointed_month" | "appointed_year";

type SortKey = "accounting_reference" | "vessel_info" | "client_name" | "nomination_received_on";
type WorkspaceTool = "husbandry_notes" | "accounting_notes" | "commercial_notes";

const workspaceTools: WorkspaceTool[] = ["husbandry_notes", "accounting_notes", "commercial_notes"];

function toneFor(value: string | null | undefined) {
  return statusTone[value || ""] || "border-slate-700 bg-slate-800 text-slate-200";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

function formatOperationNarrative(row: DisbursementBoardRow) {
  const location = [row.port, row.terminal].filter(Boolean).join(" / ") || "-";
  const details = [row.cargo_operation, row.role].filter(Boolean).join(" | ");
  return details ? `${location} - ${details}` : location;
}

function daysBetween(from?: string | null, to?: string | null) {
  if (!from) return null;
  const start = new Date(from);
  const end = to ? new Date(to) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function daysSinceSailed(departureDate?: string | null) {
  return daysBetween(departureDate, null);
}

function resolveRule(overrideValue: number | null | undefined, fallbackValue: number) {
  return typeof overrideValue === "number" && overrideValue >= 0 ? overrideValue : fallbackValue;
}

function getPdaBadge(row: DisbursementBoardRow) {
  if (row.pda_status === "SI") return "OK";
  if (row.pda_status === "NO") return "N/A";
  return "PENDIENTE";
}

function describePda(row: DisbursementBoardRow) {
  const badge = getPdaBadge(row);
  const daysFromAppointment = daysBetween(row.nomination_received_on, row.pda_sent_on || null);
  const pendingRule = resolveRule(row.pda_due_days_override, 0);

  if (badge === "OK") {
    const detail = daysFromAppointment === null ? formatDate(row.pda_sent_on) : `Enviada a los ${daysFromAppointment} dias`;
    return { label: "OK", tone: toneFor("OK"), detail };
  }
  if (badge === "N/A") {
    return { label: "N/A", tone: toneFor("N/A"), detail: "" };
  }

  const liveDays = daysBetween(row.nomination_received_on, null);
  return {
    label: "pendiente",
    tone: toneFor("PENDIENTE"),
    detail: liveDays === null ? "" : pendingRule > 0 ? `${liveDays} dias desde appointment` : `${liveDays} dias desde appointment`,
  };
}

function describeAda(row: DisbursementBoardRow) {
  const sailedDays = daysSinceSailed(row.departure_date);
  const sailedLabel = sailedDays === null ? "Sin zarpada registrada" : `Zarpo hace ${sailedDays} dias`;
  const sentAfterSailing = daysBetween(row.departure_date, row.ada_sent_on);
  const attentionDays = resolveRule(row.ada_attention_days_override, 6);
  const urgentDays = resolveRule(row.ada_urgent_days_override, 11);

  if (sailedDays === null) {
    return { label: "Falta Zarpar", tone: accountingStageTone["Falta Zarpar"], detail: "" };
  }
  if (row.ada_sent_on) {
    const detail = sentAfterSailing === null ? formatDate(row.ada_sent_on) : `Enviada a los ${sentAfterSailing} dias`;
    return { label: "OK", tone: accountingStageTone.OK, detail };
  }
  if (sailedDays >= urgentDays) {
    return {
      label: "urgente",
      tone: toneFor("URGENTE"),
      detail: row.ada_created_on ? "Hecha, falta enviar" : sailedLabel,
    };
  }
  if (sailedDays >= attentionDays) {
    return {
      label: "atencion",
      tone: toneFor("ATENCION"),
      detail: row.ada_created_on ? "Hecha, falta enviar" : sailedLabel,
    };
  }
  if (row.ada_created_on) {
    return { label: "Falta Enviar", tone: accountingStageTone["Falta Enviar"], detail: sailedLabel };
  }
  return { label: "pendiente en plazo", tone: toneFor("PENDIENTE"), detail: sailedLabel };
}

function describeFda(row: DisbursementBoardRow) {
  const sailedDays = daysSinceSailed(row.departure_date);
  const sailedLabel = sailedDays === null ? "Sin zarpada registrada" : `Zarpo hace ${sailedDays} dias`;
  const sentAfterSailing = daysBetween(row.departure_date, row.fda_sent_on);
  const attentionDays = resolveRule(row.fda_attention_days_override, 30);
  const urgentDays = resolveRule(row.fda_urgent_days_override, 45);

  if (row.fda_sent_on) {
    const detail = sentAfterSailing === null ? formatDate(row.fda_sent_on) : `Enviada ${sentAfterSailing} Dias de Zarpe`;
    return { label: "OK", tone: accountingStageTone.OK, detail };
  }
  if (sailedDays === null) {
    return { label: "Falta Zarpar", tone: accountingStageTone["Falta Zarpar"], detail: "" };
  }
  if (row.fda_created_on) {
    return { label: "Falta Enviar", tone: accountingStageTone["Falta Enviar"], detail: sailedLabel };
  }
  if (sailedDays >= urgentDays) return { label: "urgente", tone: toneFor("URGENTE"), detail: sailedLabel };
  if (sailedDays >= attentionDays) return { label: "atencion", tone: toneFor("ATENCION"), detail: sailedLabel };
  return { label: "pendiente en plazo", tone: toneFor("PENDIENTE"), detail: sailedLabel };
}

function toEditState(row: DisbursementBoardRow): EditState {
  return {
    accounting_reference: row.accounting_reference ?? "",
    roe: row.roe?.toString() ?? "",
    pda_due_days_override: row.pda_due_days_override?.toString() ?? "",
    pda_sent_on: row.pda_sent_on ?? "",
    pda_not_required: row.pda_status === "NO",
    ada_attention_days_override: row.ada_attention_days_override?.toString() ?? "",
    ada_urgent_days_override: row.ada_urgent_days_override?.toString() ?? "",
    ada_created_on: row.ada_created_on ?? "",
    ada_sent_on: row.ada_sent_on ?? "",
    fda_attention_days_override: row.fda_attention_days_override?.toString() ?? "",
    fda_urgent_days_override: row.fda_urgent_days_override?.toString() ?? "",
    fda_created_on: row.fda_created_on ?? "",
    fda_sent_on: row.fda_sent_on ?? "",
  };
}

function applyLocalRow(row: DisbursementBoardRow, edit: EditState): DisbursementBoardRow {
  return {
    ...row,
    accounting_reference: edit.accounting_reference.trim() || null,
    roe: edit.roe ? Number(edit.roe) : null,
    pda_due_days_override: edit.pda_due_days_override ? Number(edit.pda_due_days_override) : null,
    pda_sent_on: edit.pda_sent_on || null,
    pda_status: edit.pda_not_required ? "NO" : edit.pda_sent_on ? "SI" : "PENDIENTE",
    ada_attention_days_override: edit.ada_attention_days_override ? Number(edit.ada_attention_days_override) : null,
    ada_urgent_days_override: edit.ada_urgent_days_override ? Number(edit.ada_urgent_days_override) : null,
    ada_created_on: edit.ada_created_on || null,
    ada_sent_on: edit.ada_sent_on || null,
    ada_status: edit.ada_created_on && edit.ada_sent_on ? "SI" : edit.ada_created_on ? "PENDIENTE" : "NO",
    fda_attention_days_override: edit.fda_attention_days_override ? Number(edit.fda_attention_days_override) : null,
    fda_urgent_days_override: edit.fda_urgent_days_override ? Number(edit.fda_urgent_days_override) : null,
    fda_created_on: edit.fda_created_on || null,
    fda_sent_on: edit.fda_sent_on || null,
  };
}

function pillClass(base: string) {
  return `inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${base}`;
}

function SortArrow({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <span className="text-slate-600">↕</span>;
  return direction === "asc" ? <ArrowUp size={12} className="text-slate-300" /> : <ArrowDown size={12} className="text-slate-300" />;
}

function tabClass(active: boolean) {
  return active
    ? "rounded px-3 py-1 text-sm bg-blue-600 text-white"
    : "rounded px-3 py-1 text-sm bg-slate-800 text-slate-300 hover:bg-slate-700";
}

function compactTabClass(active: boolean) {
  return active
    ? "rounded px-2 py-2 text-[11px] leading-none whitespace-nowrap bg-blue-600 text-white"
    : "rounded px-2 py-2 text-[11px] leading-none whitespace-nowrap bg-slate-800 text-slate-300 hover:bg-slate-700";
}

function operationLabel(value?: string | null) {
  const normalized = (value || "").trim().toUpperCase();
  if (normalized === "LOAD" || normalized === "LOADING") return "Carga";
  if (normalized === "DISCH" || normalized === "DISCHARGE" || normalized === "DISCHARGING") return "Descarga";
  if (normalized === "HOLDS") return "Bodegas";
  if (normalized === "HUSBANDRY") return "Husbandry";
  if (normalized === "HOLDS / HUSBANDRY" || normalized === "HUSBANDRY / HOLDS") return "Bodegas / Husbandry";
  if (normalized === "BUNKER_CALL") return "Bunker";
  if (!normalized) return "Otros";
  return value || "Otros";
}

function vesselSubline(row: DisbursementBoardRow) {
  const op = operationLabel(row.cargo_operation);
  const port = row.port || "TBC";
  const role = row.role || "-";
  return `${op} en ${port} | ${role}`;
}

function previewText(value?: string | null) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "-";
  return clean.length > 56 ? `${clean.slice(0, 56).trimEnd()}...` : clean;
}

export default function DisbursementBoardClient({ initialRows }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EditState>>({});
  const [workspaceNotes, setWorkspaceNotes] = useState<Record<string, Partial<Record<WorkspaceTool, string>>>>({});
  const [loadingWorkspaceId, setLoadingWorkspaceId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [sortState, setSortState] = useState<{ key: SortKey; direction: "asc" | "desc" } | null>(null);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const todayIso = now.toISOString().slice(0, 10);

  const pdaMonthDurations = rows
    .filter((row) => row.pda_sent_on)
    .filter((row) => {
      const sent = new Date(row.pda_sent_on as string);
      return !Number.isNaN(sent.getTime()) && sent.getMonth() === currentMonth && sent.getFullYear() === currentYear;
    })
    .map((row) => daysBetween(row.nomination_received_on, row.pda_sent_on))
    .filter((value): value is number => value !== null);

  const pdaYearDurations = rows
    .filter((row) => row.pda_sent_on)
    .filter((row) => {
      const sent = new Date(row.pda_sent_on as string);
      return !Number.isNaN(sent.getTime()) && sent.getFullYear() === currentYear;
    })
    .map((row) => daysBetween(row.nomination_received_on, row.pda_sent_on))
    .filter((value): value is number => value !== null);

  const avgPdaMonth = pdaMonthDurations.length
    ? Math.round((pdaMonthDurations.reduce((sum, value) => sum + value, 0) / pdaMonthDurations.length) * 10) / 10
    : null;
  const avgPdaYear = pdaYearDurations.length
    ? Math.round((pdaYearDurations.reduce((sum, value) => sum + value, 0) / pdaYearDurations.length) * 10) / 10
    : null;

  const pendingPdaRows = rows.filter((row) => getPdaBadge(row) === "PENDIENTE");
  const adaDescriptors = rows.map((row) => ({ row, state: describeAda(row) }));
  const fdaDescriptors = rows.map((row) => ({ row, state: describeFda(row) }));

  const pendingAdaRows = adaDescriptors.filter(({ state }) => state.label === "pendiente" || state.label === "Falta Enviar");
  const attentionAdaRows = adaDescriptors.filter(({ state }) => state.label === "atencion");
  const urgentAdaRows = adaDescriptors.filter(({ state }) => state.label === "urgente");
  const pendingFdaRows = fdaDescriptors.filter(({ state }) => state.label === "pendiente - en plazo" || state.label === "Falta Enviar");
  const attentionFdaRows = fdaDescriptors.filter(({ state }) => state.label === "atencion");
  const urgentFdaRows = fdaDescriptors.filter(({ state }) => state.label === "urgente");

  const mostOverduePdaDays = pendingPdaRows
    .map((row) => daysBetween(row.nomination_received_on, null))
    .filter((value): value is number => value !== null && value > 3)
    .reduce((max, value) => Math.max(max, value), 0);

  const mostOverdueAdaDays = [...attentionAdaRows, ...urgentAdaRows]
    .map(({ row }) => daysSinceSailed(row.departure_date))
    .filter((value): value is number => value !== null)
    .reduce((max, value) => Math.max(max, value), 0);

  const mostOverdueFdaDays = [...attentionFdaRows, ...urgentFdaRows]
    .map(({ row }) => daysSinceSailed(row.departure_date))
    .filter((value): value is number => value !== null)
    .reduce((max, value) => Math.max(max, value), 0);

  const filteredRows = rows.filter((row) => {
    if (filter === "pda_pending") return getPdaBadge(row) === "PENDIENTE";
    if (filter === "ada_pending") {
      const label = describeAda(row).label;
      return label === "pendiente" || label === "Falta Enviar";
    }
    if (filter === "ada_attention") return describeAda(row).label === "atencion";
    if (filter === "ada_urgent") return describeAda(row).label === "urgente";
    if (filter === "fda_pending") {
      const label = describeFda(row).label;
      return label === "pendiente - en plazo" || label === "Falta Enviar";
    }
    if (filter === "fda_attention") return describeFda(row).label === "atencion";
    if (filter === "fda_urgent") return describeFda(row).label === "urgente";
    return true;
  });

  const scopeRows = rows.filter((row) => {
    const appointed = row.nomination_received_on || "";
    const sailed = row.departure_date || "";
    if (scopeFilter === "sailed_today") return sailed === todayIso;
    if (scopeFilter === "appointed_today") return appointed === todayIso;
    if (scopeFilter === "appointed_month") {
      if (!appointed) return false;
      const d = new Date(appointed);
      return !Number.isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }
    if (scopeFilter === "appointed_year") {
      if (!appointed) return false;
      const d = new Date(appointed);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === currentYear;
    }
    return true;
  });

  const displayRows = filteredRows
    .filter((row) => {
      const appointed = row.nomination_received_on || "";
      const sailed = row.departure_date || "";
      if (scopeFilter === "sailed_today") return sailed === todayIso;
      if (scopeFilter === "appointed_today") return appointed === todayIso;
      if (scopeFilter === "appointed_month") {
        if (!appointed) return false;
        const d = new Date(appointed);
        return !Number.isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }
      if (scopeFilter === "appointed_year") {
        if (!appointed) return false;
        const d = new Date(appointed);
        return !Number.isNaN(d.getTime()) && d.getFullYear() === currentYear;
      }
      return true;
    })
    .sort((a, b) => {
      const effectiveSort = sortState ?? { key: "accounting_reference" as SortKey, direction: "desc" as const };
      const factor = effectiveSort.direction === "asc" ? 1 : -1;
      const getNumericRef = (value: string | null) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      };
      const compareText = (left: string | null | undefined, right: string | null | undefined) =>
        (left || "").localeCompare(right || "", undefined, { numeric: true, sensitivity: "base" });

      if (effectiveSort.key === "accounting_reference") {
        const leftNum = getNumericRef(a.accounting_reference);
        const rightNum = getNumericRef(b.accounting_reference);
        if (leftNum !== null && rightNum !== null) return (leftNum - rightNum) * factor;
        return compareText(a.accounting_reference, b.accounting_reference) * factor;
      }
      if (effectiveSort.key === "vessel_info") return compareText(vesselSubline(a), vesselSubline(b)) * factor;
      if (effectiveSort.key === "client_name") return compareText(a.client_name, b.client_name) * factor;
      return compareText(a.nomination_received_on, b.nomination_received_on) * factor;
    });

  const setSort = (key: SortKey) => {
    if (!sortState) {
      setSortState({ key, direction: key === "accounting_reference" ? "asc" : "asc" });
      return;
    }
    if (sortState.key === key) {
      if (sortState.direction === "asc") {
        setSortState({ key, direction: "desc" });
        return;
      }
      setSortState(null);
      return;
    }
    setSortState({ key, direction: "asc" });
  };

  const loadWorkspaceNotes = async (appointmentId: string) => {
    if (workspaceNotes[appointmentId]) return;
    setLoadingWorkspaceId(appointmentId);
    try {
      const results = await Promise.all(
        workspaceTools.map(async (tool) => {
          const res = await fetch(
            `/api/vesselmanager/workspace-notes?appointment_id=${encodeURIComponent(appointmentId)}&tool=${encodeURIComponent(tool)}`,
            { cache: "no-store" },
          );
          const json = (await res.json()) as { data?: { content?: string | null } | null };
          return [tool, json.data?.content || ""] as const;
        }),
      );
      setWorkspaceNotes((current) => ({
        ...current,
        [appointmentId]: Object.fromEntries(results),
      }));
    } catch {
      setWorkspaceNotes((current) => ({
        ...current,
        [appointmentId]: {},
      }));
    } finally {
      setLoadingWorkspaceId((current) => (current === appointmentId ? null : current));
    }
  };

  const openRow = (row: DisbursementBoardRow) => {
    const nextExpanded = expandedId === row.appointment_id ? null : row.appointment_id;
    setExpandedId(nextExpanded);
    setDrafts((current) => ({
      ...current,
      [row.appointment_id]: current[row.appointment_id] || toEditState(row),
    }));
    if (nextExpanded) {
      void loadWorkspaceNotes(row.appointment_id);
    }
  };

  const updateDraft = (appointmentId: string, patch: Partial<EditState>) => {
    setDrafts((current) => ({
      ...current,
      [appointmentId]: {
        ...(current[appointmentId] || toEditState(rows.find((row) => row.appointment_id === appointmentId)!)),
        ...patch,
      },
    }));
  };

  const saveRow = async (appointmentId: string) => {
    const draft = drafts[appointmentId];
    if (!draft) return;
    setSavingId(appointmentId);
    setError("");
    try {
      const res = await fetch(`/api/disbursementmanager/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to save accounting fields");
      setRows((current) => current.map((row) => (row.appointment_id === appointmentId ? applyLocalRow(row, draft) : row)));
      setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save accounting fields");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">D/A Manager</h1>
          <p className="mt-1 text-sm text-slate-300">Accounting board driven by the shared appointment record.</p>
        </div>
        <Link href="/dashboard" className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
          Back to Dashboard
        </Link>
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
          <div className="flex items-center gap-3 text-sky-100">
            <div className="text-base font-semibold tracking-wide text-sky-300">PDA</div>
            <div className="text-2xl font-semibold">{pendingPdaRows.length}</div>
            <div className="text-xs text-slate-400">Mas vencida {mostOverduePdaDays || 0} dias</div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setFilter("pda_pending")}
              className={compactTabClass(filter === "pda_pending")}
            >
              PDA Pendientes ({pendingPdaRows.length})
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
          <div className="flex items-center gap-3 text-orange-100">
            <div className="text-base font-semibold tracking-wide text-orange-300">ADA</div>
            <div className="text-2xl font-semibold">
              {pendingAdaRows.length + attentionAdaRows.length + urgentAdaRows.length}
            </div>
            <div className="text-xs text-slate-400">Mas vencida {mostOverdueAdaDays || 0} dias</div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setFilter("ada_pending")}
              className={compactTabClass(filter === "ada_pending")}
            >
              ADA Pendientes ({pendingAdaRows.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("ada_attention")}
              className={compactTabClass(filter === "ada_attention")}
            >
              ADA Atencion ({attentionAdaRows.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("ada_urgent")}
              className={compactTabClass(filter === "ada_urgent")}
            >
              ADA Urgentes ({urgentAdaRows.length})
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
          <div className="flex items-center gap-3 text-red-100">
            <div className="text-base font-semibold tracking-wide text-red-300">FDA</div>
            <div className="text-2xl font-semibold">
              {pendingFdaRows.length + attentionFdaRows.length + urgentFdaRows.length}
            </div>
            <div className="text-xs text-slate-400">Mas vencida {mostOverdueFdaDays || 0} dias</div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setFilter("fda_pending")}
              className={compactTabClass(filter === "fda_pending")}
            >
              FDA Pendientes ({pendingFdaRows.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("fda_attention")}
              className={compactTabClass(filter === "fda_attention")}
            >
              FDA Atencion ({attentionFdaRows.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("fda_urgent")}
              className={compactTabClass(filter === "fda_urgent")}
            >
              FDA Urgentes ({urgentFdaRows.length})
            </button>
          </div>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setScopeFilter("sailed_today")} className={tabClass(scopeFilter === "sailed_today")}>
          Zarpados del dia ({rows.filter((row) => (row.departure_date || "") === todayIso).length})
        </button>
        <button type="button" onClick={() => setScopeFilter("appointed_today")} className={tabClass(scopeFilter === "appointed_today")}>
          Nominaciones del Dia ({rows.filter((row) => (row.nomination_received_on || "") === todayIso).length})
        </button>
        <button type="button" onClick={() => setScopeFilter("appointed_month")} className={tabClass(scopeFilter === "appointed_month")}>
          Nominaciones del Mes ({rows.filter((row) => {
            if (!row.nomination_received_on) return false;
            const d = new Date(row.nomination_received_on);
            return !Number.isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
          }).length})
        </button>
        <button type="button" onClick={() => setScopeFilter("appointed_year")} className={tabClass(scopeFilter === "appointed_year")}>
          Nominaciones del Ano ({rows.filter((row) => {
            if (!row.nomination_received_on) return false;
            const d = new Date(row.nomination_received_on);
            return !Number.isNaN(d.getTime()) && d.getFullYear() === currentYear;
          }).length})
        </button>
        <button
          type="button"
          onClick={() => {
            setFilter("all");
            setScopeFilter("all");
            setSortState(null);
          }}
          className={tabClass(filter === "all" && scopeFilter === "all" && !sortState)}
        >
          Normal View
        </button>
      </div>

      {error ? <div className="mb-4 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/70">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-950/80 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-3">
                <button type="button" onClick={() => setSort("accounting_reference")} className="inline-flex items-center gap-1 hover:text-slate-200">
                  Numero
                  <SortArrow active={sortState ? sortState.key === "accounting_reference" : true} direction={sortState?.key === "accounting_reference" ? sortState.direction : "desc"} />
                </button>
              </th>
              <th className="px-3 py-3">
                <button type="button" onClick={() => setSort("vessel_info")} className="inline-flex items-center gap-1 hover:text-slate-200">
                  Vessel
                  <SortArrow active={sortState?.key === "vessel_info"} direction={sortState?.key === "vessel_info" ? sortState.direction : "asc"} />
                </button>
              </th>
              <th className="px-3 py-3">
                <button type="button" onClick={() => setSort("client_name")} className="inline-flex items-center gap-1 hover:text-slate-200">
                  Cliente
                  <SortArrow active={sortState?.key === "client_name"} direction={sortState?.key === "client_name" ? sortState.direction : "asc"} />
                </button>
              </th>
              <th className="px-3 py-3">
                <button type="button" onClick={() => setSort("nomination_received_on")} className="inline-flex items-center gap-1 hover:text-slate-200">
                  Appointed
                  <SortArrow active={sortState?.key === "nomination_received_on"} direction={sortState?.key === "nomination_received_on" ? sortState.direction : "asc"} />
                </button>
              </th>
              <th className="px-3 py-3">ROE</th>
              <th className="px-3 py-3">PDA</th>
              <th className="px-3 py-3">ADA</th>
              <th className="px-3 py-3">FDA</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const pdaState = describePda(row);
              const adaState = describeAda(row);
              const fdaState = describeFda(row);
              const isExpanded = expandedId === row.appointment_id;
              const draft = drafts[row.appointment_id] || toEditState(row);

              return (
                <Fragment key={row.appointment_id}>
                  <tr className="border-t border-slate-800 text-[12px] text-slate-200">
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => openRow(row)} className="text-left font-medium text-slate-100 hover:text-sky-300">
                        {row.accounting_reference || "-"}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-100">{row.vessel_name}</div>
                      <div className="text-[11px] text-slate-400">{vesselSubline(row)}</div>
                    </td>
                    <td className="px-3 py-2">{row.client_name || "-"}</td>
                    <td className="px-3 py-2">{formatDate(row.nomination_received_on)}</td>
                    <td className="px-3 py-2">{row.roe ?? "-"}</td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <span className={pillClass(pdaState.tone)}>
                          {pdaState.label === "OK" ? <Check size={12} className="text-emerald-300" /> : null}
                          {pdaState.label}
                        </span>
                        {pdaState.detail ? <div className="text-[11px] text-slate-400">{pdaState.detail}</div> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <span className={pillClass(adaState.tone)}>
                          {adaState.label === "OK" ? <Check size={12} className="text-emerald-300" /> : null}
                          {adaState.label}
                        </span>
                        {adaState.detail ? <div className="text-[11px] text-slate-400">{adaState.detail}</div> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <span className={pillClass(fdaState.tone)}>
                          {fdaState.label === "OK" ? <Check size={12} className="text-emerald-300" /> : null}
                          {fdaState.label}
                        </span>
                        {fdaState.detail ? <div className="text-[11px] text-slate-400">{fdaState.detail}</div> : null}
                      </div>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-t border-slate-800 bg-slate-950/40">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="mx-auto w-full max-w-[1640px] px-2">
                          <div className="grid gap-4 xl:grid-cols-[1.12fr_0.96fr_0.96fr_0.96fr]">
                          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
                            <div className="flex items-end justify-between gap-4">
                              <h3 className="text-sm font-semibold text-slate-100">Datos de la nominacion</h3>
                              <div className="flex items-end gap-3">
                                <label className="block">
                                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Numero</span>
                                  <input
                                    className="w-[110px] rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                                    value={draft.accounting_reference}
                                    onChange={(e) => updateDraft(row.appointment_id, { accounting_reference: e.target.value })}
                                    placeholder="Numero"
                                  />
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">ROE</span>
                                  <input
                                    className="w-[120px] rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                                    value={draft.roe}
                                    onChange={(e) => updateDraft(row.appointment_id, { roe: e.target.value })}
                                    placeholder="0000.00"
                                  />
                                </label>
                              </div>
                            </div>
                            <div className="mt-4 space-y-3 text-sm text-slate-300">
                              <div>
                                <span className="text-slate-400">Buque:</span>{" "}
                                <span className="text-slate-100">{row.vessel_name}</span>
                              </div>
                              <div>
                                <span className="text-slate-100">{formatOperationNarrative(row)}</span>
                              </div>
                              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                                <div>
                                  <span className="text-slate-400">Cliente:</span>{" "}
                                  <span className="text-slate-100">{row.client_name || "-"}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400">Operador:</span>{" "}
                                  <span className="text-slate-100">{row.operator_initials || "-"}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400">Nominado:</span>{" "}
                                  <span className="text-slate-100">{formatDate(row.nomination_received_on)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400">Zarpo:</span>{" "}
                                  <span className="text-slate-100">{formatDate(row.departure_date)}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
                            <div className="flex items-center gap-3">
                              <h3 className="text-sm font-semibold text-slate-100">PDA</h3>
                              <div className="text-[11px] text-slate-400">Vencimientos por defecto: Pendiente desde nominacion</div>
                            </div>
                            <label className="mt-3 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-300">
                              <span className="min-w-[88px]">PDA Sent</span>
                              <input
                                type="date"
                                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                                value={draft.pda_sent_on}
                                disabled={draft.pda_not_required}
                                onChange={(e) => updateDraft(row.appointment_id, { pda_sent_on: e.target.value })}
                              />
                            </label>
                            <label className="mt-3 flex items-center gap-2 text-sm text-slate-200">
                              <input
                                type="checkbox"
                                checked={draft.pda_not_required}
                                onChange={(e) =>
                                  updateDraft(row.appointment_id, {
                                    pda_not_required: e.target.checked,
                                    pda_sent_on: e.target.checked ? "" : draft.pda_sent_on,
                                  })
                                }
                              />
                              PDA not needed
                            </label>
                          </div>

                          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
                            <div className="flex items-center gap-3">
                              <h3 className="text-sm font-semibold text-slate-100">ADA</h3>
                              <div className="text-[11px] text-slate-400">Vencimientos por defecto: Atencion 6 dias | Urgente 11 dias</div>
                            </div>
                            <label className="mt-3 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-300">
                              <span className="min-w-[88px]">ADA Created</span>
                              <input
                                type="date"
                                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                                value={draft.ada_created_on}
                                onChange={(e) => updateDraft(row.appointment_id, { ada_created_on: e.target.value })}
                              />
                            </label>
                            <label className="mt-3 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-300">
                              <span className="min-w-[88px]">ADA Sent</span>
                              <input
                                type="date"
                                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                                value={draft.ada_sent_on}
                                onChange={(e) => updateDraft(row.appointment_id, { ada_sent_on: e.target.value })}
                              />
                            </label>
                            <label className="mt-3 block text-xs font-medium normal-case tracking-normal text-slate-400">
                              Modificacion Plazos para esta Nominacion
                              <div className="mt-1 grid grid-cols-2 gap-2">
                                <input
                                  className="rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                                  value={draft.ada_attention_days_override}
                                  onChange={(e) => updateDraft(row.appointment_id, { ada_attention_days_override: e.target.value })}
                                  placeholder="Dias Atencion"
                                />
                                <input
                                  className="rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                                  value={draft.ada_urgent_days_override}
                                  onChange={(e) => updateDraft(row.appointment_id, { ada_urgent_days_override: e.target.value })}
                                  placeholder="Dias Urgente"
                                />
                              </div>
                            </label>
                          </div>

                          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
                            <div className="flex items-center gap-3">
                              <h3 className="text-sm font-semibold text-slate-100">FDA</h3>
                              <div className="text-[11px] text-slate-400">Vencimientos por defecto: Atencion 30 dias | Urgente 45 dias</div>
                            </div>
                            <label className="mt-3 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-300">
                              <span className="min-w-[88px]">FDA Created</span>
                              <input
                                type="date"
                                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                                value={draft.fda_created_on}
                                onChange={(e) => updateDraft(row.appointment_id, { fda_created_on: e.target.value })}
                              />
                            </label>
                            <label className="mt-3 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-300">
                              <span className="min-w-[88px]">FDA Sent</span>
                              <input
                                type="date"
                                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                                value={draft.fda_sent_on}
                                onChange={(e) => updateDraft(row.appointment_id, { fda_sent_on: e.target.value })}
                              />
                            </label>
                            <label className="mt-3 block text-xs font-medium normal-case tracking-normal text-slate-400">
                              Modificacion Plazos para esta Nominacion
                              <div className="mt-1 grid grid-cols-2 gap-2">
                                <input
                                  className="rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                                  value={draft.fda_attention_days_override}
                                  onChange={(e) => updateDraft(row.appointment_id, { fda_attention_days_override: e.target.value })}
                                  placeholder="Dias Atencion"
                                />
                                <input
                                  className="rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                                  value={draft.fda_urgent_days_override}
                                  onChange={(e) => updateDraft(row.appointment_id, { fda_urgent_days_override: e.target.value })}
                                  placeholder="Dias Urgente"
                                />
                              </div>
                            </label>
                          </div>
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-2">
                          <Link
                            href={`/vesselmanager/appointments/${row.appointment_id}/view?return_to=${encodeURIComponent("/disbursementmanager")}`}
                            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800"
                          >
                            View Appointment Summary for Disbursement
                          </Link>
                          <button
                            type="button"
                            disabled={savingId === row.appointment_id}
                            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                            onClick={() => saveRow(row.appointment_id)}
                          >
                            {savingId === row.appointment_id ? "Saving..." : "Save Accounting"}
                          </button>
                        </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {!displayRows.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">No accounting rows found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
