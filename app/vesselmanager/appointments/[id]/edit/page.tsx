import Link from "next/link";
import { headers } from "next/headers";
import AppointmentForm from "@/app/vesselmanager/components/appointment-form";
import AppointmentDocumentsPanel from "@/app/vesselmanager/components/appointment-documents-panel";
import VesselManagerBrand from "@/app/vesselmanager/components/vesselmanager-brand";
import type { Appointment, AppointmentRecipient, AppointmentTimelineRow, EtaNoticeSettings } from "@/lib/vesselmanager/types";

async function fetchAppointment(id: string): Promise<{
  appointment?: Appointment;
  recipients?: AppointmentRecipient[];
  timeline?: AppointmentTimelineRow[];
  eta_notice?: EtaNoticeSettings | null;
  error?: string;
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
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: json.error || "Failed to load appointment" };
  }

  const json = (await res.json()) as {
    data?: {
      appointment?: Appointment;
      recipients?: AppointmentRecipient[];
      timeline?: AppointmentTimelineRow[];
      eta_notice?: EtaNoticeSettings | null;
    };
  };

  return {
    appointment: json.data?.appointment,
    recipients: json.data?.recipients || [],
    timeline: json.data?.timeline || [],
    eta_notice: json.data?.eta_notice || null,
  };
}

export default async function EditAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ return_to?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const returnTo =
    resolvedSearchParams?.return_to && resolvedSearchParams.return_to.startsWith("/") && !resolvedSearchParams.return_to.startsWith("//")
      ? resolvedSearchParams.return_to
      : "/vesselmanager";
  const { appointment, recipients, timeline, eta_notice, error } = await fetchAppointment(id);
  const serviceChecklistAta = timeline?.find((row) => row.event_type === "COMPLETE_OPS")?.ata || null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Edit Appointment</h1>
          <p className="mt-1 text-sm text-slate-300">Draft edit flow for operational updates.</p>
        </div>
        <div className="hidden flex-1 justify-center md:flex">
          <VesselManagerBrand />
        </div>
        <Link href={returnTo} className="text-sm text-blue-400 hover:underline">
          Back to Board
        </Link>
      </div>

      {error || !appointment ? (
        <div className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">
          {error || "Appointment not found."}
        </div>
      ) : (
        <div className="space-y-5">
          <AppointmentForm
            mode="edit"
            appointmentId={id}
            initialAppointment={appointment}
            initialRecipients={recipients}
            initialServiceChecklistAta={serviceChecklistAta}
            initialEtaNotice={eta_notice || undefined}
            returnTo={returnTo}
          />
          <AppointmentDocumentsPanel appointmentId={id} />
        </div>
      )}
    </main>
  );
}
