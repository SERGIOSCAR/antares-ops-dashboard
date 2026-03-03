import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cookies } from "next/headers";

export default async function HomePage() {
  const supabase = await supabaseServer();
  const cookieStore = await cookies();
  const internalAuth = cookieStore.get("antares-auth")?.value === "true";
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !internalAuth) {
    redirect("/login");
  }

  if (!user && internalAuth) {
    const admin = supabaseAdmin();
    const { data: vessel } = await admin
      .from("vessels")
      .select("short_id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (vessel?.short_id) {
      redirect(`/v/${vessel.short_id}`);
    }
  }

  if (!user) {
    return (
      <div className="rounded-2xl border bg-white shadow-sm p-6">
        <h1 className="text-xl font-semibold">No vessel assigned</h1>
        <p className="text-sm text-zinc-600 mt-2">
          Your account is active, but there is no vessel membership yet.
        </p>
      </div>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role === "admin") {
    redirect("/admin");
  }

  const { data: memberships } = await supabase
    .from("vessel_members")
    .select("vessel_id")
    .eq("user_id", user.id)
    .limit(1);

  const vesselId = memberships?.[0]?.vessel_id;

  if (vesselId) {
    const { data: vessel } = await supabase
      .from("vessels")
      .select("short_id")
      .eq("id", vesselId)
      .single();

    if (vessel?.short_id) {
      redirect(`/v/${vessel.short_id}`);
    }
  }

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-6">
      <h1 className="text-xl font-semibold">No vessel assigned</h1>
      <p className="text-sm text-zinc-600 mt-2">
        Your account is active, but there is no vessel membership yet.
      </p>
    </div>
  );
}
