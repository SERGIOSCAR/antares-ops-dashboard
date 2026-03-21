import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

const bodySchema = z.object({
  default_recipients: z.array(z.string().email()).default([]),
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveVessel(admin: ReturnType<typeof supabaseAdmin>, id: string) {
  const { data: byShortId, error: byShortIdError } = await admin
    .from("vessels")
    .select("id,short_id")
    .eq("short_id", id)
    .maybeSingle();
  if (byShortIdError) throw byShortIdError;
  if (byShortId) return byShortId;

  if (UUID_REGEX.test(id)) {
    const { data: byUuid, error: byUuidError } = await admin
      .from("vessels")
      .select("id,short_id")
      .eq("id", id)
      .maybeSingle();
    if (byUuidError) throw byUuidError;
    return byUuid;
  }

  return null;
}

export async function PATCH(req: NextRequest, context: { params: Promise<unknown> }) {
  try {
    const { id } = (await context.params) as { id: string };
    const admin = supabaseAdmin();

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const vessel = await resolveVessel(admin, id);
    if (!vessel) {
      return NextResponse.json({ error: "Vessel not found" }, { status: 404 });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
    }

    const { data, error } = await admin
      .from("vessels")
      .update({ default_recipients: parsed.data.default_recipients })
      .eq("id", vessel.id)
      .select("id,short_id,default_recipients")
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update vessel settings" }, { status: 500 });
  }
}
