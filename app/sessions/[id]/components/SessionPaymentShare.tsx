"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type SessionPlayer = {
  id: string;
  amount_paid: number | null;
  players: { name: string; mobile: string | null } | null;
};

type SessionPaymentData = {
  id: string;
  session_name: string;
  session_date: string;
  session_status: string | null;
  booking_amount: number | null;
  final_total_amount: number | null;
  final_amount_per_player: number | null;
  session_expenses: { id: string; description: string | null; amount: number | null }[];
  session_players: SessionPlayer[];
};

type Props = {
  sessionId: string;
  isAdmin: boolean;
  refreshKey?: number;
};

const QR_PATH = "/payment-qr.png";
const rupees = (n: number) => `₹${n.toFixed(2)}`;

function whatsappNumber(input: string | null | undefined): string {
  // Players in this Cricket Hub use Indian mobile numbers.
  const cleaned = (input ?? "").replace(/\D/g, "");
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) return `91${cleaned}`;
  if (cleaned.length === 12 && /^91[6-9]/.test(cleaned)) return cleaned;
  if (cleaned.length === 11 && cleaned.startsWith("0") && /^[6-9]/.test(cleaned.slice(1))) {
    return `91${cleaned.slice(1)}`;
  }
  return "";
}

function readableDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function SessionPaymentShare({ sessionId, isAdmin, refreshKey }: Props) {
  const [data, setData] = useState<SessionPaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [includePaid, setIncludePaid] = useState(false);
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [sharing, setSharing] = useState(false);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrImage, setQrImage] = useState<HTMLImageElement | null>(null);
  const [sharingPlayerId, setSharingPlayerId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAdmin || !sessionId) return;
    setLoading(true);
    setError("");
    const { data: result, error: queryError } = await supabase
      .from("sessions")
      .select(`
        id, session_name, session_date, session_status, booking_amount,
        final_total_amount, final_amount_per_player,
        session_expenses (id, description, amount),
        session_players (id, amount_paid, players (name, mobile))
      `)
      .eq("id", sessionId)
      .single();
    setLoading(false);
    if (queryError) {
      setData(null);
      setError(queryError.message);
      return;
    }
    setData(result as unknown as SessionPaymentData);
  }, [sessionId, isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => { setOpenedIds([]); }, [sessionId]);

  // Prepare the original QR before Share is pressed. iOS requires native share
  // to be called directly from the tap, rather than after awaiting fetch().
  useEffect(() => {
    let active = true;
    void fetch(QR_PATH)
      .then(response => {
        if (!response.ok) throw new Error("QR image not found");
        return response.blob();
      })
      .then(blob => {
        if (active) setQrFile(new File([blob], "Ittehaad-GooglePay-QR.png", { type: "image/png" }));
      })
      .catch(() => { if (active) setQrFile(null); });
    return () => { active = false; };
  }, []);

  // Load QR in advance so the personalised PNG is generated synchronously in
  // the user's click handler. Mobile native sharing requires user activation.
  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = () => { if (active) setQrImage(image); };
    image.onerror = () => { if (active) setQrImage(null); };
    image.src = QR_PATH;
    return () => { active = false; };
  }, []);

  // Recheck when returning to Cricket Hub after recording a payment in another tab.
  useEffect(() => {
    if (!isAdmin) return;
    function onFocus() { void refresh(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isAdmin, refresh]);

  const totals = useMemo(() => {
    const booking = Number(data?.booking_amount ?? 0);
    const expenses = (data?.session_expenses ?? []).reduce(
      (sum, item) => sum + Number(item.amount ?? 0), 0
    );
    const count = data?.session_players.length ?? 0;
    const ended = data?.session_status === "ended";
    const total = ended
      ? Number(data?.final_total_amount ?? booking + expenses)
      : booking + expenses;
    const share = ended
      ? Number(data?.final_amount_per_player ?? (count ? total / count : 0))
      : (count ? total / count : 0);
    const collected = (data?.session_players ?? []).reduce(
      (sum, p) => sum + Number(p.amount_paid ?? 0), 0
    );
    const pending = (data?.session_players ?? []).reduce(
      (sum, p) => sum + Math.max(0, Math.round((share - Number(p.amount_paid ?? 0)) * 100) / 100), 0
    );
    return { booking, expenses, count, total, share, collected, pending, ended };
  }, [data]);

  const qrUrl = "https://cricket-hub-olive.vercel.app/payment-qr.png";

  // Include real expense descriptions recorded under Session Finance.
  function expenseBreakdown(): string[] {
    if (!data) return [];
    const booking = totals.booking > 0 ? [`Turf: ${rupees(totals.booking)}`] : [];
    const extras = (data.session_expenses ?? [])
      .filter(item => Number(item.amount ?? 0) > 0)
      .map(item => `${(item.description ?? "Other expense").trim() || "Other expense"}: ${rupees(Number(item.amount))}`);
    return [...booking, ...extras];
  }

  function individualMessage(row: SessionPlayer): string {
    if (!data) return "";
    const paid = Number(row.amount_paid ?? 0);
    const due = Math.max(0, Math.round((totals.share - paid) * 100) / 100);
    const expenseLines = expenseBreakdown();
    return [
      `Hi ${row.players?.name || "Player"},`,
      `🏏 ${data.session_name} | ${readableDate(data.session_date)}`,
      ...expenseLines,
      `Total: ${rupees(totals.total)} / ${totals.count} players`,
      `${totals.ended ? "Share" : "Current share"}: ${rupees(totals.share)}`,
      `Paid: ${rupees(paid)} | *Due: ${rupees(due)}*`,
      due > 0 ? `Pay via Google Pay QR: ${qrUrl}` : "Payment complete — thank you!",
    ].join("\n");
  }

  function linkFor(row: SessionPlayer): string {
    const number = whatsappNumber(row.players?.mobile);
    return number ? `https://wa.me/${number}?text=${encodeURIComponent(individualMessage(row))}` : "";
  }

  // Create a complete payment card, not just a link. All essential amounts are
  // written on the image because a share target may drop the accompanying text.
  // toDataURL + atob are synchronous to preserve native-share user activation.
  function buildPlayerPaymentImage(row: SessionPlayer): File | null {
    if (!data || !qrImage) return null;

    const paid = Number(row.amount_paid ?? 0);
    const due = Math.max(0, Math.round((totals.share - paid) * 100) / 100);
    const expenses = expenseBreakdown();
    const visible = expenses.slice(0, 8);
    if (expenses.length > 8) visible.push(`+ ${expenses.length - 8} other expenses included in total`);

    const width = 1080;
    const lineHeight = 53;
    const listStart = 445;
    const summaryStart = listStart + visible.length * lineHeight + 44;
    const qrTop = summaryStart + 250;
    const qrWidth = 560;
    const qrHeight = qrWidth * qrImage.naturalHeight / qrImage.naturalWidth;
    const height = Math.ceil(qrTop + qrHeight + 90);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#065f46";
    ctx.fillRect(0, 0, width, 182);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 52px Arial, sans-serif";
    ctx.fillText("ITTEHAAD CRICKET", 65, 77);
    ctx.font = "30px Arial, sans-serif";
    ctx.fillText(`${data.session_name}  |  ${readableDate(data.session_date)}`.slice(0, 56), 66, 137);

    const playerName = (row.players?.name ?? "Player").trim();
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 44px Arial, sans-serif";
    ctx.fillText(`Hi ${playerName},`.slice(0, 40), 68, 257);
    ctx.font = "bold 64px Arial, sans-serif";
    ctx.fillStyle = "#047857";
    ctx.fillText(`Balance due: ${rupees(due)}`, 68, 339);

    ctx.font = "bold 30px Arial, sans-serif";
    ctx.fillStyle = "#334155";
    ctx.fillText("EXPENSE BREAKDOWN", 68, 411);
    ctx.font = "31px Arial, sans-serif";
    ctx.fillStyle = "#0f172a";
    visible.forEach((line, index) => {
      const maxWidth = width - 135;
      let fitted = line;
      while (fitted.length > 12 && ctx.measureText(fitted).width > maxWidth) {
        fitted = fitted.slice(0, -2);
      }
      if (fitted !== line) fitted += "…";
      ctx.fillText(fitted, 70, listStart + index * lineHeight);
    });

    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(68, summaryStart - 25, width - 136, 2);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 33px Arial, sans-serif";
    ctx.fillText(`Total: ${rupees(totals.total)}  /  ${totals.count} players`, 68, summaryStart + 32);
    ctx.fillText(`Your share: ${rupees(totals.share)}`, 68, summaryStart + 86);
    ctx.font = "31px Arial, sans-serif";
    ctx.fillText(`Already paid: ${rupees(paid)}`, 68, summaryStart + 139);
    ctx.fillStyle = "#047857";
    ctx.font = "bold 33px Arial, sans-serif";
    ctx.fillText(due > 0 ? "SCAN THE QR TO PAY" : "PAYMENT RECEIVED — THANK YOU", 68, summaryStart + 210);

    ctx.drawImage(qrImage, (width - qrWidth) / 2, qrTop, qrWidth, qrHeight);
    ctx.fillStyle = "#475569";
    ctx.font = "25px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Google Pay · Payment update", width / 2, height - 40);
    ctx.textAlign = "left";

    try {
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      const filename = `Ittehaad-Payment-${playerName.replace(/[^a-z0-9-]/gi, "-")}.png`;
      return new File([bytes], filename, { type: "image/png" });
    } catch {
      return null;
    }
  }

  function shareIndividualImage(row: SessionPlayer) {
    if (!data || sharingPlayerId) return;
    const image = buildPlayerPaymentImage(row);
    if (!image || typeof navigator.share !== "function" ||
        (typeof navigator.canShare === "function" && !navigator.canShare({ files: [image] }))) {
      alert("Image sharing is not supported here. Use a phone browser (Safari/Chrome), or the WhatsApp text button.");
      return;
    }
    // Must call share immediately from the button tap (not after an await).
    setSharingPlayerId(row.id);
    void navigator.share({
      title: "Ittehaad Cricket Payment",
      text: `Payment details for ${row.players?.name ?? "Player"}. The QR and amount due are on the image.`,
      files: [image],
    }).catch((err: unknown) => {
      if (!(err instanceof Error && err.name === "AbortError")) {
        alert("Could not share the image. Try the WhatsApp text button instead.");
      }
    }).finally(() => setSharingPlayerId(null));
  }

  const playerRows = useMemo(() => {
    if (!data) return [];
    return [...data.session_players].sort((a, b) =>
      (a.players?.name ?? "").localeCompare(b.players?.name ?? "")
    );
  }, [data]);

  const eligible = playerRows.filter(row => {
    const due = Math.max(0, totals.share - Number(row.amount_paid ?? 0));
    return (includePaid || due > 0.005) && Boolean(whatsappNumber(row.players?.mobile));
  });
  const firstUnopened = eligible.find(p => !openedIds.includes(p.id));
  const missingMobiles = playerRows.filter(p => !whatsappNumber(p.players?.mobile)).length;

  function groupMessage() {
    if (!data) return "";
    return [
      `🏏 ${data.session_name} | ${readableDate(data.session_date)}`,
      ...expenseBreakdown(),
      `Total: ${rupees(totals.total)} / ${totals.count} players`,
      `${totals.ended ? "Share" : "Current share"}: ${rupees(totals.share)}`, 
      `Collected: ${rupees(totals.collected)} | Pending: ${rupees(totals.pending)}`,
      `Google Pay QR: ${qrUrl}`,
    ].join("\n");
  }

  function shareGroup() {
    if (!data || totals.count === 0 || sharing) return;
    const text = groupMessage();
    // Important: native share executes inside the user's tap handler.
    if (qrFile && typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" || navigator.canShare({ files: [qrFile] }))) {
      setSharing(true);
      void navigator.share({ title: "Ittehaad Cricket Payment Update", text, files: [qrFile] })
        .catch((err: unknown) => {
          if (!(err instanceof Error && err.name === "AbortError")) {
            alert("Image sharing was not available. Please use the WhatsApp text link below.");
          }
        })
        .finally(() => setSharing(false));
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  if (!isAdmin) return null;

  return (
    <section className="mt-8 rounded-2xl border border-emerald-500/30 bg-slate-900 p-4 text-white sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold sm:text-2xl">📲 Send WhatsApp Payments</h2>
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300">
          {totals.ended ? "Final session" : "Session still open"}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-300">
        Only players registered for this session. Each receives their own share, amount paid and balance due.
      </p>

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-900/40 p-3 text-sm text-red-200">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-300">Loading latest payments…</p>}

      {data && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryBox title="Players" value={String(totals.count)} />
            <SummaryBox title="Total expenses" value={rupees(totals.total)} />
            <SummaryBox title="Each pays" value={rupees(totals.share)} />
            <SummaryBox title="Outstanding" value={rupees(totals.pending)} />
          </div>
          {!totals.ended && (
            <p className="mt-2 text-xs text-amber-300">Live calculation — changes if you add players, expenses or payments.</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void refresh()} disabled={loading}
              className="rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold disabled:opacity-50">
              ↻ Refresh amounts
            </button>
            <a href={QR_PATH} target="_blank" rel="noreferrer"
              className="rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold">View payment QR</a>
          </div>

          <div className="mt-4 rounded-xl bg-slate-950 p-3 sm:p-4">
            <h3 className="text-base font-bold">Individual WhatsApp reminders</h3>
            <p className="mt-1 text-xs text-slate-400">On your phone, tap Share QR + Details, choose WhatsApp and the correct player, then Send. The full expense breakdown and QR are inside the image. The Text option opens the saved mobile number directly.</p>
            <p className="mt-2 text-xs text-amber-200">Note: QR image sharing cannot automatically target a saved number. Select the correct person in WhatsApp. The other person can scan the QR or use Google Pay's image scanner where supported.</p>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={includePaid}
                onChange={e => { setIncludePaid(e.target.checked); setOpenedIds([]); }} />
              Include fully-paid players (payment confirmations)
            </label>
            <p className="mt-3 text-xs text-slate-300">
              {eligible.length} eligible · {missingMobiles} missing/invalid mobile · {openedIds.filter(id => eligible.some(p => p.id === id)).length} chats opened
            </p>

            {firstUnopened && (
              <a href={linkFor(firstUnopened)} target="_blank" rel="noopener noreferrer"
                onClick={() => setOpenedIds(previous => previous.includes(firstUnopened.id) ? previous : [...previous, firstUnopened.id])}
                className="mt-3 flex min-h-16 items-center justify-between rounded-xl bg-emerald-500 px-4 py-3 font-bold text-slate-950">
                <span>Next: {firstUnopened.players?.name}<span className="block text-xs font-normal">Direct chat (text only)</span></span>
                <span aria-hidden="true">↗</span>
              </a>
            )}

            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {playerRows.map(row => {
                const paid = Number(row.amount_paid ?? 0);
                const due = Math.max(0, Math.round((totals.share - paid) * 100) / 100);
                const link = linkFor(row);
                return (
                  <div key={row.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-800 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{row.players?.name || "Unknown player"}</p>
                      <p className="text-xs text-slate-300">Share {rupees(totals.share)} · Paid {rupees(paid)} · Due {rupees(due)}</p>
                      {openedIds.includes(row.id) && <p className="text-xs text-amber-300">Chat opened (not confirmed sent)</p>}
                      {!link && <p className="text-xs text-amber-300">Add this player's mobile number in Players</p>}
                    </div>
                    {(due > 0 || includePaid) && link ? (
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <button type="button" disabled={!qrImage || sharingPlayerId !== null}
                          onClick={() => shareIndividualImage(row)}
                          className="rounded-xl bg-emerald-500 px-3 py-3 text-xs font-bold text-slate-950 disabled:opacity-50">
                          {sharingPlayerId === row.id ? "Sharing…" : "Share QR + Details"}
                        </button>
                        <a href={link} target="_blank" rel="noopener noreferrer"
                          onClick={() => setOpenedIds(previous => previous.includes(row.id) ? previous : [...previous, row.id])}
                          className="rounded-xl border border-slate-500 px-3 py-3 text-center text-xs font-bold text-white">
                          Text
                        </a>
                      </div>
                    ) : due <= 0 && link ? (
                      <span className="shrink-0 rounded-lg bg-emerald-500/20 px-3 py-2 text-xs text-emerald-200">Paid</span>
                    ) : null}
                  </div>
                );
              })}
              {playerRows.length === 0 && <p className="py-3 text-sm text-slate-300">No players added to this session yet.</p>}
            </div>
            <button type="button" onClick={() => setOpenedIds([])}
              className="mt-3 text-xs text-slate-400 underline">Reset opened-chat markers</button>
          </div>

          <div className="mt-4 rounded-xl border border-slate-700 p-3 sm:p-4">
            <h3 className="text-base font-bold">Group payment update + QR</h3>
            <p className="mt-1 text-xs text-slate-400">The existing group-sharing option stays available.</p>
            <button type="button" disabled={sharing || loading || totals.count === 0} onClick={shareGroup}
              className="mt-3 w-full rounded-xl bg-slate-800 px-4 py-3 font-bold text-white disabled:opacity-50">
              {sharing ? "Opening sharing…" : "Share group update + QR"}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(groupMessage())}`} target="_blank" rel="noopener noreferrer"
              className="mt-3 inline-block text-sm text-slate-300 underline">
              WhatsApp text + QR link (alternative)
            </a>
          </div>
        </>
      )}
    </section>
  );
}

function SummaryBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-800 p-3">
      <p className="text-xs text-slate-400">{title}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}
