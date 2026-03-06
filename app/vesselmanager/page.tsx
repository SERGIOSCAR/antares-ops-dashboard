import { headers } from "next/headers";
import VesselBoard from "./components/vessel-board";
import type { Appointment } from "@/lib/vesselmanager/types";

async function fetchAppointmentsServer(): Promise<Appointment[]> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "http";

  if (!host) return [];

  const baseUrl = `${proto}://${host}`;
  const res = await fetch(`${baseUrl}/api/vesselmanager/appointments`, {
    cache: "no-store",
  });

  if (!res.ok) {
    return [];
  }

  const json = (await res.json()) as { data?: Appointment[] };
  return json.data ?? [];
}

export default async function VesselManagerPage() {
  const appointments = await fetchAppointmentsServer();

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">VesselManager</h1>
        <p className="mt-1 text-sm text-slate-300">Appointments Board</p>
      </div>

      <VesselBoard appointments={appointments} />
    </main>
  );
}
