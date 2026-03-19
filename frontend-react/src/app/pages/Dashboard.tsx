import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppShell } from "../state/AppShellContext";

export function Dashboard() {
  const { t } = useTranslation();
  const { bootstrap, user } = useAppShell();
  const summary = bootstrap?.summary;
  const activity = bootstrap?.auditLog || [];
  const applications = bootstrap?.publicApplications || [];

  const payoutTotal = useMemo(() => {
    return (bootstrap?.payouts || []).reduce((total, payout) => total + Number(payout.finalAmount || 0), 0);
  }, [bootstrap?.payouts]);

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-slate-900 mb-1">{t("dashboard.title")}</h1>
        <p className="text-sm text-slate-500 font-light">{t("dashboard.overview")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label={t("dashboard.activeCandidates")} value={String(summary?.candidates || 0)} change="" trend="up" />
        <StatCard label={t("dashboard.thisMonth")} value={String(summary?.kpiQualified || 0)} change="KPI" trend="up" />
        <StatCard label={t("dashboard.interviewsScheduled")} value={String(summary?.offers || 0)} change="offers" trend="up" />
        <StatCard label={t("dashboard.pendingPayouts")} value={`$${payoutTotal}`} change={user?.role === "owner" ? "all payouts" : "personal"} trend="up" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-slate-900">Последняя активность</h2>
            <span className="text-sm text-slate-500 font-light">{activity.length} событий</span>
          </div>
          <div className="space-y-4">
            {activity.length ? (
              activity.map((entry) => (
                <ActivityItem
                  key={entry.id}
                  type={entry.entityType || "candidate"}
                  title={`${entry.action || "UPDATE"} · ${entry.entityType || "entity"}`}
                  description={entry.details?.name || entry.details?.title || entry.entityId || "Изменение в системе"}
                  time={formatAuditTime(entry.createdAt)}
                />
              ))
            ) : (
              <div className="text-sm text-slate-500 font-light">Активность пока пуста</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/60 p-6">
          <h2 className="text-lg font-medium text-slate-900 mb-4">Быстрый обзор</h2>
          <div className="space-y-3 text-sm text-slate-600 font-light">
            <div className="flex items-center justify-between">
              <span>Новых уведомлений</span>
              <span className="font-medium text-slate-900">{bootstrap?.notifications?.length || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Задач в работе</span>
              <span className="font-medium text-slate-900">{bootstrap?.tasks?.length || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Обучение в ожидании</span>
              <span className="font-medium text-slate-900">{summary?.trainingPending || 0}</span>
            </div>
            {user?.role === "owner" ? (
              <div className="flex items-center justify-between">
                <span>Входящие заявки</span>
                <span className="font-medium text-slate-900">{applications.length}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  change,
  trend,
}: {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/60 p-5">
      <div className="text-sm text-slate-600 mb-2 font-light">{label}</div>
      <div className="flex items-end justify-between">
        <div className="text-2xl font-medium text-slate-900">{value}</div>
        {change ? <div className={`text-sm font-medium ${trend === "up" ? "text-emerald-600" : "text-rose-600"}`}>{change}</div> : null}
      </div>
    </div>
  );
}

function ActivityItem({ type, title, description, time }: { type: string; title: string; description: string; time: string }) {
  const colorMap: Record<string, string> = {
    candidate: "bg-blue-500",
    application: "bg-violet-500",
    payout: "bg-emerald-500",
    offer: "bg-amber-500",
    task: "bg-indigo-500",
    user: "bg-slate-500",
  };

  return (
    <div className="flex items-start gap-4">
      <div className={`w-2 h-2 rounded-full mt-2 ${colorMap[type] || "bg-slate-400"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4 mb-1">
          <p className="text-sm font-medium text-slate-900">{title}</p>
          <span className="text-xs text-slate-500 whitespace-nowrap font-light">{time}</span>
        </div>
        <p className="text-sm text-slate-600 font-light">{description}</p>
      </div>
    </div>
  );
}

function formatAuditTime(value?: string) {
  if (!value) return "Сейчас";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Сейчас";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
