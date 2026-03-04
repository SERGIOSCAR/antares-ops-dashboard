import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const isMissingColumnError = (error: any) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || message.includes("column");
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolveVessel = async (admin: ReturnType<typeof supabaseAdmin>, id: string) => {
  const { data: byShortId, error: byShortIdError } = await admin
    .from("vessels")
    .select("*")
    .eq("short_id", id)
    .maybeSingle();

  if (byShortIdError) {
    throw byShortIdError;
  }

  if (byShortId) {
    return byShortId;
  }

  if (UUID_REGEX.test(id)) {
    const { data: byUuid, error: byUuidError } = await admin
      .from("vessels")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (byUuidError) {
      throw byUuidError;
    }

    return byUuid;
  }

  return null;
};

const authenticateRequest = async (req: NextRequest, admin: ReturnType<typeof supabaseAdmin>) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { user, profile };
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const admin = supabaseAdmin();

    const auth = await authenticateRequest(req, admin);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const vessel = await resolveVessel(admin, id);
    if (!vessel) {
      return NextResponse.json({ error: "Vessel not found" }, { status: 404 });
    }

    return NextResponse.json(vessel);
  } catch (error: any) {
    console.error("Get vessel error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch vessel" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const admin = supabaseAdmin();

    const auth = await authenticateRequest(req, admin);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const vesselTarget = await resolveVessel(admin, id);
    if (!vesselTarget) {
      return NextResponse.json({ error: "Vessel not found" }, { status: 404 });
    }

    // Update vessel to set commenced_at
    const { data: vessel, error: updateError } = await admin
      .from("vessels")
      .update({ commenced_at: new Date().toISOString() })
      .eq("id", vesselTarget.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Create a vessel event for "OPERATIONS_COMMENCED"
    // This is best-effort and must not fail a successful commence action.
    let eventInsertError: any = null;

    const attempts = [
      { vessel_id: vesselTarget.id, reason: "Operations commenced" },
      { vessel_id: vesselTarget.id, notes: "Operations commenced" },
      { vessel_id: vesselTarget.id, event_type: "OPERATIONS_COMMENCED", reason: "Operations commenced" },
      { vessel_id: vesselTarget.id, event_type: "OPERATIONS_COMMENCED", notes: "Operations commenced" },
      { vessel_id: vesselTarget.id, event_type: "OPERATIONS_COMMENCED" },
    ];

    for (const payload of attempts) {
      const res = await admin.from("vessel_events").insert(payload as any);
      if (!res.error) {
        eventInsertError = null;
        break;
      }
      if (!isMissingColumnError(res.error)) {
        eventInsertError = res.error;
        break;
      }
      eventInsertError = res.error;
    }

    if (eventInsertError) {
      console.error("Commence event logging warning:", eventInsertError);
    }

    return NextResponse.json({ success: true, vessel });
  } catch (error: any) {
    console.error("Commence operations error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to commence operations" },
      { status: 500 }
    );
  }
}
