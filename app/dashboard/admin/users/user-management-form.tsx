"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type ManagedUser = {
  id: string;
  email: string;
  username: string;
  role: "admin" | "clerk" | string;
};

export default function UserManagementForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"admin" | "clerk">("clerk");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [actionLoadingUserId, setActionLoadingUserId] = useState<string | null>(null);

  async function getToken() {
    const supabase = supabaseBrowser();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Unauthorized");
    return token;
  }

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/users/list", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load users");
      }
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (error: any) {
      alert(error?.message || "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function createUser() {
    setLoading(true);
    try {
      const token = await getToken();

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
      await loadUsers();
    } catch (error: any) {
      alert(error?.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(userId: string, userEmail: string) {
    const newPassword = prompt(`Set a new password for ${userEmail}:`);
    if (!newPassword) return;

    setActionLoadingUserId(userId);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          password: newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to reset password");
      }
      alert(`Password reset for ${userEmail}`);
    } catch (error: any) {
      alert(error?.message || "Failed to reset password");
    } finally {
      setActionLoadingUserId(null);
    }
  }

  async function disableUser(userId: string, userEmail: string) {
    const confirmed = confirm(`Disable login for ${userEmail}?`);
    if (!confirmed) return;

    setActionLoadingUserId(userId);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/users/disable", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to disable user");
      }
      alert(`${userEmail} disabled`);
      await loadUsers();
    } catch (error: any) {
      alert(error?.message || "Failed to disable user");
    } finally {
      setActionLoadingUserId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-8 space-y-8">
      <h1 className="text-2xl font-semibold">User Management</h1>

      <section className="space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Create User</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border p-2 w-full rounded"
          />

          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border p-2 w-full rounded"
          />

          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border p-2 w-full rounded"
          />

          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "clerk")}
            className="border p-2 w-full rounded"
          >
            <option value="clerk">Clerk</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <button
          onClick={createUser}
          disabled={loading}
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create User"}
        </button>
      </section>

      <section className="space-y-3 rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">User List</h2>
          <button
            type="button"
            onClick={loadUsers}
            disabled={loadingUsers}
            className="border px-3 py-1 rounded text-sm disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {loadingUsers ? (
          <p className="text-sm text-zinc-500">Loading users...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-2 border-b">Email</th>
                  <th className="text-left p-2 border-b">Username</th>
                  <th className="text-left p-2 border-b">Role</th>
                  <th className="text-left p-2 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b">
                    <td className="p-2">{u.email || "-"}</td>
                    <td className="p-2">{u.username || "-"}</td>
                    <td className="p-2 capitalize">{u.role || "clerk"}</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={actionLoadingUserId === u.id}
                          onClick={() => resetPassword(u.id, u.email)}
                          className="px-2 py-1 rounded border text-xs hover:bg-gray-50 disabled:opacity-50"
                        >
                          Reset Password
                        </button>
                        <button
                          type="button"
                          disabled={actionLoadingUserId === u.id}
                          onClick={() => disableUser(u.id, u.email)}
                          className="px-2 py-1 rounded border border-red-300 text-red-700 text-xs hover:bg-red-50 disabled:opacity-50"
                        >
                          Disable User
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-3 text-center text-zinc-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
