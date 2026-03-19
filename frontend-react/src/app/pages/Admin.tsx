import { useMemo, useState } from "react";
import { Navigate } from "react-router";
import { createUserRequest, decideApplicationRequest } from "../../lib/api";
import { useAppShell } from "../state/AppShellContext";

export function Admin() {
  const { bootstrap, user, token, refreshBootstrap } = useAppShell();
  const users = (bootstrap?.users || []) as Array<Record<string, any>>;
  const applications = (bootstrap?.publicApplications || []) as Array<Record<string, any>>;
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "demo123",
    role: "scout",
    teamId: bootstrap?.metadata?.referenceData?.teams?.[0]?.id || "",
    subscription: "Scout Core",
    payoutBoost: "5%",
  });
  const [saving, setSaving] = useState(false);

  const groupedUsers = useMemo(() => {
    return users.reduce<Record<string, Array<Record<string, any>>>>((acc, current) => {
      const key = current.role || "user";
      acc[key] = acc[key] || [];
      acc[key].push(current);
      return acc;
    }, {});
  }, [users]);

  if (!user?.permissions?.manageUsers) {
    return <Navigate to="/workspace" replace />;
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-slate-900 mb-1">Admin</h1>
        <p className="text-sm text-slate-500 font-light">Управление пользователями, ролями и внешними заявками.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Сотрудников" value={String(users.length)} />
        <StatCard label="Новых заявок" value={String(applications.filter((item) => item.status === "new").length)} />
        <StatCard label="Ролей в системе" value={String(Object.keys(groupedUsers).length)} />
      </div>

      <div className="grid xl:grid-cols-[0.9fr_1.1fr] gap-6">
        <div className="space-y-6">
          <section className="rounded-2xl bg-white border border-slate-200/60 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-medium text-slate-900">Создать пользователя</h2>
              <span className="text-sm text-slate-500 font-light">Быстрый onboard в workspace</span>
            </div>
            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Имя"
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
              />
              <input
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email"
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
              />
            </div>
            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <input
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Пароль"
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
              />
              <select
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
              >
                <option value="scout">scout</option>
                <option value="lead">lead</option>
                <option value="referral">referral</option>
              </select>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <select
                value={form.teamId}
                onChange={(event) => setForm((current) => ({ ...current, teamId: event.target.value }))}
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
              >
                {(bootstrap?.metadata?.referenceData?.teams || []).map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <input
                value={form.subscription}
                onChange={(event) => setForm((current) => ({ ...current, subscription: event.target.value }))}
                placeholder="Subscription"
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
              />
              <input
                value={form.payoutBoost}
                onChange={(event) => setForm((current) => ({ ...current, payoutBoost: event.target.value }))}
                placeholder="Boost"
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
              />
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={async () => {
                  if (!token || !form.name.trim() || !form.email.trim()) return;
                  setSaving(true);
                  try {
                    await createUserRequest(token, {
                      name: form.name.trim(),
                      email: form.email.trim(),
                      password: form.password,
                      role: form.role,
                      teamId: form.teamId,
                      subscription: form.subscription,
                      payoutBoost: form.payoutBoost,
                    });
                    await refreshBootstrap();
                    setForm((current) => ({ ...current, name: "", email: "" }));
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving || !form.name.trim() || !form.email.trim()}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-60"
              >
                {saving ? "Создаем..." : "Создать аккаунт"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl bg-white border border-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-medium text-slate-900">Внешние заявки</h2>
            <span className="text-sm text-slate-500 font-light">{applications.length}</span>
          </div>
          <div className="space-y-3">
            {applications.length ? (
              applications.map((application) => (
                <div key={application.id} className="rounded-xl border border-slate-200/60 p-4 bg-slate-50/70">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{application.name}</p>
                      <p className="text-sm text-slate-500 font-light">{application.contact}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${application.status === "approved" ? "bg-emerald-100 text-emerald-700" : application.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                      {application.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 font-light">{application.experience || "Опыт не указан"}</p>
                  {application.status === "new" && token ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={async () => {
                          await decideApplicationRequest(token, application.id, "approve");
                          await refreshBootstrap();
                        }}
                        className="px-4 py-2 rounded-lg border border-emerald-200 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
                      >
                        Одобрить
                      </button>
                      <button
                        onClick={async () => {
                          await decideApplicationRequest(token, application.id, "reject");
                          await refreshBootstrap();
                        }}
                        className="px-4 py-2 rounded-lg border border-rose-200 text-sm font-medium text-rose-700 hover:bg-rose-50 transition-colors"
                      >
                        Отклонить
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 font-light">Новых заявок сейчас нет.</p>
            )}
          </div>
          </section>
        </div>

        <section className="rounded-2xl bg-white border border-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-medium text-slate-900">Пользователи</h2>
            <span className="text-sm text-slate-500 font-light">{users.length} в системе</span>
          </div>
          <div className="space-y-5">
            {Object.entries(groupedUsers).map(([role, roleUsers]) => (
              <div key={role}>
                <p className="text-xs uppercase tracking-[0.08em] text-slate-500 mb-3 font-light">{role}</p>
                <div className="space-y-3">
                  {roleUsers.map((person) => (
                    <div key={person.id} className="rounded-xl border border-slate-200/60 p-4 bg-slate-50/70 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{person.name}</p>
                        <p className="text-sm text-slate-500 font-light">{person.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-700">{person.teamId || "no-team"}</p>
                        <p className="text-xs text-slate-500 font-light">{person.subscription || "workspace"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
