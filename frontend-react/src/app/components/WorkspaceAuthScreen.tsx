import { useState } from "react";
import { Link } from "react-router";
import { Logo } from "./Logo";
import { useAppShell } from "../state/AppShellContext";

export function WorkspaceAuthScreen() {
  const { login, loading, loginError } = useAppShell();
  const [email, setEmail] = useState("owner@scoutflow.local");
  const [password, setPassword] = useState("demo123");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await login(email, password);
    } catch {
      // handled in context
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo variant="full" size={28} className="text-slate-900" />
        </div>

        <div className="rounded-3xl bg-white border border-slate-200/60 shadow-xl shadow-slate-200/50 p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-medium text-slate-900 mb-2">Вход в рабочее пространство</h1>
            <p className="text-sm text-slate-500 font-light">
              Используй свой рабочий аккаунт Every Scouting, чтобы открыть платформу.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="block text-sm text-slate-600 mb-2">Email</span>
              <input
                className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200/60 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="owner@scoutflow.local"
              />
            </label>

            <label className="block">
              <span className="block text-sm text-slate-600 mb-2">Пароль</span>
              <input
                type="password"
                className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200/60 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="demo123"
              />
            </label>

            {loginError ? (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{loginError}</div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Входим..." : "Войти"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200/60">
            <p className="text-xs text-slate-500 font-light mb-3">Демо-доступ</p>
            <div className="space-y-2 text-sm text-slate-600">
              <DemoCredentials email="owner@scoutflow.local" onPick={setEmail} />
              <DemoCredentials email="lead@scoutflow.local" onPick={setEmail} />
              <DemoCredentials email="scout@scoutflow.local" onPick={setEmail} />
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
            Вернуться на лендинг
          </Link>
        </div>
      </div>
    </div>
  );
}

function DemoCredentials({ email, onPick }: { email: string; onPick: (email: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(email)}
      className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
    >
      <span>{email}</span>
      <span className="text-slate-400">demo123</span>
    </button>
  );
}
