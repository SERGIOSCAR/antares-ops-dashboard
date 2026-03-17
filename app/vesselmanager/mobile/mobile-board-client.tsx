"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Appointment, AppointmentTimelineRow } from "@/lib/vesselmanager/types";

type MilestoneCode = "ETA_OUTER_ROADS" | "EPOB" | "ETB" | "ETD";
type AppointmentDetail = {
  appointment?: Appointment;
  timeline?: AppointmentTimelineRow[];
};

const milestoneOrder: MilestoneCode[] = ["ETA_OUTER_ROADS", "EPOB", "ETB", "ETD"];

function timelineMap(rows: AppointmentTimelineRow[] | undefined) {
  return Object.fromEntries((rows || []).map((row) => [row.event_type, row])) as Partial<
    Record<MilestoneCode, AppointmentTimelineRow>
  >;
}

function formatMilestone(row?: AppointmentTimelineRow) {
  const source = row?.ata || row?.eta || "";
  if (!source) return "--";
  const dt = new Date(source);
  if (!Number.isNaN(dt.getTime())) {
    const month = dt.toLocaleString("en-US", { month: "short" });
    const day = String(dt.getDate()).padStart(2, "0");
    const hour = String(dt.getHours()).padStart(2, "0");
    const minute = String(dt.getMinutes()).padStart(2, "0");
    return `${day} ${month} ${hour}:${minute}`;
  }
  if (row?.event_date && row?.event_time_text) {
    const [, month, day] = row.event_date.split("-");
    return `${day}/${month} ${row.event_time_text}`;
  }
  return source;
}

function isOpenAppointment(appointment: Appointment) {
  return appointment.status !== "CLOSED" && appointment.status !== "SAILED";
}

export default function MobileBoardClient({ appointments }: { appointments: Appointment[] }) {
  const router = useRouter();
  const [detailById, setDetailById] = useState<Record<string, AppointmentDetail>>({});
  const [loadingById, setLoadingById] = useState<Record<string, boolean>>({});

  const openAppointments = useMemo(
    () => appointments.filter(isOpenAppointment).sort((a, b) => a.vessel_name.localeCompare(b.vessel_name)),
    [appointments],
  );

  useEffect(() => {
    let active = true;

    const load = async (appointmentId: string) => {
      setLoadingById((prev) => ({ ...prev, [appointmentId]: true }));
      try {
        const res = await fetch(`/api/vesselmanager/appointments/${appointmentId}`, { cache: "no-store" });
        const json = (await res.json()) as {
          data?: { appointment?: Appointment; timeline?: AppointmentTimelineRow[] };
        };
        if (!active || !res.ok || !json.data) return;
        setDetailById((prev) => ({
          ...prev,
          [appointmentId]: {
            appointment: json.data?.appointment,
            timeline: json.data?.timeline,
          },
        }));
      } finally {
        if (active) {
          setLoadingById((prev) => ({ ...prev, [appointmentId]: false }));
        }
      }
    };

    openAppointments.forEach((appointment) => {
      if (!detailById[appointment.id] && !loadingById[appointment.id]) {
        void load(appointment.id);
      }
    });

    return () => {
      active = false;
    };
  }, [detailById, loadingById, openAppointments]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Quick Vessel Access</h2>
          <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
            {openAppointments.length} active
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {openAppointments.map((appointment) => {
            const timeline = timelineMap(detailById[appointment.id]?.timeline);
            return (
              <button
                key={appointment.id}
                type="button"
                onClick={() => router.push(`/vesselmanager/mobile/${appointment.id}`)}
                className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-left shadow-sm transition hover:border-cyan-500/50 hover:bg-slate-950"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-100">{appointment.vessel_name}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {[appointment.port, appointment.terminal].filter(Boolean).join(" / ") || "Port pending"}
                    </div>
                  </div>
                  <div className="rounded-full border border-cyan-500/40 px-2 py-1 text-[11px] font-medium text-cyan-200">
                    Focus
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  {milestoneOrder.map((code) => (
                    <div key={code} className="rounded-xl border border-slate-700 bg-slate-800/70 p-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">
                        {code === "ETA_OUTER_ROADS" ? "ETA" : code}
                      </div>
                      <div className="mt-1 font-medium text-slate-100">{formatMilestone(timeline[code])}</div>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-100">Board View</h2>
          <p className="mt-1 text-sm text-slate-400">
            Horizontal scroll is enabled and browser pinch-zoom remains available on mobile devices.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="min-w-[1010px] table-fixed text-xs text-slate-200">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="w-[320px] px-2 py-3 text-left">Vessel</th>
                <th className="w-[140px] px-2 py-3 text-center">ETA EOSP</th>
                <th className="w-[140px] px-2 py-3 text-center">EPOB</th>
                <th className="w-[140px] px-2 py-3 text-center">ETB</th>
                <th className="w-[140px] px-2 py-3 text-center">ETD</th>
                <th className="w-[130px] px-2 py-3 text-center">Open Focus</th>
              </tr>
            </thead>
            <tbody>
              {openAppointments.map((appointment) => {
                const timeline = timelineMap(detailById[appointment.id]?.timeline);
                return (
                  <tr key={appointment.id} className="border-t border-slate-700 bg-slate-800">
                    <td className="px-2 py-3">
                      <div className="font-medium text-slate-100">{appointment.vessel_name}</div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {[appointment.port, appointment.terminal].filter(Boolean).join(" / ")}
                      </div>
                    </td>
                    {milestoneOrder.map((code) => (
                      <td key={code} className="px-2 py-3 text-center">
                        <div className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-[11px]">
                          {loadingById[appointment.id] && !detailById[appointment.id]
                            ? "Loading..."
                            : formatMilestone(timeline[code])}
                        </div>
                      </td>
                    ))}
                    <td className="px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => router.push(`/vesselmanager/mobile/${appointment.id}`)}
                        className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
              {openAppointments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">
                    No active appointments found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
