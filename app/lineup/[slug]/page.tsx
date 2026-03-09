import { headers } from "next/headers";
import LineupClient from "./lineup-client";

type ApiResponse = {
  data?: {
    subAgent: { name: string; slug: string };
    appointments: Array<{
      id: string;
      vessel_name: string;
      port: string | null;
      terminal: string | null;
      cargo_operation: string | null;
      cargo_grade: string | null;
      cargo_qty: number | null;
      status: string;
      lineup: { content: string; version: number; updated_at: string } | null;
    }>;
  };
  error?: string;
};

export default async function SubAgentLineupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "http";
  if (!host) return <main className="p-6 text-red-300">Missing host header.</main>;

  const res = await fetch(`${proto}://${host}/api/lineup/${encodeURIComponent(slug)}`, { cache: "no-store" });
  const json = (await res.json()) as ApiResponse;
  if (!res.ok || !json.data) {
    return <main className="p-6 text-red-300">{json.error || "Failed to load lineup page."}</main>;
  }

  return (
    <LineupClient
      slug={slug}
      subAgentName={json.data.subAgent.name}
      initialItems={json.data.appointments}
    />
  );
}
