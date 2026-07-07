import { supabase } from "../lib/supabase";

export default async function Home() {
  const { data: turfs, error } = await supabase
    .from("turfs")
    .select("*")
    .order("name");

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-4xl font-bold">🏏 Cricket Hub</h1>
        <p className="mt-2 text-slate-300">
          Turf booking, players, payments, matches and videos.
        </p>

        <section className="mt-8 rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Available Turfs</h2>

          {error && (
            <p className="mt-4 text-red-400">
              Error loading turfs: {error.message}
            </p>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {turfs?.map((turf) => (
              <div
                key={turf.id}
                className="rounded-xl border border-slate-700 bg-slate-800 p-4"
              >
                <h3 className="text-lg font-bold">{turf.name}</h3>
                <p className="text-sm text-slate-400">{turf.location}</p>
                <div className="mt-3 text-sm">
                  <p>☀️ Day: ₹{turf.day_rate_per_hour}/hour</p>
                  <p>🌙 Night: ₹{turf.night_rate_per_hour}/hour</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}