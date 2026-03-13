import Link from "next/link";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import type { Appointment, AppointmentDocument, AppointmentRecipient, AppointmentTimelineRow, EtaNoticeSettings } from "@/lib/vesselmanager/types";

type NoteTool = "husbandry_notes" | "accounting_notes" | "commercial_notes";

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

function preview(value?: string | null) {
  return String(value || "").trim() || "-";
}

function operationNarrative(appointment: Appointment) {
  const opMap: Record<string, string> = {
    LOAD: "Load",
    DISCH: "Discharge",
    DISCHARGE: "Discharge",
    BUNKER_CALL: "Bunker",
    REPAIRS: "Repairs",
    OTHERS: "Others",
  };
  const operation = opMap[String(appointment.cargo_operation || "").toUpperCase()] || appointment.cargo_operation || "-";
  const cargo = appointment.cargo_grade || "-";
  const qty = appointment.cargo_qty ? `${appointment.cargo_qty}MT` : "-";
  return `${operation} ${cargo} ${qty}`.replace(/\s+/g, " ").trim();
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

function diffDays(from?: string | null, to?: string | null) {
  if (!from || !to) return null;
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function withDetail(value: string | null | undefined, detail?: string | null) {
  const base = formatDate(value);
  if (base === "-" || !detail) return base;
  return `${base} (${detail})`;
}

export default async function AppointmentAccountingViewPage({
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
      : "/disbursementmanager";

  const { appointment, recipients, timeline, error } = await fetchAppointment(id);
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const notesResult = await supabase
    .from("appointment_workspace_notes")
    .select("tool,content,updated_at")
    .eq("appointment_id", id)
    .in("tool", ["husbandry_notes", "accounting_notes", "commercial_notes"]);

  const notesMap = new Map<NoteTool, { content: string; updated_at: string | null }>();
  (notesResult.data || []).forEach((row) => {
    notesMap.set(row.tool as NoteTool, {
      content: row.content || "",
      updated_at: row.updated_at || null,
    });
  });

  const documentsResult = await supabase
    .from("appointment_documents")
    .select("id,appointment_id,document_type,file_name,storage_bucket,storage_path,mime_type,file_size,uploaded_by,created_at")
    .eq("appointment_id", id)
    .order("created_at", { ascending: false });

  const documents = ((documentsResult.data || []) as AppointmentDocument[]).map((doc) => ({
    ...doc,
    download_url: `/api/vesselmanager/documents/${doc.id}/download`,
  }));

  let subAgentName = "-";
  if (appointment?.sub_agent_id) {
    const subAgent = await supabase.from("sub_agents").select("name").eq("id", appointment.sub_agent_id).maybeSingle();
    subAgentName = subAgent.data?.name || "-";
  }

  const groupedDocuments = {
    SOF: documents.filter((doc) => doc.document_type === "SOF"),
    SHIP_PART: documents.filter((doc) => doc.document_type === "SHIP_PART"),
    ITC: documents.filter((doc) => doc.document_type === "ITC"),
    OTHER_DOX: documents.filter((doc) => doc.document_type === "OTHER_DOX"),
  };

  if (error || !appointment) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">
          {error || "Appointment not found."}
        </div>
      </main>
    );
  }

  const sailedDate = timeline?.find((row) => row.event_type === "ETD")?.ata || timeline?.find((row) => row.event_type === "ETD")?.eta || null;
  const pdaDays = diffDays(appointment.nomination_received_on, appointment.pda_sent_on);
  const adaCreatedDays = diffDays(sailedDate, appointment.ada_created_on);
  const adaSentDays = diffDays(appointment.ada_created_on, appointment.ada_sent_on);
  const fdaCreatedDays = diffDays(sailedDate, appointment.fda_created_on);
  const fdaSentFromCreatedDays = diffDays(appointment.fda_created_on, appointment.fda_sent_on);
  const fdaSentFromSailedDays = diffDays(sailedDate, appointment.fda_sent_on);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Appointment View Page for Accounting</h1>
          <p className="mt-1 text-sm text-slate-300">Read-only full summary of the call, notes and supporting documents.</p>
        </div>
        <Link href={returnTo} className="text-sm text-blue-400 hover:underline">
          Back
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-100">Appointment Summary</h2>
            <div className="rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-slate-200">
              Account id: <span className="text-slate-100">{appointment.accounting_reference || "-"}</span>
            </div>
          </div>
            <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
              <div>Vessel: <span className="text-slate-100">{appointment.vessel_name}</span></div>
              <div>Status: <span className="text-slate-100">{appointment.status}</span></div>
              <div>Appointed by: <span className="text-slate-100">{appointment.appointed_by || "-"}</span></div>
            <div>Role: <span className="text-slate-100">{appointment.role || "-"}</span></div>
            <div>Port: <span className="text-slate-100">{appointment.port || "-"}</span></div>
            <div>Terminal: <span className="text-slate-100">{appointment.terminal || "-"}</span></div>
              <div className="md:col-span-2">Operation / Cargo / Qty: <span className="text-slate-100">{operationNarrative(appointment)}</span></div>
              <div>Charterer&apos;s Agent: <span className="text-slate-100">{appointment.charterer_agent || "-"}</span></div>
              <div>Sub-Agent: <span className="text-slate-100">{subAgentName}</span></div>
              <div>Appointment Thanks To: <span className="text-slate-100">{appointment.thanks_to || "-"}</span></div>
            </div>
          </section>

        <section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
          <h2 className="mb-4 text-lg font-semibold text-slate-100">Accounting Milestones</h2>
          <div className="space-y-2 text-sm text-slate-300">
            <div>Appointment date: <span className="text-slate-100">{formatDate(appointment.nomination_received_on)}</span></div>
            <div>
              PDA Sent:{" "}
              <span className="text-slate-100">
                {appointment.pda_not_required ? "N/A" : withDetail(appointment.pda_sent_on, pdaDays === null ? null : `${pdaDays} dias desde nominacion`)}
              </span>
            </div>
            <div>Sailing Date: <span className="text-slate-100">{formatDate(sailedDate)}</span></div>
            <div>ROE: <span className="text-slate-100">{appointment.roe ?? "-"}</span></div>
            <div>ADA Created: <span className="text-slate-100">{withDetail(appointment.ada_created_on, adaCreatedDays === null ? null : `${adaCreatedDays} dias desde zarpe`)}</span></div>
            <div>ADA Sent: <span className="text-slate-100">{withDetail(appointment.ada_sent_on, adaSentDays === null ? null : `${adaSentDays} dias desde creada`)}</span></div>
            <div>FDA Created: <span className="text-slate-100">{withDetail(appointment.fda_created_on, fdaCreatedDays === null ? null : `${fdaCreatedDays} dias desde zarpe`)}</span></div>
            <div>
              FDA Sent:{" "}
              <span className="text-slate-100">
                {withDetail(
                  appointment.fda_sent_on,
                  fdaSentFromCreatedDays === null && fdaSentFromSailedDays === null
                    ? null
                    : [fdaSentFromCreatedDays !== null ? `${fdaSentFromCreatedDays} dias desde creada` : null, fdaSentFromSailedDays !== null ? `${fdaSentFromSailedDays} dias desde zarpe` : null]
                        .filter(Boolean)
                        .join(" | "),
                )}
              </span>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-slate-700 bg-slate-800 p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-100">Operational Notes</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-100">Husbandry Notes</div>
            <div className="whitespace-pre-wrap text-sm text-slate-300">{preview(notesMap.get("husbandry_notes")?.content)}</div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-100">Accounting Notes</div>
            <div className="whitespace-pre-wrap text-sm text-slate-300">{preview(notesMap.get("accounting_notes")?.content)}</div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-100">Commercial Notes</div>
            <div className="whitespace-pre-wrap text-sm text-slate-300">{preview(notesMap.get("commercial_notes")?.content)}</div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-100">Other Appointment</div>
            <div className="whitespace-pre-wrap text-sm text-slate-300">{preview(appointment.other_agents)}</div>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-700 bg-slate-800 p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-100">Supporting Documents</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { key: "SOF", label: "SOF", rows: groupedDocuments.SOF },
            { key: "SHIP_PART", label: "Ship's Particulars", rows: groupedDocuments.SHIP_PART },
            { key: "ITC", label: "ITC", rows: groupedDocuments.ITC },
            { key: "OTHER_DOX", label: "Other Dox", rows: groupedDocuments.OTHER_DOX },
          ].map((group) => (
            <div key={group.key} className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
              <div className="mb-3 text-sm font-semibold text-slate-100">{group.label}</div>
              {group.rows.length ? (
                <div className="space-y-2">
                  {group.rows.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-3 rounded border border-slate-700 bg-slate-950/60 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-slate-100">{doc.file_name}</div>
                        <div className="text-xs text-slate-400">{new Date(doc.created_at).toLocaleString()}</div>
                      </div>
                      <a
                        href={(doc as AppointmentDocument & { download_url: string }).download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-100 hover:bg-slate-800"
                      >
                        View
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-400">No files uploaded.</div>
              )}
            </div>
          ))}
        </div>
      </section>

    </main>
  );
}
