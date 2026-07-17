"use client";

import Link from "next/link";

export default function VotingDisabledPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
        <div className="w-full rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
          <div className="mb-5 text-6xl">🚧</div>

          <h1 className="text-3xl font-bold">Voting Temporarily Disabled</h1>

          <p className="mt-4 text-slate-300">
            The Cricket Hub voting feature is currently unavailable.
          </p>

          <p className="mt-2 text-sm text-slate-400">
            Voting will return in a future update.
          </p>

          <Link
            href="/"
            className="mt-8 inline-flex rounded-xl bg-white px-6 py-3 font-semibold text-slate-950 transition hover:bg-slate-200"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </main>
  );
}