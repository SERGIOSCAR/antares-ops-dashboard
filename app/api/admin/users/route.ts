import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type CreateUserBody = {
  email?: string;
  password?: string;
  username?: string;
  role?: string;
};

export async function POST(req: NextRequest) {
  try {
    const admin = supabaseAdmin();
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user: requester },
      error: requesterError,
    } = await admin.auth.getUser(token);

    if (requesterError || !requester) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", requester.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as CreateUserBody;
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const username = String(body.username || "").trim().toLowerCase();
    const role = String(body.role || "clerk").trim().toLowerCase();

    if (!email || !password || !username) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (role !== "admin" && role !== "clerk") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (userError || !userData.user) {
      return NextResponse.json({ error: userError?.message || "Failed to create user" }, { status: 500 });
    }

    const userId = userData.user.id;
    const { error: profileInsertError } = await admin
      .from("profiles")
      .upsert(
        {
          id: userId,
          username,
          role,
        },
        { onConflict: "id" },
      );

    if (profileInsertError) {
      await admin.auth.admin.deleteUser(userId);
      const message = profileInsertError.message || "Failed to create user profile";
      const duplicateUsername =
        profileInsertError.code === "23505" && message.toLowerCase().includes("username");
      return NextResponse.json(
        { error: duplicateUsername ? "Username already exists" : message },
        { status: duplicateUsername ? 400 : 500 },
      );
    }

    return NextResponse.json({ success: true, userId });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to create user" }, { status: 500 });
  }
}
