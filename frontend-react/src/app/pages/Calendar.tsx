import { useMemo, useState } from "react";
import { createTaskRequest, updateTaskRequest } from "../../lib/api";
import { useAppShell } from "../state/AppShellContext";

export function Calendar() {
  const { bootstrap, token, user, refreshBootstrap } = useAppShell();
  const candidates = (bootstrap?.candidates || []) as Array<Record<string, any>>;
  const tasks = (bootstrap?.tasks || []) as Array<Record<string, any>>;
  const teamOptions = bootstrap?.metadata?.referenceData?.teams || [];
  const userOptions = bootstrap?.metadata?.referenceData?.users || [];
  const canManageTasks = Boolean(user?.permissions?.manageTasks);
  const [taskForm, setTaskForm] = useState({
    title: "",
    deadline: "",
    priority: "medium",
    teamId: user?.teamId || teamOptions[0]?.id || "",
    assigneeUserId: user?.id || "",
  });
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskUpdatingId, setTaskUpdatingId] = useState<string | null>(null);

  const interviews = useMemo(
    () =>
      candidates
        .filter((candidate) => candidate.interviewAt)
        .slice()
        .sort((left, right) => String(left.interviewAt).localeCompare(String(right.interviewAt))),
    [candidates],
  );

  const openTasks = useMemo(
    () =>
      tasks
        .filter((task) => !task.done)
        .slice()
        .sort((left, right) => String(left.deadline || "").localeCompare(String(right.deadline || ""))),
    [tasks],
  );

  const visibleAssignees = useMemo(() => {
    if (!canManageTasks) {
      return user ? [{ id: user.id, name: user.name, role: user.role }] : [];
    }
    return userOptions;
  }, [canManageTasks, user, userOptions]);

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-slate-900 mb-1">Calendar</h1>
        <p className="text-sm text-slate-500 font-light">Интервью, дедлайны задач и ближайшие рабочие события.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Интервью в плане" value={String(interviews.length)} />
        <StatCard label="Открытые задачи" value={String(openTasks.length)} />
        <StatCard label="Сегодня в фокусе" value={openTasks[0]?.title ? "1" : "0"} />
      </div>

      <div className="grid xl:grid-cols-[1.05fr_0.95fr] gap-6">
        <section className="rounded-2xl bg-white border border-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-medium text-slate-900">Ближайшие интервью</h2>
            <span className="text-sm text-slate-500 font-light">{interviews.length} событий</span>
          </div>
          <div className="space-y-3">
            {interviews.length ? (
              interviews.map((candidate) => (
                <div key={candidate.id} className="rounded-xl border border-slate-200/60 p-4 bg-slate-50/70">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{candidate.name}</p>
                      <p className="text-sm text-slate-500 font-light">{candidate.offer?.title || "Без оффера"}</p>
                    </div>
                    <span className="text-sm text-slate-900 font-medium">{formatDateTime(candidate.interviewAt)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-white border border-slate-200 px-3 py-1">{candidate.interviewFormat || "video"}</span>
                    <span className="rounded-full bg-white border border-slate-200 px-3 py-1">{candidate.interviewStatus || "scheduled"}</span>
                    <span className="rounded-full bg-white border border-slate-200 px-3 py-1">{candidate.team?.name || "Без команды"}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 font-light">Пока нет назначенных интервью в видимом календаре.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-medium text-slate-900">План по задачам</h2>
            <span className="text-sm text-slate-500 font-light">{openTasks.length} в работе</span>
          </div>
          {canManageTasks && token ? (
            <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 p-4 mb-4">
              <div className="grid md:grid-cols-2 gap-3 mb-3">
                <input
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Новая задача"
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                />
                <input
                  type="date"
                  value={taskForm.deadline}
                  onChange={(event) => setTaskForm((current) => ({ ...current, deadline: event.target.value }))}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                />
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <select
                  value={taskForm.priority}
                  onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
                <select
                  value={taskForm.teamId}
                  onChange={(event) => setTaskForm((current) => ({ ...current, teamId: event.target.value }))}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                >
                  {teamOptions.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <select
                  value={taskForm.assigneeUserId}
                  onChange={(event) => setTaskForm((current) => ({ ...current, assigneeUserId: event.target.value }))}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                >
                  {visibleAssignees.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={async () => {
                    if (!token || !taskForm.title.trim()) return;
                    setTaskSaving(true);
                    try {
                      await createTaskRequest(token, {
                        title: taskForm.title.trim(),
                        deadline: taskForm.deadline || undefined,
                        priority: taskForm.priority as "low" | "medium" | "high",
                        teamId: taskForm.teamId || undefined,
                        assigneeUserId: taskForm.assigneeUserId || undefined,
                      });
                      await refreshBootstrap();
                      setTaskForm((current) => ({
                        ...current,
                        title: "",
                        deadline: "",
                      }));
                    } finally {
                      setTaskSaving(false);
                    }
                  }}
                  disabled={taskSaving || !taskForm.title.trim()}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-60"
                >
                  {taskSaving ? "Сохраняем..." : "Добавить задачу"}
                </button>
              </div>
            </div>
          ) : null}
          <div className="space-y-3">
            {openTasks.length ? (
              openTasks.map((task) => (
                <div key={task.id} className="rounded-xl border border-slate-200/60 p-4 bg-slate-50/70">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{task.title}</p>
                      <p className="text-sm text-slate-500 font-light">{task.team?.name || task.assigneeUser?.name || "Личный контур"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${priorityClass(task.priority)}`}>{task.priority || "medium"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-600 font-light">Дедлайн: {formatDate(task.deadline)}</p>
                    {token && (canManageTasks || task.assigneeUserId === user?.id) ? (
                      <button
                        onClick={async () => {
                          setTaskUpdatingId(task.id);
                          try {
                            await updateTaskRequest(token, task.id, { done: true });
                            await refreshBootstrap();
                          } finally {
                            setTaskUpdatingId(null);
                          }
                        }}
                        disabled={taskUpdatingId === task.id}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-60"
                      >
                        {taskUpdatingId === task.id ? "Обновляем..." : "Закрыть"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 font-light">Открытых задач сейчас нет.</p>
            )}
          </div>
        </section>
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

function priorityClass(priority?: string) {
  if (priority === "high") return "bg-rose-100 text-rose-700";
  if (priority === "medium") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(date);
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
