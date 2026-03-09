import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const isDateTime = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(String(value || "").trim());
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

async function resolveShiftIdForEvent(
  admin: ReturnType<typeof supabaseAdmin>,
  vesselId: string,
  from: string,
  requestedShiftId: string
) {
  if (requestedShiftId) {
    const { data: shift } = await admin
      .from("shift_reports")
      .select("id, vessel_id")
      .eq("id", requestedShiftId)
      .maybeSingle();
    if (shift && String(shift.vessel_id) === vesselId) return String(shift.id);
  }

  const { data: matchingShift } = await admin
    .from("shift_reports")
    .select("id")
    .eq("vessel_id", vesselId)
    .lte("shift_start", from)
    .gte("shift_end", from)
    .order("shift_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (matchingShift) return String(matchingShift.id);

  const { data: latestShift } = await admin
    .from("shift_reports")
    .select("id")
    .eq("vessel_id", vesselId)
    .order("shift_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  return latestShift ? String(latestShift.id) : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const admin = supabaseAdmin();

    const vesselId = await resolveVesselId(admin, idParam);
    if (!vesselId) return NextResponse.json({ error: "Vessel not found" }, { status: 404 });

    const body = await req.json();
    const shiftId = String(body?.shiftId || "").trim();
    const from = String(body?.from || "").trim();
    const to = String(body?.to || "").trim();
    const reason = String(body?.reason || "").trim();

    if (!from || !reason) {
      return NextResponse.json({ error: "from and event are required" }, { status: 400 });
    }
    if (!isDateTime(from)) {
      return NextResponse.json({ error: "FROM must be YYYY-MM-DDTHH:MM[:SS]" }, { status: 400 });
    }
    if (to && !isDateTime(to)) {
      return NextResponse.json({ error: "TO must be YYYY-MM-DDTHH:MM[:SS]" }, { status: 400 });
    }

    const resolvedShiftId = await resolveShiftIdForEvent(admin, vesselId, from, shiftId);
    if (!resolvedShiftId) return NextResponse.json({ error: "No shift found for this vessel" }, { status: 400 });

    const { error: insertError } = await admin.from("shift_delays").insert({
      shift_id: resolvedShiftId,
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
