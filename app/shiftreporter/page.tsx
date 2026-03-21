import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import VesselSetup from "@/components/vessel-setup";

function extractShortId(link?: string | null) {
  const raw = String(link || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/v\/([^/?#]+)/i);
  return match?.[1] || "";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ appointment_id?: string | string[] }>;
}) {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const cookieStore = await cookies();
  const internalAuth = cookieStore.get("antares-auth")?.value === "true";
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !internalAuth) {
    redirect("/login");
  }

  const params = searchParams ? await searchParams : undefined;
  const appointmentId = Array.isArray(params?.appointment_id) ? params.appointment_id[0] : params?.appointment_id;
  const [{ data: vessels }, { data: shiftRows }] = await Promise.all([
    admin
      .from("vessels")
      .select("id,short_id,name,port,terminal,operation_type,commenced_at,created_at")
      .order("created_at", { ascending: false }),
    admin.from("shift_reports").select("vessel_id"),
  ]);

  const shiftedVesselIds = new Set((shiftRows ?? []).map((row) => String(row.vessel_id || "")));
  const vesselItems = (vessels ?? []).map((vessel: any) => ({
    ...vessel,
    has_shifts: shiftedVesselIds.has(String(vessel.id || "")),
  }));

  let selectedVessel: {
    id?: string;
    short_id?: string;
    name: string;
    port: string;
    terminal?: string | null;
    operation_type?: "LOAD" | "DISCHARGE";
    holds?: number | null;
    cargo_grades?: string[];
    default_recipients?: string[];
    open_link?: string;
  } | null = null;

  if (appointmentId) {
    const { data: appointment } = await admin
      .from("appointments")
      .select("id,vessel_name,port,terminal,cargo_operation,shiftreporter_link")
      .eq("id", appointmentId)
      .maybeSingle();

    if (appointment) {
      const byAppointment = await admin
        .from("vessels")
        .select("id,short_id,name,port,terminal,operation_type,holds,cargo_grades,default_recipients")
        .eq("appointment_id", appointmentId)
        .maybeSingle();

      if (byAppointment.data) {
        selectedVessel = {
          id: String((byAppointment.data as any).id || ""),
          short_id: String((byAppointment.data as any).short_id || ""),
          name: String((byAppointment.data as any).name || (appointment as any).vessel_name || ""),
          port: String((byAppointment.data as any).port || (appointment as any).port || ""),
          terminal: String((byAppointment.data as any).terminal || (appointment as any).terminal || ""),
          operation_type: ((byAppointment.data as any).operation_type || "LOAD") as "LOAD" | "DISCHARGE",
          holds: Number((byAppointment.data as any).holds || 0) || null,
          cargo_grades: Array.isArray((byAppointment.data as any).cargo_grades)
            ? (byAppointment.data as any).cargo_grades
            : [],
          default_recipients: Array.isArray((byAppointment.data as any).default_recipients)
            ? (byAppointment.data as any).default_recipients
            : [],
          open_link: (byAppointment.data as any).short_id ? `/v/${(byAppointment.data as any).short_id}` : "",
        };
      } else {
        const shortId = extractShortId((appointment as any).shiftreporter_link);
        if (shortId) {
          const byShortId = await admin
            .from("vessels")
            .select("id,short_id,name,port,terminal,operation_type,holds,cargo_grades,default_recipients")
            .eq("short_id", shortId)
            .maybeSingle();
          if (byShortId.data) {
            selectedVessel = {
              id: String((byShortId.data as any).id || ""),
              short_id: String((byShortId.data as any).short_id || ""),
              name: String((byShortId.data as any).name || (appointment as any).vessel_name || ""),
              port: String((byShortId.data as any).port || (appointment as any).port || ""),
              terminal: String((byShortId.data as any).terminal || (appointment as any).terminal || ""),
              operation_type: ((byShortId.data as any).operation_type || "LOAD") as "LOAD" | "DISCHARGE",
              holds: Number((byShortId.data as any).holds || 0) || null,
              cargo_grades: Array.isArray((byShortId.data as any).cargo_grades)
                ? (byShortId.data as any).cargo_grades
                : [],
              default_recipients: Array.isArray((byShortId.data as any).default_recipients)
                ? (byShortId.data as any).default_recipients
                : [],
              open_link: `/v/${shortId}`,
            };
          }
        }
      }

      if (!selectedVessel) {
        selectedVessel = {
          name: String((appointment as any).vessel_name || ""),
          port: String((appointment as any).port || ""),
          terminal: String((appointment as any).terminal || ""),
          operation_type: String((appointment as any).cargo_operation || "").toUpperCase().startsWith("DISCH") ? "DISCHARGE" : "LOAD",
          holds: null,
          cargo_grades: [],
          default_recipients: [],
          open_link: String((appointment as any).shiftreporter_link || ""),
        };
      }
    }
  }

  return (
    <VesselSetup
      existingVessels={vesselItems}
      appointmentId={appointmentId ?? ""}
      allowCreate={false}
      selectedVessel={selectedVessel}
    />
  );
}
