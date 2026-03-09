import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type LineupEntry = {
  id: string;
  appointment_id: string;
  content: string;
  version: number;
  updated_at: string;
  updated_by: string | null;
  updated_by_type: string | null;
  source: string | null;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const appointmentId = searchParams.get("appointment_id");
    const appointmentIdsRaw = searchParams.get("appointment_ids");
    const supabase = await supabaseServer();

    if (appointmentIdsRaw) {
      const ids = appointmentIdsRaw
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (ids.length === 0) return NextResponse.json({ data: [] });

      const { data, error } = await supabase
        .from("lineup_entries")
        .select("id,appointment_id,content,version,updated_at,updated_by,updated_by_type,source")
        .in("appointment_id", ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: data ?? [] });
    }

    if (!appointmentId) {
      return NextResponse.json({ error: "appointment_id or appointment_ids is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("lineup_entries")
      .select("id,appointment_id,content,version,updated_at,updated_by,updated_by_type,source")
      .eq("appointment_id", appointmentId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? null });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch lineup entries" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      appointment_id?: string;
      content?: string;
      expected_version?: number;
      updated_by?: string;
      updated_by_type?: string;
      source?: string;
    };
    const appointmentId = String(body.appointment_id || "").trim();
    if (!appointmentId) return NextResponse.json({ error: "appointment_id is required" }, { status: 400 });

    const content = String(body.content || "");
    const expectedVersion = Number.isFinite(Number(body.expected_version))
      ? Number(body.expected_version)
      : 0;
    const updatedBy = String(body.updated_by || "").trim() || null;
    const updatedByType = String(body.updated_by_type || "").trim() || null;
    const source = String(body.source || "").trim() || "internal";
    const supabase = await supabaseServer();

    const existingRes = await supabase
      .from("lineup_entries")
      .select("id,appointment_id,content,version,updated_at,updated_by,updated_by_type,source")
      .eq("appointment_id", appointmentId)
      .maybeSingle();

    if (existingRes.error) {
      return NextResponse.json({ error: existingRes.error.message }, { status: 500 });
    }

    const existing = (existingRes.data ?? null) as LineupEntry | null;

    if (existing && expectedVersion !== existing.version) {
      return NextResponse.json(
        { error: "Lineup was updated by another user", conflict: true, current: existing },
        { status: 409 },
      );
    }

    if (!existing && expectedVersion > 0) {
      return NextResponse.json(
        { error: "Lineup was created by another user", conflict: true },
        { status: 409 },
      );
    }

    const nowIso = new Date().toISOString();
    const nextVersion = existing ? existing.version + 1 : 1;
    const save = existing
      ? await supabase
          .from("lineup_entries")
          .update({
            content,
            version: nextVersion,
            updated_at: nowIso,
            updated_by: updatedBy,
            updated_by_type: updatedByType,
            source,
          })
          .eq("id", existing.id)
          .select("id,appointment_id,content,version,updated_at,updated_by,updated_by_type,source")
          .single()
      : await supabase
          .from("lineup_entries")
          .insert({
            appointment_id: appointmentId,
            content,
            version: 1,
            updated_at: nowIso,
            updated_by: updatedBy,
            updated_by_type: updatedByType,
            source,
          })
          .select("id,appointment_id,content,version,updated_at,updated_by,updated_by_type,source")
          .single();

    if (save.error) return NextResponse.json({ error: save.error.message }, { status: 500 });

    const saved = save.data as LineupEntry;
    await supabase.from("lineup_audit").insert({
      lineup_entry_id: saved.id,
      appointment_id: appointmentId,
      previous_content: existing?.content ?? null,
      new_content: saved.content,
      version_from: existing?.version ?? 0,
      version_to: saved.version,
      changed_at: nowIso,
      changed_by: updatedBy,
      changed_by_type: updatedByType,
      source,
    });

    return NextResponse.json({ data: saved });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save lineup entry" },
      { status: 500 },
    );
  }
}
