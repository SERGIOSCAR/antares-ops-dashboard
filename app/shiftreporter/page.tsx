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

  return <VesselSetup existingVessels={[]} />;
}
