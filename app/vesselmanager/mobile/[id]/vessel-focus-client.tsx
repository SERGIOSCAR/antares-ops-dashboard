"use client";

import { useMemo, useState } from "react";
import type { Appointment, AppointmentTimelineRow } from "@/lib/vesselmanager/types";

type MilestoneCode = "ETA_OUTER_ROADS" | "EPOB" | "ETB" | "ETD";
type TimelineRowMap = Partial<Record<MilestoneCode, AppointmentTimelineRow>>;

const milestoneOrder: Array<{ code: MilestoneCode; label: string }> = [
  { code: "ETA_OUTER_ROADS", label: "ETA" },
  { code: "EPOB", label: "EPOB" },
  { code: "ETB", label: "ETB" },
  { code: "ETD", label: "ETD" },
];

function toTimelineMap(rows: AppointmentTimelineRow[]) {
  return Object.fromEntries(rows.map((row) => [row.event_type, row])) as TimelineRowMap;
}

function toInputValue(row?: AppointmentTimelineRow) {
  const source = row?.ata || row?.eta || "";
  if (!source) return "";
  const dt = new Date(source);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function formatDisplay(row?: AppointmentTimelineRow) {
  const source = row?.ata || row?.eta || "";
  if (!source) return "--";
  const dt = new Date(source);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleString();
  }
  if (row?.event_date && row?.event_time_text) {
    return `${row.event_date} ${row.event_time_text}`;
  }
  return source;
}

function buildReportText(args: {
  vesselName: string;
  port: string | null;
  terminal: string | null;
  lineUp: string;
  runningSof: string;
}) {
  const bodyLines = [
    "Daily Prospect Report",
    `${args.vesselName} | ${args.port || "-"} | ${args.terminal || "-"}`,
    "",
    "Line Up",
    args.lineUp || "-",
    "",
    "Running SOF",
    args.runningSof || "-",
  ];
  return bodyLines.join("\n");
}

export default function VesselFocusClient({
  appointment,
  initialTimeline,
}: {
  appointment: Appointment;
  initialTimeline: AppointmentTimelineRow[];
}) {
  const initialMap = useMemo(() => toTimelineMap(initialTimeline), [initialTimeline]);
  const [timelineByCode, setTimelineByCode] = useState<TimelineRowMap>(initialMap);
  const [inputByCode, setInputByCode] = useState<Record<MilestoneCode, string>>({
    ETA_OUTER_ROADS: toInputValue(initialMap.ETA_OUTER_ROADS),
    EPOB: toInputValue(initialMap.EPOB),
    ETB: toInputValue(initialMap.ETB),
    ETD: toInputValue(initialMap.ETD),
  });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [reportText, setReportText] = useState("");
  const [mailtoHref, setMailtoHref] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportStatus, setReportStatus] = useState("");

  const summary = milestoneOrder.map(({ code, label }) => ({
    label,
    value: formatDisplay(timelineByCode[code]),
  }));

  const saveMilestones = async () => {
    setSaving(true);
    setSaveMessage("");

    try {
      for (const { code } of milestoneOrder) {
        const inputValue = inputByCode[code];
        const existing = timelineByCode[code];
        const useAta = !!existing?.ata && !existing?.eta;
        const eventDate = inputValue ? inputValue.slice(0, 10) : null;
        const eventTimeText = inputValue ? inputValue.slice(11, 16) : null;
        const isoValue = inputValue ? `${inputValue}:00` : null;

        const res = await fetch("/api/vesselmanager/timeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appointment_id: appointment.id,
            event_type: code,
            eta: useAta ? null : isoValue,
            ata: useAta ? isoValue : null,
            event_date: eventDate,
            event_time_text: eventTimeText,
          }),
        });

        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(json.error || `Failed to save ${code}`);
        }

        setTimelineByCode((prev) => ({
          ...prev,
          [code]: {
            id: prev[code]?.id || `${appointment.id}-${code}`,
            appointment_id: appointment.id,
            event_type: code,
            eta: useAta ? null : isoValue,
            ata: useAta ? isoValue : null,
            event_date: eventDate,
            event_time_text: eventTimeText,
          },
        }));
      }

      setSaveMessage("Milestones updated.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Failed to save milestones.");
    } finally {
      setSaving(false);
    }
  };

  const generateReport = async () => {
    setReportBusy(true);
    setReportStatus("");

    try {
      const res = await fetch(`/api/vesselmanager/dpr-snapshot?appointment_id=${encodeURIComponent(appointment.id)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        data?: {
          lineup?: string;
          runningSof?: string;
        };
        error?: string;
      };

      if (!res.ok || !json.data) {
        throw new Error(json.error || "Failed to fetch Daily Report data");
      }

      const nextReport = buildReportText({
        vesselName: appointment.vessel_name,
        port: appointment.port,
        terminal: appointment.terminal,
        lineUp: String(json.data.lineup || "").trim(),
        runningSof: String(json.data.runningSof || "").trim(),
      });

      setReportText(nextReport);
      setMailtoHref(
        `mailto:?subject=${encodeURIComponent("Daily Prospect Report")}&body=${encodeURIComponent(nextReport)}`,
      );
      setReportStatus("Daily Report ready.");
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : "Failed to generate Daily Report.");
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
        <div className="text-sm text-slate-300">
          {[appointment.port, appointment.terminal].filter(Boolean).join(" / ") || "Port pending"}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {summary.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-700 bg-slate-900 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{item.label}</div>
              <div className="mt-1 text-sm font-semibold text-slate-100">{item.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
        <h2 className="text-lg font-semibold text-slate-100">Milestone Editor</h2>
        <p className="mt-1 text-sm text-slate-400">
          Large touch inputs for ETA, EPOB, ETB and ETD. Save updates with one tap.
        </p>
        <div className="mt-4 space-y-4">
          {milestoneOrder.map(({ code, label }) => (
            <label key={code} className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">{label}</span>
              <input
                type="datetime-local"
                value={inputByCode[code]}
                onChange={(e) =>
                  setInputByCode((prev) => ({
                    ...prev,
                    [code]: e.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-4 text-base text-slate-100"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            void saveMilestones();
          }}
          disabled={saving}
          className="mt-5 w-full rounded-xl bg-cyan-500 px-4 py-4 text-base font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Milestones"}
        </button>
        {saveMessage ? <p className="mt-3 text-sm text-slate-300">{saveMessage}</p> : null}
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
        <h2 className="text-lg font-semibold text-slate-100">Daily Report</h2>
        <p className="mt-1 text-sm text-slate-400">
          Fetch Line-Up and Running SOF, build report text, then open the device mail app through a mailto link.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              void generateReport();
            }}
            disabled={reportBusy}
            className="w-full rounded-xl bg-blue-600 px-4 py-4 text-base font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {reportBusy ? "Generating..." : "Generate Daily Report"}
          </button>
          <a
            href={mailtoHref || undefined}
            className={`w-full rounded-xl px-4 py-4 text-center text-base font-semibold ${
              mailtoHref
                ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                : "pointer-events-none bg-slate-700 text-slate-400"
            }`}
          >
            Open Outlook
          </a>
        </div>
        {reportStatus ? <p className="mt-3 text-sm text-slate-300">{reportStatus}</p> : null}
        <textarea
          readOnly
          value={reportText}
          rows={12}
          className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-100"
          placeholder="Generated report text will appear here."
        />
      </section>
    </div>
  );
}
