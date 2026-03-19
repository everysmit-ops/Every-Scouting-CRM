import { useMemo } from "react";
import { useAppShell } from "../state/AppShellContext";

export function Analytics() {
  const { bootstrap, user } = useAppShell();
  const candidates = (bootstrap?.candidates || []) as Array<Record<string, any>>;
  const tasks = (bootstrap?.tasks || []) as Array<Record<string, any>>;
  const payouts = (bootstrap?.payouts || []) as Array<Record<string, any>>;
  const teams = (bootstrap?.teams || []) as Array<Record<string, any>>;
  const scoreboard = (bootstrap?.scoreboard || []) as Array<Record<string, any>>;

  const interviews = useMemo(
    () => candidates.filter((candidate) => ["interview", "twoShifts", "offer", "hired"].includes(String(candidate.status || ""))).length,
    [candidates],
  );
  const kpiQualified = useMemo(() => candidates.filter((candidate) => candidate.kpiQualified).length, [candidates]);
  const payoutTotal = useMemo(() => payouts.reduce((sum, payout) => sum + Number(payout.finalAmount || 0), 0), [payouts]);
  const completedTasks = useMemo(() => tasks.filter((task) => task.done).length, [tasks]);

  const topTeams = [...teams].sort((left, right) => Number(right.kpiPercent || 0) - Number(left.kpiPercent || 0)).slice(0, 4);
  const topPeople = [...scoreboard].slice(0, 5);

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-slate-900 mb-1">Analytics</h1>
        <p className="text-sm text-slate-500 font-light">
          {user?.role === "owner"
            ? "Глобальный срез по воронке, KPI и эффективности команд"
            : user?.role === "lead"
              ? "Аналитика по вашей команде, задачам и текущей конверсии"
              : "Личная аналитика по вашим кандидатам, KPI и выплатам"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="Кандидаты в воронке" value={String(candidates.length)} helper="Видимая вам CRM-выборка" />
        <StatCard label="Интервью и далее" value={String(interviews)} helper="Кандидаты после этапа screening" />
        <StatCard label="KPI-зачтено" value={String(kpiQualified)} helper="Интервью + регистрация + 2 смены" />
        <StatCard label="Payout value" value={`$${payoutTotal}`} helper={user?.role === "owner" ? "Вся доступная финансовая выборка" : "Ваш личный financial slice"} />
      </div>

      <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <section className="rounded-2xl bg-white border border-slate-200/60 p-6">
          <h2 className="text-lg font-medium text-slate-900 mb-5">Операционный срез</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <InsightCard title="Конверсия в KPI" value={`${candidates.length ? Math.round((kpiQualified / candidates.length) * 100) : 0}%`} text="Доля кандидатов, дошедших до KPI-статуса." />
            <InsightCard title="Выполнено задач" value={`${completedTasks}/${tasks.length || 0}`} text="Сколько задач закрыто в текущем scope." />
            <InsightCard title="Средний KPI команд" value={`${teams.length ? Math.round(teams.reduce((sum, team) => sum + Number(team.kpiPercent || 0), 0) / teams.length) : 0}%`} text="Средний результат по видимым командам." />
            <InsightCard title="Фокус текущего периода" value={user?.role === "owner" ? "Scale" : user?.role === "lead" ? "Team performance" : "Personal pipeline"} text="Контекст отображается по вашей роли." />
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-slate-200/60 p-6">
          <h2 className="text-lg font-medium text-slate-900 mb-4">Топ-команды</h2>
          <div className="space-y-4">
            {topTeams.length ? (
              topTeams.map((team) => (
                <div key={team.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{team.name}</p>
                      <p className="text-xs text-slate-500 font-light">{team.leadUser?.name || "Без тимлида"}</p>
                    </div>
                    <span className="text-sm font-medium text-slate-900">{team.kpiPercent || 0}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-500" style={{ width: `${Math.min(team.kpiPercent || 0, 100)}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 font-light">Командная аналитика появится после загрузки данных.</p>
            )}
          </div>
        </section>
      </div>

      {topPeople.length ? (
        <section className="rounded-2xl bg-white border border-slate-200/60 p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-slate-900">Рейтинг по KPI</h2>
            <span className="text-sm text-slate-500 font-light">{topPeople.length} участников</span>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            {topPeople.map((person, index) => (
              <div key={person.id} className="rounded-xl border border-slate-200/60 p-4 bg-slate-50/70 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">{index + 1}. {person.name}</p>
                  <p className="text-sm text-slate-500 font-light">
                    {person.role} · KPI-зачтено: {person.qualified}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-medium text-slate-900">{person.kpiScore}%</p>
                  <p className="text-xs text-slate-500 font-light">Boost {person.payoutBoost || "0%"}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/60 p-5">
      <p className="text-sm text-slate-600 mb-2 font-light">{label}</p>
      <p className="text-2xl font-medium text-slate-900 mb-2">{value}</p>
      <p className="text-sm text-slate-500 font-light">{helper}</p>
    </div>
  );
}

function InsightCard({ title, value, text }: { title: string; value: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 p-5">
      <p className="text-sm text-slate-500 mb-2 font-light">{title}</p>
      <p className="text-2xl font-medium text-slate-900 mb-2">{value}</p>
      <p className="text-sm text-slate-600 font-light">{text}</p>
    </div>
  );
}
