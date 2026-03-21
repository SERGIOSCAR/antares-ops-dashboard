import { supabaseAdmin } from "@/lib/supabase/admin";

const DRAFT_META_GRADE = new Set(["__META_DRAFT_FWD__", "__META_DRAFT_MEAN__", "__META_DRAFT_AFT__"]);

function isMissingVesselAppointmentColumn(message?: string) {
  return String(message || "").includes("appointment_id");
}

function isMissingConditionColumn(message?: string) {
  return String(message || "").toLowerCase().includes("condition");
}

function mapOperationType(input?: string | null): "LOAD" | "DISCHARGE" {
  const normalized = (input || "").trim().toUpperCase();
  if (normalized === "DISCH" || normalized === "DISCHARGE") return "DISCHARGE";
  return "LOAD";
}

function splitCargoGrades(input?: string | null) {
  if (!input) return [];
  return input
    .split(",")
    .map((grade) => grade.trim())
    .filter(Boolean);
}

export function extractShortId(link?: string | null) {
  const raw = String(link || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/v\/([^/?#]+)/i);
  return match?.[1] || "";
}

type SyncArgs = {
  appointmentId: string;
  vesselId: string;
  vesselName: string;
  port?: string | null;
  terminal?: string | null;
  cargoOperation?: string | null;
  cargoGrade?: string | null;
  holds?: number | null;
};

export async function syncVesselFromAppointment(args: SyncArgs) {
  const admin = supabaseAdmin();
  const nextHolds = args.holds && args.holds > 0 ? args.holds : 1;
  const nextGrades = splitCargoGrades(args.cargoGrade);

  const shiftCountRes = await admin
    .from("shift_reports")
    .select("id", { count: "exact", head: true })
    .eq("vessel_id", args.vesselId);
  if (shiftCountRes.error) throw shiftCountRes.error;
  const shiftCount = Number(shiftCountRes.count || 0);

  const updateRes = await admin
    .from("vessels")
    .update({
      appointment_id: args.appointmentId,
      name: args.vesselName,
      port: args.port || "TBC",
      terminal: args.terminal || "TBC",
      operation_type: mapOperationType(args.cargoOperation),
      ...(shiftCount === 0
        ? {
            holds: nextHolds,
            cargo_grades: nextGrades,
          }
        : {}),
    })
    .eq("id", args.vesselId);
  if (updateRes.error && !isMissingVesselAppointmentColumn(updateRes.error.message)) {
    throw updateRes.error;
  }

  if (shiftCount !== 0) return;

  let stowRes: any = await admin
    .from("stow_plans")
    .select("hold,grade,total_mt,condition,draft_fwd,draft_mean,draft_aft")
    .eq("vessel_id", args.vesselId)
    .order("hold", { ascending: true });
  if (stowRes.error && isMissingConditionColumn(stowRes.error.message)) {
    stowRes = await admin
      .from("stow_plans")
      .select("hold,grade,total_mt,draft_fwd,draft_mean,draft_aft")
      .eq("vessel_id", args.vesselId)
      .order("hold", { ascending: true });
  }
  if (stowRes.error) throw stowRes.error;

  const activeRows = (stowRes.data ?? []).filter((row: any) => !DRAFT_META_GRADE.has(String(row?.grade || "")));
  const draftSource = activeRows[0] || null;
  const existingByKey = new Map<string, any>(
    activeRows.map((row: any) => [`${Number(row.hold)}|${String(row.grade || "")}`, row]),
  );
  const desiredGrades = nextGrades.length ? nextGrades : ["TOTAL"];

  const deleteRes = await admin
    .from("stow_plans")
    .delete()
    .eq("vessel_id", args.vesselId)
    .not("grade", "in", '("__META_DRAFT_FWD__","__META_DRAFT_MEAN__","__META_DRAFT_AFT__")');
  if (deleteRes.error) throw deleteRes.error;

  const rebuiltRows = Array.from({ length: nextHolds }).flatMap((_, index) =>
    desiredGrades.map((grade) => {
      const existing = existingByKey.get(`${index + 1}|${grade}`) as any;
      return {
        vessel_id: args.vesselId,
        hold: index + 1,
        grade,
        total_mt: Number(existing?.total_mt || 0),
        condition: existing?.condition || null,
        draft_fwd: draftSource?.draft_fwd ?? null,
        draft_mean: draftSource?.draft_mean ?? null,
        draft_aft: draftSource?.draft_aft ?? null,
      };
    }),
  );

  if (!rebuiltRows.length) return;

  let insertRes = await admin.from("stow_plans").insert(rebuiltRows);
  if (insertRes.error && String(insertRes.error.message || "").toLowerCase().includes("condition")) {
    insertRes = await admin.from("stow_plans").insert(
      rebuiltRows.map((row) => ({
        vessel_id: row.vessel_id,
        hold: row.hold,
        grade: row.grade,
        total_mt: row.total_mt,
        draft_fwd: row.draft_fwd,
        draft_mean: row.draft_mean,
        draft_aft: row.draft_aft,
      })),
    );
  }
  if (insertRes.error) throw insertRes.error;
}
