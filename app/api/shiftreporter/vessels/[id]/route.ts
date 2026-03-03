import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const isMissingColumnError = (error: any) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || message.includes("column");
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const admin = supabaseAdmin();

    // Verify user is authenticated
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Update vessel to set commenced_at
    const { data: vessel, error: updateError } = await admin
      .from("vessels")
      .update({ commenced_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Create a vessel event for "OPERATIONS_COMMENCED"
    // This is best-effort and must not fail a successful commence action.
    let eventInsertError: any = null;

    const attempts = [
      { vessel_id: id, reason: "Operations commenced" },
      { vessel_id: id, notes: "Operations commenced" },
      { vessel_id: id, event_type: "OPERATIONS_COMMENCED", reason: "Operations commenced" },
      { vessel_id: id, event_type: "OPERATIONS_COMMENCED", notes: "Operations commenced" },
      { vessel_id: id, event_type: "OPERATIONS_COMMENCED" },
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
