import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import VesselBoard from "./components/vessel-board";
import VesselManagerBrand from "./components/vesselmanager-brand";
import type { Appointment } from "@/lib/vesselmanager/types";

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
  if (!res.ok) {
    return { appointments: [], unauthorized: false };
  }

  const json = (await res.json()) as { data?: Appointment[] };
  return { appointments: json.data ?? [], unauthorized: false };
}

export default async function VesselManagerPage() {
  const { appointments, unauthorized } = await fetchAppointmentsServer();
  if (unauthorized) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">VesselManager</h1>
            <p className="mt-1 text-sm text-slate-300">Appointments Board</p>
          </div>
          <div className="hidden flex-1 justify-center md:flex">
            <VesselManagerBrand />
          </div>
          <Link
            href="/vesselmanager/appointments/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Create Appointment
          </Link>
        </div>
      </div>

      <VesselBoard appointments={appointments} />
    </main>
  );
}
