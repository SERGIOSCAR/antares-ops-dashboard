import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const isAdminRequest = async (req: NextRequest, admin: ReturnType<typeof supabaseAdmin>) => {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return { ok: false as const, status: 401, error: "Unauthorized" };

  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(token);

  if (userError || !user) return { ok: false as const, status: 401, error: "Unauthorized" };

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (profile.role !== "admin") return { ok: false as const, status: 403, error: "Forbidden" };

  return { ok: true as const };
};

export async function GET(req: NextRequest) {
  try {
    const admin = supabaseAdmin();
    const auth = await isAdminRequest(req, admin);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const users: Array<{ id: string; email: string; username: string; role: string }> = [];
    let page = 1;
    const perPage = 1000;

    while (true) {
      const { data: pageData, error: listError } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (listError) {
        return NextResponse.json({ error: listError.message }, { status: 500 });
      }

      const pageUsers = pageData.users || [];
      users.push(
        ...pageUsers.map((u) => ({
          id: String(u.id),
          email: String(u.email || ""),
          username: "",
          role: "",
        }))
      );

      if (pageUsers.length < perPage) break;
      page += 1;
    }

    const { data: profiles, error: profilesError } = await admin.from("profiles").select("id,username,role");
    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    }

    const profileById = new Map(
      (profiles || []).map((p: any) => [String(p.id), { username: String(p.username || ""), role: String(p.role || "") }])
    );

    const merged = users
      .map((u) => {
        const profile = profileById.get(u.id);
        return {
          id: u.id,
          email: u.email,
          username: profile?.username || "",
          role: profile?.role || "clerk",
        };
      })
      .sort((a, b) => a.email.localeCompare(b.email));

    return NextResponse.json({ users: merged });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to list users" }, { status: 500 });
  }
}
