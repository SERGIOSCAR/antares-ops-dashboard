import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { VesselCreateSchema } from "@/lib/zod";
import { provisionShiftReporterVessel } from "@/lib/shiftreporter/provision-vessel";

function mapOperationType(input?: string | null): "LOAD" | "DISCHARGE" {
  return String(input || "").trim().toUpperCase() === "DISCHARGE" ? "DISCHARGE" : "LOAD";
}

async function rebuildStowPlan(
  admin: ReturnType<typeof supabaseAdmin>,
  vesselId: string,
  holds: number,
  cargoGrades: string[],
) {
  const grades = cargoGrades.length ? cargoGrades : ["TOTAL"];
  await admin.from("stow_plans").delete().eq("vessel_id", vesselId);

  const baseRows = Array.from({ length: holds }).flatMap((_, index) =>
    grades.map((grade) => ({
      vessel_id: vesselId,
      hold: index + 1,
      grade,
      total_mt: 0,
      condition: null as string | null,
    })),
  );

  let insertRes = await admin.from("stow_plans").insert(baseRows);
  if (insertRes.error && String(insertRes.error.message || "").toLowerCase().includes("condition")) {
    insertRes = await admin.from("stow_plans").insert(
      baseRows.map((row) => ({
        vessel_id: row.vessel_id,
        hold: row.hold,
        grade: row.grade,
        total_mt: row.total_mt,
      })),
    );
  }
  if (insertRes.error) throw insertRes.error;
}

export async function POST(req: NextRequest) {
  try {
    const admin = supabaseAdmin();

    // Verify user is authenticated
    console.log("Auth header:", req.headers.get("Authorization"));
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    console.log("Token:", token);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    console.log("User:", user?.id);
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    console.log("[vessels.create] User:", user.id);
    console.log("[vessels.create] Profile:", profile);
    console.log("[vessels.create] Payload:", body);

    const parsed = VesselCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { appointmentId, name, port, terminal, operationType, cargoGrades, holds, shiftType, recipients, headUsername, stow } =
      parsed.data;

    void shiftType;
    void stow;
    let provisioned: { shortId: string; vesselId: string };

    if (appointmentId) {
      const linkedRes = await admin
        .from("vessels")
        .select("id,short_id,holds,cargo_grades,commenced_at")
        .eq("appointment_id", appointmentId)
        .maybeSingle();

      if (linkedRes.error && !String(linkedRes.error.message || "").includes("appointment_id")) {
        throw linkedRes.error;
      }

      if (linkedRes.data) {
        const shiftCountRes = await admin
          .from("shift_reports")
          .select("id", { count: "exact", head: true })
          .eq("vessel_id", linkedRes.data.id);
        if (shiftCountRes.error) throw shiftCountRes.error;

        const hasShiftActivity = Number(shiftCountRes.count || 0) > 0;
        const updatePayload: Record<string, unknown> = {
          name,
          port,
          terminal,
          operation_type: mapOperationType(operationType),
          default_recipients: recipients,
        };
        if (!hasShiftActivity && !linkedRes.data.commenced_at) {
          updatePayload.holds = holds;
          updatePayload.cargo_grades = cargoGrades;
        }

        const updateRes = await admin.from("vessels").update(updatePayload).eq("id", linkedRes.data.id);
        if (updateRes.error) throw updateRes.error;

        if (!hasShiftActivity && !linkedRes.data.commenced_at) {
          await rebuildStowPlan(admin, String(linkedRes.data.id), holds, cargoGrades);
        }

        provisioned = {
          vesselId: String(linkedRes.data.id),
          shortId: String(linkedRes.data.short_id),
        };
      } else {
        const created = await provisionShiftReporterVessel({
          appointmentId,
          vesselName: name,
          port,
          terminal,
          cargoOperation: operationType,
          cargoGrade: cargoGrades,
          holds,
          recipients,
          createdBy: user.id,
        });
        provisioned = { shortId: created.shortId, vesselId: created.vesselId };
      }

      await admin
        .from("appointments")
        .update({ shiftreporter_link: `/v/${provisioned.shortId}` })
        .eq("id", appointmentId);
    } else {
      const created = await provisionShiftReporterVessel({
        vesselName: name,
        port,
        terminal,
        cargoOperation: operationType,
        cargoGrade: cargoGrades,
        holds,
        recipients,
        createdBy: user.id,
      });
      provisioned = { shortId: created.shortId, vesselId: created.vesselId };
    }

    // Find head user and grant access
    const { data: headUser } = await admin
      .from("profiles")
      .select("id")
      .eq("username", headUsername.toLowerCase())
      .single();

    if (headUser) {
      await admin.from("vessel_members").insert({
        vessel_id: provisioned.vesselId,
        user_id: headUser.id,
        is_head: true,
      });
    }

    return NextResponse.json({ shortId: provisioned.shortId, vesselId: provisioned.vesselId });
  } catch (error: any) {
    console.error("Vessel creation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create vessel" },
      { status: 500 }
    );
  }
}
