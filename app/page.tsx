import Link from "next/link";
import { supabase } from "../lib/supabase";
import { getCurrentUser } from "../lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();

  const { data: sessions } = await supabase
    .from("sessions")
    .select(`
      *,
      turfs (*),
      session_players (*),
      session_votes (*),
      matches (*)
    `)
    .order("session_date", { ascending: true });

  const allSessions = sessions || [];
  const today = new Date().toISOString().slice(0, 10);

  const upcomingSessions = allSessions.filter(
    (session: any) => session.session_date >= today
  );

  const pastSessions = allSessions.filter(
    (session: any) => session.session_date < today
  );

  const mainSession =
    upcomingSessions[0] ||
    [...pastSessions].sort((a: any, b: any) =>
      b.session_date.localeCompare(a.session_date)
    )[0];

  const liveVotingSession =
    upcomingSessions.find(
      (session: any) =>
        session.voting_enabled === true &&
        session.voting_status === "open"
    ) || null;

  const isUpcoming = mainSession?.session_date >= today;

  const playerCount = mainSession?.session_players?.length || 0;
  const booking = Number(mainSession?.booking_amount || 0);

  const collected =
    mainSession?.session_players?.reduce(
      (sum: number, player: any) =>
        sum + Number(player.amount_paid || 0),
      0
    ) || 0;

  const pending = Math.max(booking - collected, 0);
  const perPlayer = playerCount > 0 ? booking / playerCount : 0;

  const recentSessions = [...allSessions]
    .sort((a: any, b: any) =>
      b.session_date.localeCompare(a.session_date)
    )
    .slice(0, 5);

  // The newest session by DATE (not creation time), used for homepage team preview.
  const latestSession = recentSessions[0] || null;
  const { data: latestTeamRows } = latestSession
    ? await supabase.from("session_team_players")
        .select("team_side").eq("session_id", latestSession.id)
    : { data: [] as { team_side: string }[] };
  const latestTeamA = (latestTeamRows || []).filter(row => row.team_side === "A").length;
  const latestTeamB = (latestTeamRows || []).filter(row => row.team_side === "B").length;

  const confirmedVotes =
    liveVotingSession?.session_votes?.filter(
      (vote: any) => vote.vote === "yes"
    ).length || 0;

  const { count: activePlayerCount } = await supabase
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  const waitingVotes = Math.max(
    Number(activePlayerCount || 0) - confirmedVotes,
    0
  );

  const votingPercent =
    Number(activePlayerCount || 0) > 0
      ? Math.round(
          (confirmedVotes / Number(activePlayerCount || 0)) * 100
        )
      : 0;

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold">🏏 Cricket Hub</h1>
        <p className="mt-2 text-slate-300">
          Your Sunday cricket control center.
        </p>

        <div className="mt-4 rounded-2xl bg-slate-900 p-4">
          {user ? (
            <p className="text-green-300">
              👑 Admin logged in: {user.email}
            </p>
          ) : (
            <Link href="/login" className="text-slate-300 underline">
              Admin login
            </Link>
          )}
        </div>

        {/* Mobile-first: one-tap access to Sunday's most used tools. */}
        <section className="mt-5 space-y-3">
          <Link href="/scorer"
            className="flex min-h-20 items-center justify-between gap-3 rounded-2xl bg-green-500 px-5 py-4 text-slate-950 shadow-lg active:scale-[0.99]">
            <span><span className="block text-xl font-extrabold">⚡ Quick Scorer</span>
              <span className="mt-1 block text-sm font-medium">Open latest session • Fast ball-by-ball scoring</span></span>
            <span className="text-2xl">→</span>
          </Link>
          <Link href="/team-balancer"
            className="flex min-h-20 items-center justify-between gap-3 rounded-2xl bg-blue-600 px-5 py-4 text-white shadow-lg active:scale-[0.99]">
            <span><span className="block text-xl font-extrabold">⚖️ Auto Team Balancer</span>
              <span className="mt-1 block text-sm text-blue-100">
                {latestSession ? `${latestSession.session_date} • ${latestSession.session_name}` : "Choose a session"}
              </span>
              {latestSession && <span className="mt-1 block text-xs text-blue-100">
                {latestTeamA + latestTeamB > 0
                  ? `${latestSession.team_a_name || "Team A"}: ${latestTeamA} · ${latestSession.team_b_name || "Team B"}: ${latestTeamB}`
                  : "Teams not assigned yet — tap to generate"}
              </span>}
            </span><span className="text-2xl">→</span>
          </Link>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/player-ratings" className="rounded-2xl bg-slate-900 px-4 py-4 text-sm font-bold">⭐ Player Ratings
              <span className="mt-1 block text-xs font-normal text-slate-400">Edit or add players</span>
            </Link>
            <Link href="/team-history" className="rounded-2xl bg-slate-900 px-4 py-4 text-sm font-bold">📅 Team History
              <span className="mt-1 block text-xs font-normal text-slate-400">Players by session date</span>
            </Link>
          </div>
        </section>
{/* Auto Team Balancer + Ratings/History: mobile shortcuts */}
<section className="mt-4 space-y-3">
  <Link href="/team-balancer"
    className="flex min-h-20 items-center justify-between rounded-2xl bg-blue-600 px-5 py-4 text-white active:scale-[0.99]">
    <span>
      <span className="block text-xl font-extrabold">⚖️ Auto Team Balancer</span>
      <span className="mt-1 block text-sm text-blue-100">
        {recentSessions[0]
          ? `Latest: ${recentSessions[0].session_date} — ${recentSessions[0].session_name}`
          : "Choose a session"}
      </span>
    </span>
    <span className="text-2xl">→</span>
  </Link>
  <div className="grid grid-cols-2 gap-3">
    <Link href="/player-ratings"
      className="rounded-2xl bg-slate-900 px-4 py-4 text-sm font-bold">
      ⭐ Player Ratings
      <span className="mt-1 block text-xs font-normal text-slate-400">Edit and add players</span>
    </Link>
    <Link href="/team-history"
      className="rounded-2xl bg-slate-900 px-4 py-4 text-sm font-bold">
      📅 Team History
      <span className="mt-1 block text-xs font-normal text-slate-400">Teams by date</span>
    </Link>
  </div>
</section>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          <DashboardLink href="/players" icon="👥" title="Players" />
          <DashboardLink href="/sessions" icon="📅" title="Sessions" />
          <DashboardLink href="/payments" icon="💰" title="Payments" />

          <DashboardLink
            href={
              mainSession
                ? `/sessions/${mainSession.id}`
                : "/sessions"
            }
            icon="🏏"
            title="Matches"
          />

          <DashboardLink href="/videos" icon="📹" title="Videos" />
          <DashboardLink
            href="/statistics"
            icon="📊"
            title="Statistics"
          />
          <DashboardLink href="/captains" icon="👑" title="Captains" />
          <DashboardLink
            href="/ai-umpire-v2"
            icon="🤖"
            title="AI Match Centre"
          />

          <DashboardLink
            href={
              liveVotingSession
                ? `/vote/${liveVotingSession.id}`
                : "/sessions"
            }
            icon="🗳️"
            title="Live Voting"
            subtitle={
              liveVotingSession
                ? `${confirmedVotes} confirmed`
                : "No open vote"
            }
          />

          <DashboardLink
            href="/reports/voting"
            icon="📈"
            title="Voting Reports"
          />

          <DashboardLink
            href="/reports/finance"
            icon="💹"
            title="Finance Reports"
          />
        </div>

        {liveVotingSession && (
          <section className="mt-8 overflow-hidden rounded-3xl border border-green-500/30 bg-slate-900">
            <div className="bg-gradient-to-r from-green-500/15 to-blue-500/10 p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-green-300">
                    Live Voting
                  </p>

                  <h2 className="mt-2 text-3xl font-black">
                    {liveVotingSession.session_name}
                  </h2>

                  <p className="mt-2 text-slate-300">
                    📅 {liveVotingSession.session_date} • 📍{" "}
                    {liveVotingSession.turfs?.name ||
                      "Venue to be confirmed"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/vote/${liveVotingSession.id}`}
                    className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950"
                  >
                    Open Live Voting
                  </Link>

                  <Link
                    href="/reports/voting"
                    className="rounded-xl border border-slate-500 px-5 py-3 text-slate-200"
                  >
                    View Voting Report
                  </Link>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-[220px_1fr]">
                <div className="flex justify-center">
                  <div
                    className="relative flex h-44 w-44 items-center justify-center rounded-full"
                    style={{
                      background: `conic-gradient(#22c55e 0 ${votingPercent}%, #334155 ${votingPercent}% 100%)`,
                    }}
                  >
                    <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-slate-900">
                      <span className="text-4xl font-black">
                        {confirmedVotes}
                      </span>
                      <span className="text-sm text-slate-400">
                        confirmed
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-sm text-slate-400">
                        Voting Progress
                      </p>
                      <p className="mt-1 text-3xl font-black">
                        {confirmedVotes} / {activePlayerCount || 0}
                      </p>
                    </div>

                    <p className="text-2xl font-black text-green-300">
                      {votingPercent}%
                    </p>
                  </div>

                  <div className="mt-5 h-5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-green-500"
                      style={{ width: `${votingPercent}%` }}
                    />
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <MiniCard
                      label="Confirmed"
                      value={String(confirmedVotes)}
                    />
                    <MiniCard
                      label="Waiting"
                      value={String(waitingVotes)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {mainSession ? (
          <section className="mt-8 rounded-3xl bg-slate-900 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm text-slate-400">
                  {isUpcoming ? "Upcoming Session" : "Latest Session"}
                </p>

                <h2 className="mt-2 text-3xl font-bold">
                  {mainSession.session_name}
                </h2>

                <p className="mt-2 text-slate-300">
                  📅 {mainSession.session_date} • 📍{" "}
                  {mainSession.turfs?.name}
                </p>

                <p className="mt-1 text-slate-400">
                  {mainSession.booking_type === "night"
                    ? "🌙 Night"
                    : "☀️ Day"}{" "}
                  • {mainSession.hours_booked} hours •{" "}
                  {mainSession.overs_per_match} overs
                </p>
              </div>

              <Link
                href={`/sessions/${mainSession.id}`}
                className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950"
              >
                Open Session
              </Link>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-5">
              <Card
                label="Booking"
                value={`₹${booking.toFixed(2)}`}
              />
              <Card label="Players" value={String(playerCount)} />
              <Card
                label="Each Pays"
                value={`₹${perPlayer.toFixed(2)}`}
              />
              <Card
                label="Collected"
                value={`₹${collected.toFixed(2)}`}
              />
              <Card
                label="Pending"
                value={`₹${pending.toFixed(2)}`}
              />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <MiniCard
                label="Captain / Team A"
                value={mainSession.captain_a || "-"}
              />
              <MiniCard
                label="Captain / Team B"
                value={mainSession.captain_b || "-"}
              />
              <MiniCard
                label="Matches Added"
                value={String(mainSession.matches?.length || 0)}
              />
            </div>
          </section>
        ) : (
          <section className="mt-8 rounded-3xl bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">No sessions yet</h2>
            <p className="mt-2 text-slate-400">
              Create your first Sunday cricket session.
            </p>

            <Link
              href="/sessions"
              className="mt-5 inline-block rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950"
            >
              Create Session
            </Link>
          </section>
        )}

        <section className="mt-8 rounded-3xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Recent Sessions</h2>

          <div className="mt-4 space-y-3">
            {recentSessions.map((session: any) => (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="block rounded-2xl border border-slate-700 bg-slate-800 p-4 hover:bg-slate-700"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-bold">
                      {session.session_name}
                    </h3>

                    <p className="text-sm text-slate-400">
                      {session.session_date} •{" "}
                      {session.turfs?.name}
                    </p>
                  </div>

                  <div className="text-sm text-slate-300">
                    👥 {session.session_players?.length || 0} players •
                    🏏 {session.matches?.length || 0} matches
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

function DashboardLink({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl bg-slate-900 p-5 hover:bg-slate-800"
    >
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 font-bold">{title}</div>
      {subtitle && (
        <div className="mt-1 text-xs text-slate-400">
          {subtitle}
        </div>
      )}
    </Link>
  );
}

function Card({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-800 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function MiniCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}
