import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import VesselSetup from "@/components/vessel-setup";

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

  const { data: vessels } = await supabase
    .from("vessels")
    .select("id,short_id,slug,name,port,status,created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  return <VesselSetup existingVessels={vessels ?? []} />;
}
