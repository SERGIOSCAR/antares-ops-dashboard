"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function VesselSetup({ existingVessels }: { existingVessels: any[] }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [port, setPort] = useState("");
  const [terminal, setTerminal] = useState("");
  const [operationType, setOperationType] = useState<"LOAD" | "DISCHARGE">("LOAD");
  const [holds, setHolds] = useState(7);
  const [cargoGrades, setCargoGrades] = useState("");
  const [recipients, setRecipients] = useState("");
  const [headUsername, setHeadUsername] = useState("head1");
  const [error, setError] = useState("");
  const [createdVessel, setCreatedVessel] = useState<{ name: string; shortId: string; fullLink: string } | null>(null);

  const router = useRouter();

  const onSubmit = async () => {
    setCreating(true);
    setError("");
    
    try {
      const grades = cargoGrades.split(",").map(x => x.trim()).filter(Boolean);
      const recipientsList = recipients.split(",").map(x => x.trim()).filter(Boolean);
      
      // Generate default stow plan
      const stow = Array.from({ length: holds }).flatMap((_, i) =>
        (grades.length ? grades : ["TOTAL"]).map(grade => ({
          hold: i + 1,
          grade,
          totalMT: 0,
          condition: ""
        }))
      );

      // Get auth token
      const supa = supabaseBrowser();
      const { data: { session } } = await supa.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error("Unauthorized: no active session token.");
      }

      const body = {
        name,
        port,
        terminal,
        operationType,
        cargoGrades: grades,
        holds,
        recipients: recipientsList,
        headUsername: headUsername.trim().toLowerCase(),
        stow,
      };

      const res = await fetch("/api/shiftreporter/vessels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create vessel.");

      const fullLink = `/v/${json.shortId}`;
      setCreatedVessel({ name, shortId: json.shortId, fullLink });
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      {createdVessel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border">
            <h3 className="text-xl font-semibold">Vessel Created Successfully</h3>
            <p className="text-sm text-zinc-600 mt-2">Shareable vessel link:</p>
            <a
              href={`/v/${createdVessel.shortId}`}
              className="mt-2 block break-all rounded-md border bg-zinc-50 p-3 text-blue-700 underline"
            >
              {createdVessel.fullLink}
            </a>

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => router.push(`/v/${createdVessel.shortId}`)}
                className="h-10 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                Go to “{createdVessel.name}”
              </button>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(createdVessel.fullLink);
                }}
                className="h-10 rounded-md border bg-white font-medium hover:bg-zinc-50"
              >
                Copy & Share Vessel Link
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatedVessel(null);
                  router.push("/admin");
                }}
                className="h-10 rounded-md bg-zinc-900 text-white font-medium hover:bg-zinc-800"
              >
                Save and Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Create New Vessel</h2>
        
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Vessel Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="MV Example"
                className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Operation</label>
              <select 
                value={operationType}
                onChange={(e) => setOperationType(e.target.value as "LOAD" | "DISCHARGE")}
                className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
              >
                <option value="LOAD">Load</option>
                <option value="DISCHARGE">Discharge</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Port</label>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="San Lorenzo"
                className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Terminal</label>
              <input
                value={terminal}
                onChange={(e) => setTerminal(e.target.value)}
                placeholder="Terminal XYZ"
                className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1"># Holds</label>
              <input
                type="number"
                value={holds}
                onChange={(e) => setHolds(Number(e.target.value))}
                min={1}
                max={30}
                className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Cargo Grades (comma-separated)</label>
            <input
              value={cargoGrades}
              onChange={(e) => setCargoGrades(e.target.value)}
              placeholder="Grade A Wheat, Grade B Soy"
              className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Email Recipients (comma-separated)</label>
            <textarea
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="master@ship.com, ops@agency.com"
              className="min-h-[70px] w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Head Clerk Username</label>
            <input
              value={headUsername}
              onChange={(e) => setHeadUsername(e.target.value)}
              placeholder="head1"
              className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>

          <button
            onClick={onSubmit}
            disabled={creating || !name || !port || !terminal}
            className="w-full h-10 rounded-md bg-zinc-900 text-white font-medium hover:bg-zinc-800 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Vessel"}
          </button>
        </div>
        </div>

        <div className="rounded-2xl border bg-white shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Existing Vessels</h2>
          {existingVessels.length === 0 ? (
            <p className="text-sm text-zinc-500">No vessels yet.</p>
          ) : (
            <div className="space-y-2">
              {existingVessels.map((v) => (
                <div key={v.id} className="rounded-lg border bg-zinc-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{v.name}</div>
                      <div className="text-xs text-zinc-500">
                        {v.port} / {v.terminal} • {v.operation_type}
                      </div>
                    </div>
                    <a
                      className="text-sm text-blue-600 underline"
                      href={`/v/${v.short_id}`}
                    >
                      /v/{v.short_id}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
