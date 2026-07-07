import { supabase } from "../../../lib/supabase";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: session, error } = await supabase
    .from("sessions")
    .select(`
      *,
      turfs (*),
      session_players (
        *,
        players (*)
      ),
      matches (*)
    `)
    .eq("id", id)
    .single();

  if (error || !session) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <p>Session not found</p>
      </main>
    );
  }

  const playerCount = session.session_players?.length || 0;
  const perPlayer =
    playerCount > 0 ? Number(session.booking_amount) / playerCount : 0;

  const collected =
    session.session_players?.reduce(
      (sum: number, row: any) => sum + Number(row.amount_paid || 0),
      0
    ) || 0;

  const pending = Number(session.booking_amount) - collected;

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <a href="/sessions" className="text-sm text-slate-400">
          ← Back to Sessions
        </a>

        <h1 className="mt-4 text-4xl font-bold">🏏 {session.session_name}</h1>
        <p className="mt-2 text-slate-300">
          {session.session_date} • {session.turfs?.name}
        </p>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <Card label="Booking" value={`₹${session.booking_amount}`} />
          <Card label="Players" value={String(playerCount)} />
          <Card label="Per Player" value={`₹${perPlayer.toFixed(2)}`} />
          <Card label="Pending" value={`₹${pending.toFixed(2)}`} />
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">👥 Players & Payments</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="py-3">Player</th>
                  <th className="py-3">Paid</th>
                  <th className="py-3">Due</th>
                  <th className="py-3">Method</th>
                </tr>
              </thead>
              <tbody>
                {session.session_players?.map((row: any) => {
                  const paid = Number(row.amount_paid || 0);
                  const due = Math.max(perPlayer - paid, 0);

                  return (
                    <tr key={row.id} className="border-b border-slate-800">
                      <td className="py-3">{row.players?.name}</td>
                      <td className="py-3">₹{paid.toFixed(2)}</td>
                      <td className="py-3">₹{due.toFixed(2)}</td>
                      <td className="py-3">{row.payment_method || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">🏏 Matches</h2>
          {session.matches?.length === 0 && (
            <p className="mt-4 text-slate-400">No matches added yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}