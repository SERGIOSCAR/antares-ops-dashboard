import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import VesselSetup from "@/components/vessel-setup";

export default async function AdminPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,username")
    .eq("id", userData.user.id)
    .single();

  if (profile?.role !== "admin") redirect("/");

  const { data: vessels } = await supabase
    .from("vessels")
    .select("id,short_id,name,port,terminal,operation_type,commenced_at,created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        <p className="text-sm text-zinc-600">Create vessels, assign access, maintain stow plans.</p>
      </div>

      <VesselSetup existingVessels={vessels ?? []} />
    </div>
  );
}