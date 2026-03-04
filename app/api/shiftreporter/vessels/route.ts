import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { VesselCreateSchema } from "@/lib/zod";

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

    const {
      name,
      port,
      terminal,
      operationType,
      cargoGrades,
      holds,
      shiftType,
      recipients,
      headUsername,
      stow,
    } = parsed.data;

    const shortId = nanoid(10);

    // Create vessel (using admin client which bypasses RLS)
    const { data: vessel, error: vesselError } = await admin
      .from("vessels")
      .insert({
        short_id: shortId,
        name,
        port,
        terminal,
        operation_type: operationType,
        cargo_grades: cargoGrades,
        holds,
        shift_type: shiftType,
        default_recipients: recipients,
        created_by: user.id,
      })
      .select()
      .single();

    if (vesselError) throw vesselError;

    // Create stow plan (skip if table doesn't exist)
    if (stow && stow.length > 0) {
      try {
        let { error: stowError } = await admin.from("stow_plans").insert(
          stow.map((s: any) => ({
            vessel_id: vessel.id,
            hold: s.hold,
            grade: s.grade,
            total_mt: s.totalMT,
            condition: s.condition || null,
          }))
        );

        if (stowError && String(stowError.message || "").toLowerCase().includes("condition")) {
          const retry = await admin.from("stow_plans").insert(
            stow.map((s: any) => ({
              vessel_id: vessel.id,
              hold: s.hold,
              grade: s.grade,
              total_mt: s.totalMT,
            }))
          );
          stowError = retry.error;
        }

        if (stowError) console.warn("Stow plan warning:", stowError);
      } catch (e) {
        console.warn("Stow plan creation skipped");
      }
    }

    // Find head user and grant access
    const { data: headUser } = await admin
      .from("profiles")
      .select("id")
      .eq("username", headUsername.toLowerCase())
      .single();

    if (headUser) {
      await admin.from("vessel_members").insert({
        vessel_id: vessel.id,
        user_id: headUser.id,
        is_head: true,
      });
    }

    return NextResponse.json({ shortId, vesselId: vessel.id });
  } catch (error: any) {
    console.error("Vessel creation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create vessel" },
      { status: 500 }
    );
  }
}
