import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import UserManagementForm from "./user-management-form";

export default async function AdminUsersPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/dashboard");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/dashboard");
  }

  return <UserManagementForm />;
}
