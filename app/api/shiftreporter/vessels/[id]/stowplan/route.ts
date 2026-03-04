import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

const isMissingColumnError = (error: any) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || message.includes("column");
};

const StowPlanUpdateSchema = z.object({
  plan: z
    .array(
      z.object({
        hold: z.number().int().positive(),
        grade: z.string().trim().min(1),
        totalMT: z.number().finite().nonnegative(),
        condition: z.string().trim().optional().default(""),
      })
    )
    .default([]),
  drafts: z
    .object({
      fwd: z.number().finite(),
      mean: z.number().finite(),
      aft: z.number().finite(),
    })
    .optional(),
});

const DRAFT_META_GRADE = {
  fwd: "__META_DRAFT_FWD__",
  mean: "__META_DRAFT_MEAN__",
  aft: "__META_DRAFT_AFT__",
} as const;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveVesselId(admin: ReturnType<typeof supabaseAdmin>, idParam: string) {
  if (UUID_REGEX.test(idParam)) {
    const { data: byUuid, error: byUuidError } = await admin
      .from("vessels")
      .select("id")
      .eq("id", idParam)
      .maybeSingle();
    if (byUuidError) throw byUuidError;
    if (byUuid) return String(byUuid.id);
  }

  const { data: byShortId, error: byShortIdError } = await admin
    .from("vessels")
    .select("id")
    .eq("short_id", idParam)
    .maybeSingle();
  if (byShortIdError) throw byShortIdError;
  if (byShortId) return String(byShortId.id);

  return null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;

    const admin = supabaseAdmin();

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = StowPlanUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { plan, drafts } = parsed.data;
    const vesselId = await resolveVesselId(admin, idParam);
    if (!vesselId) {
      return NextResponse.json({ error: "Vessel not found" }, { status: 404 });
    }

    // Delete existing stow plan
    const { error: deleteError } = await admin.from("stow_plans").delete().eq("vessel_id", vesselId);
    if (deleteError) throw deleteError;

    // Insert new stow plan
    if (plan && plan.length > 0) {
      const baseRows = plan.map((item) => ({
        vessel_id: vesselId,
        hold: item.hold,
        grade: item.grade,
        total_mt: item.totalMT,
      }));

      const attempts = [
        baseRows.map((row, index) => ({
          ...row,
          condition: plan[index]?.condition || null,
          draft_fwd: drafts?.fwd ?? null,
          draft_mean: drafts?.mean ?? null,
          draft_aft: drafts?.aft ?? null,
        })),
        baseRows.map((row, index) => ({
          ...row,
          condition: plan[index]?.condition || null,
        })),
        baseRows.map((row) => ({
          ...row,
          draft_fwd: drafts?.fwd ?? null,
          draft_mean: drafts?.mean ?? null,
          draft_aft: drafts?.aft ?? null,
        })),
        baseRows,
      ];

      let insertError: { message?: string } | null = null;
      for (const rows of attempts) {
        const { error } = await admin.from("stow_plans").insert(rows);
        if (!error) {
          insertError = null;
          break;
        }
        if (!isMissingColumnError(error)) {
          throw error;
        }
        insertError = error;
      }

      if (insertError) throw insertError;

      // Best-effort schema-independent draft persistence:
      // store fallback metadata rows using base columns only.
      if (drafts) {
        const draftMetaRows = [
          { vessel_id: vesselId, hold: 0, grade: DRAFT_META_GRADE.fwd, total_mt: drafts.fwd },
          { vessel_id: vesselId, hold: 0, grade: DRAFT_META_GRADE.mean, total_mt: drafts.mean },
          { vessel_id: vesselId, hold: 0, grade: DRAFT_META_GRADE.aft, total_mt: drafts.aft },
        ];
        const metaRes = await admin.from("stow_plans").insert(draftMetaRows);
        if (metaRes.error) {
          console.warn("Draft metadata fallback insert skipped:", metaRes.error);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Stow plan update error:", error);
    const message = error instanceof Error ? error.message : "Failed to update stow plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
