import { supabaseServer } from "@/lib/supabase/server";

export async function requireAuthenticatedUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      supabase,
      user: null as null,
      error: error?.message || "Unauthorized",
    };
  }

  return {
    supabase,
    user,
    error: null as null,
  };
}
