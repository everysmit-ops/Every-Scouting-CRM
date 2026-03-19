import { useMemo, useState } from "react";
import { updatePayoutRequest } from "../../lib/api";
import { useAppShell } from "../state/AppShellContext";

export function Finance() {
  const { bootstrap, user, token, refreshBootstrap } = useAppShell();
  const payouts = (bootstrap?.payouts || []) as Array<Record<string, any>>;
  const [savingId, setSavingId] = useState<string | null>(null);
  const totals = useMemo(() => {
    return payouts.reduce(
      (acc, payout) => {
        const amount = Number(payout.finalAmount || 0);
        acc.total += amount;
        acc[payout.status || "pending"] = (acc[payout.status || "pending"] || 0) + amount;
        return acc;
      },
      { total: 0, pending: 0, approved: 0, paid: 0 } as Record<string, number>,
    );
  }, [payouts]);

  async function handleStatusUpdate(payoutId: string, status: "approved" | "paid") {
    if (!token) return;
    setSavingId(payoutId);
    try {
      await updatePayoutRequest(token, payoutId, status);
      await refreshBootstrap();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-slate-900 mb-1">Finance</h1>
        <p className="text-sm text-slate-500 font-light">
          {user?.role === "owner" ? "Все выплаты и финансовые статусы команды" : "Ваши доходы и выплаты"}
        </p>
      </div>

      <div className="mb-8">
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 text-white">
          <div className="flex items-start justify-between mb-12">
            <div>
              <p className="text-sm text-slate-300 mb-2 font-light">Total Balance</p>
              <div className="text-5xl font-light mb-1">${totals.total}</div>
              <p className="text-sm text-emerald-400 font-medium">{payouts.length} payout records</p>
            </div>
            <button className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors backdrop-blur-sm">
              {user?.role === "owner" ? "Review Payouts" : "Request Payout"}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-slate-400 mb-1 font-light">PENDING</p>
              <p className="text-xl font-medium">${totals.pending}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1 font-light">APPROVED</p>
              <p className="text-xl font-medium">${totals.approved}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1 font-light">PAID</p>
              <p className="text-xl font-medium">${totals.paid}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200/60 overflow-hidden">
        <div className="p-6 border-b border-slate-200/60">
          <h2 className="text-lg font-medium text-slate-900">Recent Payouts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600">DATE</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600">CANDIDATE</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600">SCOUT</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600">AMOUNT</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payouts.length ? (
                payouts.map((payout) => (
                  <tr className="hover:bg-slate-50" key={payout.id}>
                    <td className="px-6 py-4 text-sm text-slate-600 font-light">{formatFinanceDate(payout.createdAt)}</td>
                    <td className="px-6 py-4 text-sm text-slate-900">{payout.candidateId}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{payout.scoutId}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900 text-right">${Number(payout.finalAmount || 0)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusClass(payout.status)}`}>
                          {String(payout.status || "pending")}
                        </span>
                        {user?.role === "owner" && payout.status !== "paid" ? (
                          <button
                            onClick={() => handleStatusUpdate(payout.id, payout.status === "pending" ? "approved" : "paid")}
                            disabled={savingId === payout.id}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
                          >
                            {savingId === payout.id ? "..." : payout.status === "pending" ? "Approve" : "Mark paid"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-6 py-6 text-sm text-slate-500 font-light" colSpan={5}>
                    Payouts will appear here once KPI-qualified candidates are available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function statusClass(status?: string) {
  if (status === "paid") return "bg-green-100 text-green-700";
  if (status === "approved") return "bg-emerald-100 text-emerald-700";
  return "bg-amber-100 text-amber-700";
}

function formatFinanceDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}
