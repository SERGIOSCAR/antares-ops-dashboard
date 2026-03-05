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

  let vessels: Array<{ id: string; name: string; port: string; slug?: string; short_id?: string }> = [];

  const withStatusAndSlug = await supabase
    .from("vessels")
    .select("id,name,port,slug,status,created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (!withStatusAndSlug.error) {
    vessels = withStatusAndSlug.data ?? [];
  } else {
    const allWithSlug = await supabase
      .from("vessels")
      .select("id,name,port,slug,created_at")
      .order("created_at", { ascending: false });

    if (!allWithSlug.error) {
      vessels = allWithSlug.data ?? [];
    } else {
      const withStatusAndShortId = await supabase
        .from("vessels")
        .select("id,name,port,short_id,status,created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (!withStatusAndShortId.error) {
        vessels = withStatusAndShortId.data ?? [];
      } else {
        const allWithShortId = await supabase
          .from("vessels")
          .select("id,name,port,short_id,created_at")
          .order("created_at", { ascending: false });
        vessels = allWithShortId.data ?? [];
      }
    }
  }

  return <VesselSetup existingVessels={vessels ?? []} />;
}
