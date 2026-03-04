import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const PRE_OP_REASON_PREFIX = "[PRE_OPERATION_SOF] ";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isMissingColumnError = (error: any) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || message.includes("column");
};

const isHHMM = (value: string) => /^\d{2}:\d{2}$/.test(String(value || "").trim());

function normalizeFromTo(baseDate: string, fromHHMM: string, toHHMM?: string) {
  const mkISO = (hhmm: string) => {
    const clean = String(hhmm || "").trim();
    if (!/^\d{2}:\d{2}$/.test(clean)) {
      throw new Error("Invalid time format. Use HH:MM");
    }
    return `${baseDate}T${clean}:00`;
  };

  const from = mkISO(fromHHMM);
  if (!toHHMM?.trim()) return { from, to: null as string | null };

  let to = mkISO(toHHMM);
  if (to < from) {
    const d = new Date(`${baseDate}T00:00:00`);
    d.setDate(d.getDate() + 1);
    const next = d.toISOString().slice(0, 10);
    to = `${next}T${String(toHHMM).trim()}:00`;
  }

  return { from, to };
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
    const admin = supabaseAdmin();

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "agent"].includes(String(profile.role))) {
      return NextResponse.json({ error: "Only Agent/Admin can submit pre-operation SOF events" }, { status: 403 });
    }

    const vesselId = await resolveVesselId(admin, idParam);
    if (!vesselId) {
      return NextResponse.json({ error: "Vessel not found" }, { status: 404 });
    }

    const body = await req.json();
    const date = String(body?.date || "").trim();
    const from = String(body?.from || "").trim();
    const to = String(body?.to || "").trim();
    const reason = String(body?.reason || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "Event reason is required" }, { status: 400 });
    }
    if (!from || !isHHMM(from)) {
      return NextResponse.json({ error: "FROM time is required and must be HH:MM" }, { status: 400 });
    }
    if (to && !isHHMM(to)) {
      return NextResponse.json({ error: "TO time must be HH:MM when provided" }, { status: 400 });
    }

    let normalized: { from: string; to: string | null };
    try {
      normalized = normalizeFromTo(date, from, to);
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || "Invalid time format. Use HH:MM" }, { status: 400 });
    }

    let insertError: any = null;
    const attempts = [
      {
        vessel_id: vesselId,
        reason: `${PRE_OP_REASON_PREFIX}${reason}`,
      },
      {
        vessel_id: vesselId,
        notes: JSON.stringify({
          source: "PRE_OPERATION_SOF",
          from: normalized.from,
          to: normalized.to,
          reason,
        }),
      },
      {
        vessel_id: vesselId,
        from_time: normalized.from,
        to_time: normalized.to,
        reason: `${PRE_OP_REASON_PREFIX}${reason}`,
      },
      {
        vessel_id: vesselId,
        event_type: "PRE_OPERATION_SOF",
        notes: JSON.stringify({
          source: "PRE_OPERATION_SOF",
          from: normalized.from,
          to: normalized.to,
          reason,
        }),
      },
      {
        vessel_id: vesselId,
        event_type: "PRE_OPERATION_SOF",
        from_time: normalized.from,
        to_time: normalized.to,
        reason,
      },
      {
        vessel_id: vesselId,
        from_time: normalized.from,
        to_time: normalized.to,
      },
      {
        vessel_id: vesselId,
      },
    ];

    for (const payload of attempts) {
      const res = await admin.from("vessel_events").insert(payload as any);
      if (!res.error) {
        insertError = null;
        break;
      }
      if (!isMissingColumnError(res.error)) {
        throw res.error;
      }
      insertError = res.error;
    }

    if (insertError) throw insertError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to store pre-operation event" }, { status: 500 });
  }
}
