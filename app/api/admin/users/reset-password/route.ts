import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type ResetPasswordBody = {
  userId?: string;
  password?: string;
};

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

export async function POST(req: NextRequest) {
  try {
    const admin = supabaseAdmin();
    const auth = await isAdminRequest(req, admin);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as ResetPasswordBody;
    const userId = String(body.userId || "").trim();
    const password = String(body.password || "").trim();

    if (!userId || !password) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to reset password" }, { status: 500 });
  }
}
