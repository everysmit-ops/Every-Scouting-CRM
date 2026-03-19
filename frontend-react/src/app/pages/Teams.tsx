import { useMemo } from "react";
import { useAppShell } from "../state/AppShellContext";

export function Teams() {
  const { bootstrap, user } = useAppShell();
  const teams = (bootstrap?.teams || []) as Array<Record<string, any>>;
  const tasks = (bootstrap?.tasks || []) as Array<Record<string, any>>;
  const candidates = (bootstrap?.candidates || []) as Array<Record<string, any>>;

  const teamCards = useMemo(
    () =>
      teams.map((team) => {
        const teamTasks = tasks.filter((task) => task.team?.id === team.id || task.teamId === team.id);
        const teamCandidates = candidates.filter((candidate) => candidate.team?.id === team.id || candidate.teamId === team.id);
        return {
          ...team,
          activeTasks: teamTasks.filter((task) => !task.done).length,
          candidatesCount: teamCandidates.length,
          kpiQualified: teamCandidates.filter((candidate) => candidate.kpiQualified).length,
        };
      }),
    [candidates, tasks, teams],
  );

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-slate-900 mb-1">Teams</h1>
        <p className="text-sm text-slate-500 font-light">
          {user?.role === "owner"
            ? "Команды, структура ролей и KPI-динамика по всему workspace"
            : "Ваши рабочие команды, участники и текущий прогресс по KPI"}
        </p>
      </div>

      <div className="grid xl:grid-cols-[1.35fr_0.95fr] gap-6">
        <div className="space-y-4">
          {teamCards.length ? (
            teamCards.map((team) => (
              <section key={team.id} className="rounded-2xl bg-white border border-slate-200/60 p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-xl font-medium text-slate-900 mb-1">{team.name}</h2>
                    <p className="text-sm text-slate-500 font-light">
                      Тимлид: {team.leadUser?.name || "—"} · Участники: {team.membersExpanded?.length || 0}
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
                    KPI {team.kpiPercent || 0}%
                  </div>
                </div>

                <div className="grid sm:grid-cols-4 gap-3 mb-5">
                  <MiniMetric label="Кандидаты" value={String(team.candidatesCount)} />
                  <MiniMetric label="KPI-зачтено" value={String(team.kpiQualified)} />
                  <MiniMetric label="Активные задачи" value={String(team.activeTasks)} />
                  <MiniMetric label="Lead / Company" value={`${team.leadPercent || 0}% / ${team.companyPercent || 0}%`} />
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.08em] text-slate-500 mb-3 font-light">Участники</p>
                  <div className="flex flex-wrap gap-2">
                    {(team.membersExpanded || []).map((member: Record<string, any>) => (
                      <span
                        key={member.id}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
                      >
                        <span className="h-2 w-2 rounded-full bg-indigo-400" />
                        {member.name}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            ))
          ) : (
            <EmptyCard text="Команды появятся здесь после загрузки bootstrap-данных." />
          )}
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl bg-white border border-slate-200/60 p-6">
            <h2 className="text-lg font-medium text-slate-900 mb-4">Командный срез</h2>
            <div className="space-y-4">
              {teamCards.map((team) => (
                <div key={team.id}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-700">{team.name}</span>
                    <span className="text-sm font-medium text-slate-900">{team.kpiPercent || 0}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${Math.min(team.kpiPercent || 0, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-white border border-slate-200/60 p-6">
            <h2 className="text-lg font-medium text-slate-900 mb-4">Приоритеты по командам</h2>
            <div className="space-y-3">
              {teamCards.map((team) => (
                <div key={team.id} className="rounded-xl border border-slate-200/60 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-900 mb-1">{team.name}</p>
                  <p className="text-sm text-slate-600 font-light">
                    {team.activeTasks
                      ? `${team.activeTasks} задач в работе и ${team.candidatesCount} кандидатов воронки`
                      : `Сейчас нет активных задач. Фокус на удержании качества и follow-up`}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/60 p-4 bg-slate-50/70">
      <p className="text-xs uppercase tracking-[0.08em] text-slate-500 mb-2 font-light">{label}</p>
      <p className="text-lg font-medium text-slate-900">{value}</p>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/60 p-8 text-sm text-slate-500 font-light">
      {text}
    </div>
  );
}
