import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPaymentToken, type PaymentSnapshot } from "../../../lib/payment-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "kashifanisahmedbaksh3@gmail.com";
const LIVE_SITE = "https://cricket-hub-olive.vercel.app";
const asMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type JoinedSession = {
  id: string;
  session_name: string;
  session_date: string;
  session_status: string | null;
  booking_amount: number | null;
  final_total_amount: number | null;
  final_amount_per_player: number | null;
  session_expenses: { description: string | null; amount: number | null }[];
  session_players: { id: string; amount_paid: number | null; players: { name: string } | null }[];
};

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey || !process.env.PAYMENT_LINK_SECRET) {
      return NextResponse.json({ error: "Payment link configuration is missing on the server." }, { status: 503 });
    }
    const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return NextResponse.json({ error: "Please sign in as admin." }, { status: 401 });

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: auth, error: authError } = await authClient.auth.getUser(bearer);
    if (authError || auth.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Admin access only." }, { status: 403 });
    }

    const body: unknown = await request.json();
    const sessionId = (body && typeof body === "object" && "sessionId" in body)
      ? (body as { sessionId: unknown }).sessionId : null;
    if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
      return NextResponse.json({ error: "Invalid session ID." }, { status: 400 });
    }

    // Query as the signed-in admin, with the SAME RLS permissions used by the
    // existing SessionPaymentShare frontend. No service-role key is necessary.
    const db = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: fetched, error } = await db.from("sessions").select(`
      id, session_name, session_date, session_status,
      booking_amount, final_total_amount, final_amount_per_player,
      session_expenses (description, amount),
      session_players (id, amount_paid, players (name))
    `).eq("id", sessionId).single();
    if (error || !fetched) {
      return NextResponse.json({ error: error?.message || "Session not found." }, { status: 404 });
    }
    const session = fetched as unknown as JoinedSession;
    const booking = Number(session.booking_amount || 0);
    const extraTotal = session.session_expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const count = session.session_players.length;
    if (count === 0) return NextResponse.json({ links: {} });
    const total = session.session_status === "ended"
      ? Number(session.final_total_amount ?? (booking + extraTotal))
      : booking + extraTotal;
    const share = session.session_status === "ended"
      ? Number(session.final_amount_per_player ?? (total / count))
      : total / count;
    if (![total, share].every(Number.isFinite) || total < 0 || share < 0) {
      return NextResponse.json({ error: "Session amounts are invalid." }, { status: 422 });
    }

    const expenses = [
      ...(booking > 0 ? [{ label: "Turf", amount: asMoney(booking) }] : []),
      ...session.session_expenses
        .filter(e => Number(e.amount ?? 0) > 0)
        .slice(0, 25)
        .map(e => ({ label: (e.description || "Other expense").trim().slice(0, 90), amount: asMoney(Number(e.amount)) })),
    ];

    const now = Date.now();
    const links: Record<string, string> = {};
    for (const row of session.session_players) {
      const paid = asMoney(Number(row.amount_paid || 0));
      const snapshot: PaymentSnapshot = {
        v: 1,
        sessionId: session.id,
        sessionName: session.session_name,
        sessionDate: session.session_date,
        sessionPlayerId: row.id,
        playerName: row.players?.name || "Player",
        total: asMoney(total), playerCount: count,
        share: asMoney(share), paid,
        due: Math.max(0, asMoney(share - paid)),
        expenses,
        issuedAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      };
      const token = createPaymentToken(snapshot);
      links[row.id] = `${LIVE_SITE}/pay?t=${encodeURIComponent(token)}`;
    }
    return NextResponse.json({ links }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to prepare personal payment links", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to prepare payment links." }, { status: 500 });
  }
}
