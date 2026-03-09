import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function toSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("sub_agents")
      .select("id,name,slug,is_active,created_at")
      .order("name", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch sub agents" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; slug?: string };
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const slug = toSlug(body.slug || name);
    if (!slug) return NextResponse.json({ error: "slug is invalid" }, { status: 400 });

    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("sub_agents")
      .insert({ name, slug, is_active: true })
      .select("id,name,slug,is_active,created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create sub agent" },
      { status: 500 },
    );
  }
}
