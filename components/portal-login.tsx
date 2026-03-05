"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function PortalLogin({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = supabaseBrowser();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message || "Invalid email or password.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <form onSubmit={handleSubmit} className="grid gap-[0.65rem]">
      <label className="text-[0.9rem] text-slate-300" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Email"
        autoComplete="email"
        className="w-full rounded-[8px] border border-slate-600 bg-slate-900 px-3 py-[0.65rem] text-base text-slate-100 focus:border-slate-500 focus:outline-slate-500 focus:outline-2 focus:outline-offset-0"
        required
      />

      <label className="text-[0.9rem] text-slate-300" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        className="w-full rounded-[8px] border border-slate-600 bg-slate-900 px-3 py-[0.65rem] text-base text-slate-100 focus:border-slate-500 focus:outline-slate-500 focus:outline-2 focus:outline-offset-0"
        required
      />

      {error ? <p className="mb-0 mt-[0.1rem] text-[0.88rem] text-[#b42318]">{error}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="mt-[0.45rem] rounded-[8px] border-0 bg-[#111] p-[0.7rem] text-[0.98rem] font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );

  if (embedded) return form;

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-slate-900 to-slate-950 p-6">
      <section className="grid w-full max-w-[440px] gap-[1.2rem] rounded-[14px] border border-slate-700 bg-slate-800 p-8 shadow-[0_8px_30px_rgba(0,0,0,0.25)] max-[480px]:p-[1.35rem]">
        <a
          href="https://antaresshipping.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visit Antares Shipping website"
        >
          <img
            src="https://antaresshipping.com/wp-content/uploads/2023/12/Antares-Ship-Agent.webp"
            alt="Antares Ship Agency logo"
            className="mx-auto block h-auto w-[min(325px,125%)] max-w-full"
          />
        </a>

        <p className="m-0 text-[0.96rem] leading-[1.5] text-slate-300">
          This is the Antares Operations Team intraweb Apps Manager. For full company information,
          please visit our website.
        </p>

        {form}
      </section>
    </main>
  );
}

