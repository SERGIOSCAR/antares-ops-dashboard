import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Appointment, AppointmentTimelineRow } from "@/lib/vesselmanager/types";
import VesselFocusClient from "./vessel-focus-client";

async function fetchAppointmentServer(id: string): Promise<{
  appointment?: Appointment;
  timeline?: AppointmentTimelineRow[];
  error?: string;
  unauthorized?: boolean;
}> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "http";
  const cookie = h.get("cookie");

  if (!host) return { error: "Missing host" };

  const res = await fetch(`${proto}://${host}/api/vesselmanager/appointments/${id}`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });

  if (res.status === 401) {
    return { unauthorized: true };
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: json.error || "Failed to load appointment" };
  }

  const json = (await res.json()) as {
    data?: { appointment?: Appointment; timeline?: AppointmentTimelineRow[] };
  };

  return {
    appointment: json.data?.appointment,
    timeline: json.data?.timeline || [],
  };
}

export default async function VesselManagerMobileFocusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { appointment, timeline, error, unauthorized } = await fetchAppointmentServer(id);
  if (unauthorized) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Vessel Focus</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-100">
            {appointment?.vessel_name || "Mobile Vessel Focus"}
          </h1>
        </div>
        <Link
          href="/vesselmanager/mobile"
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800"
        >
          Back
        </Link>
      </div>

      {error || !appointment ? (
        <div className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">
          {error || "Appointment not found."}
        </div>
      ) : (
        <VesselFocusClient appointment={appointment} initialTimeline={timeline || []} />
      )}
    </main>
  );
}
