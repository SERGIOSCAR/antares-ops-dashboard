import { nanoid } from "nanoid";
import { supabaseAdmin } from "@/lib/supabase/admin";

function isMissingAppointmentIdColumn(message?: string) {
  return String(message || "").includes("appointment_id");
}

function mapOperationType(input?: string | null): "LOAD" | "DISCHARGE" {
  const normalized = (input || "").trim().toUpperCase();
  if (normalized === "DISCH" || normalized === "DISCHARGE") return "DISCHARGE";
  return "LOAD";
}

function splitCargoGrades(input?: string | string[] | null) {
  if (Array.isArray(input)) {
    return input.map((grade) => grade.trim()).filter(Boolean);
  }
  if (!input) return [];
  return input
    .split(",")
    .map((grade) => grade.trim())
    .filter(Boolean);
}

function buildDefaultStowPlan(holds: number, cargoGrades: string[]) {
  const grades = cargoGrades.length ? cargoGrades : ["TOTAL"];
  return Array.from({ length: holds }).flatMap((_, index) =>
    grades.map((grade) => ({
      hold: index + 1,
      grade,
      total_mt: 0,
      condition: null as string | null,
    })),
  );
}

type ProvisionShiftReporterVesselArgs = {
  appointmentId?: string | null;
  vesselName: string;
  port?: string | null;
  terminal?: string | null;
  cargoOperation?: string | null;
  cargoGrade?: string | string[] | null;
  holds?: number | null;
  recipients?: string[] | null;
  createdBy?: string | null;
  commencedAt?: string | null;
};

export async function provisionShiftReporterVessel(args: ProvisionShiftReporterVesselArgs) {
  const admin = supabaseAdmin();
  if (args.appointmentId) {
    const { data: existing, error: existingError } = await admin
      .from("vessels")
      .select("id,short_id")
      .eq("appointment_id", args.appointmentId)
      .maybeSingle();

    if (existingError) {
      if (!isMissingAppointmentIdColumn(existingError.message)) {
        throw existingError;
      }
    }
    if (existing) {
      return {
        vesselId: existing.id as string,
        shortId: existing.short_id as string,
        link: `/v/${existing.short_id}`,
      };
    }
  }

  const shortId = nanoid(10);
  const holds = args.holds && args.holds > 0 ? args.holds : 1;
  const cargoGrades = splitCargoGrades(args.cargoGrade);

  let insertRes = await admin
    .from("vessels")
    .insert({
      appointment_id: args.appointmentId || null,
      short_id: shortId,
      name: args.vesselName,
      port: args.port || "TBC",
      terminal: args.terminal || "TBC",
      operation_type: mapOperationType(args.cargoOperation),
      cargo_grades: cargoGrades,
      holds,
      shift_type: "00-06/06-12/12-18/18-24",
      default_recipients: args.recipients || [],
      created_by: args.createdBy || null,
      commenced_at: args.commencedAt ?? null,
    })
    .select("id,short_id")
    .single();

  if (insertRes.error && isMissingAppointmentIdColumn(insertRes.error.message)) {
    insertRes = await admin
      .from("vessels")
      .insert({
        short_id: shortId,
        name: args.vesselName,
        port: args.port || "TBC",
        terminal: args.terminal || "TBC",
        operation_type: mapOperationType(args.cargoOperation),
        cargo_grades: cargoGrades,
        holds,
        shift_type: "00-06/06-12/12-18/18-24",
        default_recipients: args.recipients || [],
        created_by: args.createdBy || null,
        commenced_at: args.commencedAt ?? null,
      })
      .select("id,short_id")
      .single();
  }

  const { data: vessel, error: vesselError } = insertRes;
  if (vesselError || !vessel) {
    throw vesselError || new Error("Failed to create ShiftReporter vessel");
  }

  const stowRows = buildDefaultStowPlan(holds, cargoGrades);
  if (stowRows.length) {
    let { error: stowError } = await admin.from("stow_plans").insert(
      stowRows.map((row) => ({
        vessel_id: vessel.id,
        hold: row.hold,
        grade: row.grade,
        total_mt: row.total_mt,
        condition: row.condition,
      })),
    );

    if (stowError && String(stowError.message || "").toLowerCase().includes("condition")) {
      const retry = await admin.from("stow_plans").insert(
        stowRows.map((row) => ({
          vessel_id: vessel.id,
          hold: row.hold,
          grade: row.grade,
          total_mt: row.total_mt,
        })),
      );
      stowError = retry.error;
    }

    if (stowError) throw stowError;
  }

  return {
    vesselId: vessel.id as string,
    shortId: vessel.short_id as string,
    link: `/v/${vessel.short_id}`,
  };
}
