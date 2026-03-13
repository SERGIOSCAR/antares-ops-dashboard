import Link from "next/link";
import AppointmentForm from "@/app/vesselmanager/components/appointment-form";
import VesselManagerBrand from "@/app/vesselmanager/components/vesselmanager-brand";

export default function CreateAppointmentPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Create Appointment</h1>
          <p className="mt-1 text-sm text-slate-300">Draft create flow for operators and accredited users.</p>
        </div>
        <div className="hidden flex-1 justify-center md:flex">
          <VesselManagerBrand />
        </div>
        <Link href="/vesselmanager" className="text-sm text-blue-400 hover:underline">
          Back to Board
        </Link>
      </div>

      <AppointmentForm mode="create" returnTo="/vesselmanager" />
    </main>
  );
}
