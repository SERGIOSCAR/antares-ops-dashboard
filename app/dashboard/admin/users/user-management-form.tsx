"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function UserManagementForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"admin" | "clerk">("clerk");
  const [loading, setLoading] = useState(false);

  async function createUser() {
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error("Unauthorized");
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          password,
          username,
          role,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to create user");
      }

      alert("User created");
      setEmail("");
      setPassword("");
      setUsername("");
      setRole("clerk");
    } catch (error: any) {
      alert(error?.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto p-8 space-y-4">
      <h1 className="text-xl font-semibold">User Management</h1>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border p-2 w-full"
      />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2 w-full"
      />

      <input
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="border p-2 w-full"
      />

      <select
        value={role}
        onChange={(e) => setRole(e.target.value as "admin" | "clerk")}
        className="border p-2 w-full"
      >
        <option value="clerk">Clerk</option>
        <option value="admin">Admin</option>
      </select>

      <button
        onClick={createUser}
        disabled={loading}
        className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create User"}
      </button>
    </div>
  );
}
