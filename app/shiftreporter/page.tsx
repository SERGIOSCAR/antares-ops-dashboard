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

  const { data: vessels, error } = await supabase
    .from("vessels")
    .select("id,name,port,slug,created_at")
    .order("created_at", { ascending: false });

  if (error) console.error("Vessel query error:", error);

  return <VesselSetup existingVessels={vessels ?? []} />;
}
