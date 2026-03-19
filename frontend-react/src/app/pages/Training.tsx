import { useMemo, useState } from "react";
import { completeTrainingRequest } from "../../lib/api";
import { useAppShell } from "../state/AppShellContext";

export function Training() {
  const { bootstrap, user, token, refreshBootstrap } = useAppShell();
  const trainings = (bootstrap?.trainings || []) as Array<Record<string, any>>;
  const [savingId, setSavingId] = useState<string | null>(null);

  const mandatoryPending = useMemo(
    () => trainings.filter((training) => training.mandatory && !training.completed && training.role === user?.role).length,
    [trainings, user?.role],
  );
  const completed = useMemo(() => trainings.filter((training) => training.completed).length, [trainings]);

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-slate-900 mb-1">Training</h1>
        <p className="text-sm text-slate-500 font-light">Обязательные и дополнительные модули для вашей роли и команды.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Всего модулей" value={String(trainings.length)} />
        <StatCard label="Завершено" value={String(completed)} />
        <StatCard label="Обязательных в ожидании" value={String(mandatoryPending)} />
      </div>

      <div className="space-y-4">
        {trainings.length ? (
          trainings.map((training) => (
            <section key={training.id} className="rounded-2xl bg-white border border-slate-200/60 p-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-lg font-medium text-slate-900">{training.title}</h2>
                    {training.mandatory ? <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700">Mandatory</span> : null}
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${training.completed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {training.completed ? "Completed" : "Pending"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 font-light">
                    Роль: {training.role} · Назначено: {training.assignedUsers?.length || 0} участникам
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500 font-light">Создано {formatDate(training.createdAt)}</p>
                  {!training.completed && token ? (
                    <button
                      onClick={async () => {
                        setSavingId(training.id);
                        try {
                          await completeTrainingRequest(token, training.id);
                          await refreshBootstrap();
                        } finally {
                          setSavingId(null);
                        }
                      }}
                      disabled={savingId === training.id}
                      className="mt-3 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
                    >
                      {savingId === training.id ? "..." : "Завершить"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs uppercase tracking-[0.08em] text-slate-500 mb-3 font-light">Назначенные пользователи</p>
                <div className="flex flex-wrap gap-2">
                  {(training.assignedUsers || []).map((member: Record<string, any>) => (
                    <span key={member.id} className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 bg-slate-50">
                      {member.name}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          ))
        ) : (
          <div className="rounded-2xl bg-white border border-slate-200/60 p-8 text-sm text-slate-500 font-light">
            Тренинги появятся здесь после загрузки данных.
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/60 p-5">
      <p className="text-sm text-slate-600 mb-2 font-light">{label}</p>
      <p className="text-2xl font-medium text-slate-900">{value}</p>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(date);
}
