import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export default async function LineupIndexPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("sub_agents")
    .select("name,slug,is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  const items = data ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-100">Line Up Pages</h1>
      <p className="mt-1 text-sm text-slate-300">Select a sub-agent page</p>
      <div className="mt-6 space-y-2">
        {items.length === 0 ? (
          <div className="rounded border border-slate-700 bg-slate-900 p-3 text-slate-300">No active sub-agents.</div>
        ) : (
          items.map((item) => (
            <Link
              key={item.slug}
              href={`/lineup/${item.slug}`}
              className="block rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 hover:bg-slate-800"
            >
              {item.name} ({item.slug})
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
