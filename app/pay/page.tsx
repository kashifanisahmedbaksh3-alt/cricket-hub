import { parsePaymentToken } from "../../lib/payment-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Ittehaad Cricket — Pay Your Share",
  robots: { index: false, follow: false },
};

const UPI_ID = "kasaq06-7@oksbi"; // Decoded from the Google Pay QR provided by the organizer.
const PAYEE_NAME = "Kashif Baksh";
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);

export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.t === "string" ? params.t : "";
  const details = token ? parsePaymentToken(token) : null;

  if (!details) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-16 text-white">
        <div className="mx-auto max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 text-center">
          <h1 className="text-2xl font-bold">Payment link unavailable</h1>
          <p className="mt-3 text-slate-300">This link has expired or is invalid. Please ask the cricket organiser for a fresh payment link.</p>
        </div>
      </main>
    );
  }

  const upiUrl = new URL("upi://pay");
  upiUrl.searchParams.set("pa", UPI_ID);
  upiUrl.searchParams.set("pn", PAYEE_NAME);
  upiUrl.searchParams.set("am", details.due.toFixed(2));
  upiUrl.searchParams.set("cu", "INR");
  upiUrl.searchParams.set("tn", `Ittehaad Cricket ${details.sessionDate}`);

  const sessionDate = new Date(`${details.sessionDate}T00:00:00`);
  const date = Number.isNaN(sessionDate.getTime()) ? details.sessionDate
    : sessionDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-7 text-white">
      <div className="mx-auto max-w-lg space-y-4">
        <header className="text-center">
          <div className="text-4xl">🏏</div>
          <h1 className="mt-2 text-2xl font-extrabold">Ittehaad Cricket</h1>
          <p className="mt-1 text-sm text-slate-300">Your personal payment details</p>
        </header>

        <section className="rounded-3xl border border-emerald-500/40 bg-slate-900 p-5 shadow-xl">
          <p className="text-sm text-slate-300">Hi {details.playerName},</p>
          <p className="mt-1 text-base font-semibold">{details.sessionName} · {date}</p>
          <div className="mt-5 rounded-2xl bg-emerald-500/10 px-4 py-5 text-center">
            <p className="text-sm text-emerald-200">Balance to pay</p>
            <p className="mt-1 text-4xl font-extrabold text-emerald-300">{money(details.due)}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-800 p-3"><p className="text-slate-400">Your share</p><p className="mt-1 text-lg font-semibold">{money(details.share)}</p></div>
            <div className="rounded-xl bg-slate-800 p-3"><p className="text-slate-400">Already paid</p><p className="mt-1 text-lg font-semibold">{money(details.paid)}</p></div>
          </div>
          <details className="mt-4 rounded-xl bg-slate-800 p-3 text-sm">
            <summary className="cursor-pointer font-semibold">View session expense breakdown</summary>
            <div className="mt-3 space-y-2 text-slate-300">
              {details.expenses.map((expense, i) => (
                <div key={`${expense.label}-${i}`} className="flex items-start justify-between gap-3"><span>{expense.label}</span><span className="shrink-0">{money(expense.amount)}</span></div>
              ))}
              <div className="mt-2 flex justify-between border-t border-slate-600 pt-2 font-semibold text-white"><span>Total · {details.playerCount} players</span><span>{money(details.total)}</span></div>
            </div>
          </details>
        </section>

        {details.due > 0 ? (
          <section className="rounded-3xl bg-white p-4 text-center text-slate-900">
            <h2 className="text-xl font-bold">Pay using Google Pay or any UPI app</h2>
            <a href={upiUrl.toString()} className="mt-4 block rounded-2xl bg-emerald-600 px-4 py-4 text-lg font-bold text-white">
              Pay {money(details.due)} via UPI
            </a>
            <p className="mt-2 text-xs text-slate-600">On your phone, tap the button and choose a UPI app. Check the recipient and amount before confirming.</p>
            <p className="mt-5 text-sm font-bold">Or scan this Google Pay QR</p>
            {/* Intentionally use the original, unmodified QR uploaded by the organiser. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/payment-qr.png" width={540} height={750} alt="Google Pay QR for Kashif Baksh" className="mx-auto mt-3 h-auto w-full max-w-xs rounded-xl" />
            <p className="mt-2 text-xs text-slate-600">If you scan the QR, enter {money(details.due)} manually. On the same phone, use the UPI button above.</p>
            <p className="mt-2 select-all break-all text-xs text-slate-600">UPI ID: {UPI_ID}</p>
          </section>
        ) : (
          <section className="rounded-2xl bg-emerald-900/30 p-5 text-center text-emerald-200">No balance due. Thank you!</section>
        )}
        <p className="px-2 text-center text-xs leading-relaxed text-slate-400">
          Amounts are a snapshot from when this reminder was prepared. If expenses or payments changed afterward, ask the organiser for an updated link. Paying through UPI does not automatically mark your Cricket Hub payment as received.
        </p>
      </div>
    </main>
  );
}
