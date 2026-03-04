import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const isDateTime = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(String(value || "").trim());
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorizeAdmin(req: NextRequest) {
  const admin = supabaseAdmin();
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return { admin, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(token);
  if (userError || !user) {
    return { admin, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || String(profile.role) !== "admin") {
    return {
      admin,
      error: NextResponse.json({ error: "Only Admin can edit running SOF events" }, { status: 403 }),
    };
  }

  return { admin, error: null as NextResponse | null };
}

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
    const { admin, error } = await authorizeAdmin(req);
    if (error) return error;

    const vesselId = await resolveVesselId(admin, idParam);
    if (!vesselId) return NextResponse.json({ error: "Vessel not found" }, { status: 404 });

    const body = await req.json();
    const shiftId = String(body?.shiftId || "").trim();
    const from = String(body?.from || "").trim();
    const to = String(body?.to || "").trim();
    const reason = String(body?.reason || "").trim();

    if (!shiftId || !from || !reason) {
      return NextResponse.json({ error: "shiftId, from and reason are required" }, { status: 400 });
    }
    if (!isDateTime(from)) {
      return NextResponse.json({ error: "FROM must be YYYY-MM-DDTHH:MM[:SS]" }, { status: 400 });
    }
    if (to && !isDateTime(to)) {
      return NextResponse.json({ error: "TO must be YYYY-MM-DDTHH:MM[:SS]" }, { status: 400 });
    }

    const { data: shift } = await admin
      .from("shift_reports")
      .select("id, vessel_id")
      .eq("id", shiftId)
      .single();

    if (!shift || String(shift.vessel_id) !== vesselId) {
      return NextResponse.json({ error: "Shift does not belong to this vessel" }, { status: 400 });
    }

    const { error: insertError } = await admin.from("shift_delays").insert({
      shift_id: shiftId,
      from_time: from,
      to_time: to || null,
      reason,
    });

    if (insertError) throw insertError;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to add running SOF event" }, { status: 500 });
  }
}
