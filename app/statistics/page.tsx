import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default async function StatisticsPage() {
  const { data: sessions } = await supabase
    .from("sessions")
    .select(`
      *,
      turfs (*),
      session_players (*),
      matches (*)
    `)
    .order("session_date", { ascending: false });

  const allSessions = sessions || [];

  const totalSessions = allSessions.length;
  const totalMatches = allSessions.reduce(
    (sum: number, session: any) => sum + (session.matches?.length || 0),
    0
  );

  const totalPlayersMarked = allSessions.reduce(
    (sum: number, session: any) => sum + (session.session_players?.length || 0),
    0
  );

  const totalBooking = allSessions.reduce(
    (sum: number, session: any) => sum + Number(session.booking_amount || 0),
    0
  );

  const totalCollected = allSessions.reduce((sum: number, session: any) => {
    const collected =
      session.session_players?.reduce(
        (pSum: number, player: any) => pSum + Number(player.amount_paid || 0),
        0
      ) || 0;

    return sum + collected;
  }, 0);

  const totalVideos = allSessions.reduce((sum: number, session: any) => {
    const videos =
      session.matches?.filter((match: any) => match.youtube_video_id).length ||
      0;
    return sum + videos;
  }, 0);

  const winnerCounts: Record<string, number> = {};

  allSessions.forEach((session: any) => {
    session.matches?.forEach((match: any) => {
      if (match.winner) {
        winnerCounts[match.winner] = (winnerCounts[match.winner] || 0) + 1;
      }
    });
  });

  const winnerTable = Object.entries(winnerCounts).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm text-slate-400">
          ← Back to Dashboard
        </Link>

        <h1 className="mt-4 text-4xl font-bold">📊 Statistics</h1>
        <p className="mt-2 text-slate-300">
          Overall cricket summary from all saved sessions.
        </p>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <Card label="Sessions" value={String(totalSessions)} />
          <Card label="Matches" value={String(totalMatches)} />
          <Card label="Player Entries" value={String(totalPlayersMarked)} />
          <Card label="Videos" value={String(totalVideos)} />
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-3">
          <Card label="Total Booking" value={`₹${totalBooking.toFixed(2)}`} />
          <Card label="Collected" value={`₹${totalCollected.toFixed(2)}`} />
          <Card
            label="Pending"
            value={`₹${(totalBooking - totalCollected).toFixed(2)}`}
          />
        </section>

        <section className="mt-8 rounded-3xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">🏆 Winner Leaderboard</h2>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300">
                  <th className="py-3">Rank</th>
                  <th className="py-3">Team / Winner</th>
                  <th className="py-3">Wins</th>
                </tr>
              </thead>

              <tbody>
                {winnerTable.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-slate-400">
                      No winners recorded yet.
                    </td>
                  </tr>
                )}

                {winnerTable.map(([winner, wins], index) => (
                  <tr key={winner} className="border-b border-slate-800">
                    <td className="py-3">#{index + 1}</td>
                    <td className="py-3 font-semibold">{winner}</td>
                    <td className="py-3">{wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Recent Sessions</h2>

          <div className="mt-5 space-y-3">
            {allSessions.slice(0, 8).map((session: any) => (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="block rounded-2xl border border-slate-700 bg-slate-800 p-4 hover:bg-slate-700"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-bold">{session.session_name}</h3>
                    <p className="text-sm text-slate-400">
                      {session.session_date} • {session.turfs?.name}
                    </p>
                  </div>

                  <div className="text-sm text-slate-300">
                    👥 {session.session_players?.length || 0} players • 🏏{" "}
                    {session.matches?.length || 0} matches
                  </div>
                </div>
              </Link>
            ))}
          </div>
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