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

  const [{ data: vessels }, { data: shiftRows }] = await Promise.all([
    supabase
      .from("vessels")
      .select("id,short_id,name,port,terminal,operation_type,commenced_at,created_at")
      .order("created_at", { ascending: false }),
    supabase.from("shift_reports").select("vessel_id"),
  ]);

  const shiftedVesselIds = new Set((shiftRows ?? []).map((row) => String(row.vessel_id || "")));
  const vesselItems = (vessels ?? []).map((vessel: any) => ({
    ...vessel,
    has_shifts: shiftedVesselIds.has(String(vessel.id || "")),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        <p className="text-sm text-zinc-600">Create vessels, assign access, maintain stow plans.</p>
      </div>

      <VesselSetup existingVessels={vesselItems} />
    </div>
  );
}
