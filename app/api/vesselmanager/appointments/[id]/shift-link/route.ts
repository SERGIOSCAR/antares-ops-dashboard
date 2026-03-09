import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

function isMissingShiftLinkColumn(message?: string) {
  if (!message) return false;
  return message.includes("shiftreporter_link");
}

function mapOperationType(input?: string | null): "LOAD" | "DISCHARGE" {
  const normalized = (input || "").trim().toUpperCase();
  if (normalized === "DISCH" || normalized === "DISCHARGE") return "DISCHARGE";
  return "LOAD";
}

function splitCargoGrades(input?: string | null) {
  if (!input) return [] as string[];
  return input
    .split(",")
    .map((grade) => grade.trim())
    .filter(Boolean);
}

async function createShiftVessel(args: {
  vesselName: string;
  port?: string | null;
  terminal?: string | null;
  cargoOperation?: string | null;
  cargoGrade?: string | null;
  holds?: number | null;
  createdBy?: string | null;
}) {
  const admin = supabaseAdmin();
  const shortId = nanoid(10);

  const { error } = await admin.from("vessels").insert({
    short_id: shortId,
    name: args.vesselName,
    port: args.port || "TBC",
    terminal: args.terminal || "TBC",
    operation_type: mapOperationType(args.cargoOperation),
    cargo_grades: splitCargoGrades(args.cargoGrade),
    holds: args.holds && args.holds > 0 ? args.holds : 1,
    shift_type: "00-06/06-12/12-18/18-24",
    default_recipients: [],
    created_by: args.createdBy || null,
    commenced_at: new Date().toISOString(),
  });

  if (error) throw error;
  return `/v/${shortId}`;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await supabaseServer();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let appointmentRes = await supabase
      .from("appointments")
      .select("id,vessel_name,port,terminal,cargo_operation,cargo_grade,holds,shiftreporter_link")
      .eq("id", id)
      .single();

    if (appointmentRes.error && isMissingShiftLinkColumn(appointmentRes.error.message)) {
      appointmentRes = await supabase
        .from("appointments")
        .select("id,vessel_name,port,terminal,cargo_operation,cargo_grade,holds")
        .eq("id", id)
        .single();
    }

    const appointment = appointmentRes.data as
      | {
          id: string;
          vessel_name: string;
          port: string | null;
          terminal: string | null;
          cargo_operation: string | null;
          cargo_grade: string | null;
          holds: number | null;
          shiftreporter_link?: string | null;
        }
      | null;
    const appointmentError = appointmentRes.error;

    if (appointmentError || !appointment) {
      return NextResponse.json({ error: appointmentError?.message || "Appointment not found" }, { status: 404 });
    }

    const existingLink = appointment.shiftreporter_link as string | null;
    if (existingLink && existingLink.startsWith("/v/")) {
      return NextResponse.json({ data: { link: existingLink } });
    }

    const link = await createShiftVessel({
      vesselName: appointment.vessel_name,
      port: appointment.port,
      terminal: appointment.terminal,
      cargoOperation: appointment.cargo_operation,
      cargoGrade: appointment.cargo_grade,
      holds: appointment.holds,
      createdBy: user?.id,
    });

    const { error: updateError } = await supabase
      .from("appointments")
      .update({ shiftreporter_link: link })
      .eq("id", id);

    if (updateError && !isMissingShiftLinkColumn(updateError.message)) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ data: { link } });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate shift report link" },
      { status: 500 },
    );
  }
}
