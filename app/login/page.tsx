"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 p-8 shadow-xl">
        <h1 className="text-3xl font-bold text-white">
          🏏 Cricket Hub
        </h1>

        <p className="mt-2 text-slate-400">
          Admin Login
        </p>

        <div className="mt-6">
          <label className="block text-sm mb-2">Email</label>

          <input
            className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
          />
        </div>

        <div className="mt-4">
          <label className="block text-sm mb-2">Password</label>

          <input
            type="password"
            className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
          />
        </div>

        <button
          onClick={login}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-green-500 py-3 font-bold text-black"
        >
          {loading ? "Signing In..." : "Login"}
        </button>
      </div>
    </main>
  );
}