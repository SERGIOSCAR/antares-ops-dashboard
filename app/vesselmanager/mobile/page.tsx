import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Appointment } from "@/lib/vesselmanager/types";
import MobileBoardClient from "./mobile-board-client";

async function fetchAppointmentsServer(): Promise<{
  appointments: Appointment[];
  unauthorized: boolean;
}> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "http";
  const cookie = h.get("cookie");

  if (!host) return { appointments: [], unauthorized: false };

  const baseUrl = `${proto}://${host}`;
  const res = await fetch(`${baseUrl}/api/vesselmanager/appointments`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });

  if (res.status === 401) {
    return { appointments: [], unauthorized: true };
  }
  if (!res.ok) return { appointments: [], unauthorized: false };

  const json = (await res.json()) as { data?: Appointment[] };
  return { appointments: json.data ?? [], unauthorized: false };
}

export default async function VesselManagerMobilePage() {
  const { appointments, unauthorized } = await fetchAppointmentsServer();
  if (unauthorized) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
      <div className="mb-5 rounded-2xl border border-cyan-500/40 bg-cyan-950/30 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
              Vessel Manager Mobile
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Phone access for Vessel Focus</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Use quick cards to jump into a vessel, or scroll and pinch-zoom the board below without changing the desktop layout.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800"
            >
              Dashboard
            </Link>
            <Link
              href="/vesselmanager"
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-white"
            >
              Desktop Board
            </Link>
          </div>
        </div>
      </div>

      <MobileBoardClient appointments={appointments} />
    </main>
  );
}
