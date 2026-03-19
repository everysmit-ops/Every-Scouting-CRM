import { Outlet, NavLink } from "react-router";
import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { Logo } from "../components/Logo";
import { WorkspaceAuthScreen } from "../components/WorkspaceAuthScreen";
import { getInitials, useAppShell } from "../state/AppShellContext";

export function WorkspaceLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useTranslation();
  const { user, bootstrap, logout, markAllNotificationsRead, markNotificationRead } = useAppShell();

  if (!user) {
    return <WorkspaceAuthScreen />;
  }

  const notifications = bootstrap?.notifications || [];
  const unreadNotifications = notifications.filter(
    (notification) => !Array.isArray(notification.readBy) || !notification.readBy.includes(user.id),
  );
  const canManageUsers = Boolean(user.permissions?.manageUsers);
  const initials = getInitials(user.name || user.email);

  return (
    <div className="flex h-screen bg-slate-50/50">
      <aside className="hidden lg:flex flex-col w-20 bg-white border-r border-slate-200/60">
        <div className="flex-1 flex flex-col items-center py-6 gap-2">
          <div className="mb-6">
            <Logo variant="icon" size={40} theme="auto" className="text-slate-900" />
          </div>

          <nav className="flex flex-col gap-1 w-full px-2">
            <NavItem to="/workspace" icon={<IconDashboard />} label={t("nav.dashboard")} />
            <NavItem to="/workspace/candidates" icon={<IconCandidates />} label={t("nav.candidates")} />
            <NavItem to="/workspace/teams" icon={<IconTeams />} label={t("nav.teams")} />
            <NavItem to="/workspace/finance" icon={<IconFinance />} label={t("nav.finance")} />
            <NavItem to="/workspace/profile" icon={<IconProfile />} label={t("nav.profile")} />
          </nav>

          <div className="w-10 h-px bg-slate-200/60 my-2" />

          <nav className="flex flex-col gap-1 w-full px-2">
            <NavItem to="/workspace/calendar" icon={<IconCalendar />} label={t("nav.calendar")} />
            <NavItem to="/workspace/analytics" icon={<IconAnalytics />} label={t("nav.analytics")} />
            <NavItem to="/workspace/training" icon={<IconTraining />} label={t("nav.training")} />
            <NavItem to="/workspace/feed" icon={<IconFeed />} label={t("nav.feed")} />
          </nav>
        </div>

        <div className="flex flex-col gap-1 p-2 border-t border-slate-200/60">
          {canManageUsers ? <NavItem to="/workspace/admin" icon={<IconAdmin />} label={t("nav.admin")} /> : null}
          <button className="w-full h-12 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all">
            <IconSettings />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200/60 flex items-center justify-between px-6 lg:px-8">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden w-10 h-10 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100"
          >
            <IconMenu />
          </button>

          <div className="flex-1 lg:max-w-md">
            <div className="relative">
              <input
                type="text"
                placeholder={t("common.search")}
                className="w-full h-10 pl-10 pr-4 rounded-lg bg-slate-50 border border-slate-200/60 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
              />
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="relative w-10 h-10 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-all">
                  <IconNotifications />
                  {unreadNotifications.length ? <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full" /> : null}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="w-80 bg-white rounded-xl shadow-xl border border-slate-200/60 p-2 z-50"
                  sideOffset={8}
                >
                  <div className="px-3 py-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">{t("common.notifications")}</p>
                    {unreadNotifications.length ? (
                      <button
                        className="text-xs text-slate-500 hover:text-slate-900 transition-colors"
                        onClick={() => {
                          markAllNotificationsRead().catch(() => undefined);
                        }}
                      >
                        Прочитать все
                      </button>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    {notifications.length ? (
                      notifications.map((notification) => (
                        <NotificationItem
                          key={notification.id}
                          title={notification.text}
                          time={formatNotificationTime(notification.createdAt)}
                          type={notification.readBy?.includes(user.id) ? "muted" : "info"}
                          onClick={() => markNotificationRead(notification.id).catch(() => undefined)}
                        />
                      ))
                    ) : (
                      <div className="px-3 py-5 text-sm text-slate-500 font-light">Пока нет новых уведомлений</div>
                    )}
                  </div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="flex items-center gap-3 pl-3 pr-2 py-1.5 rounded-lg hover:bg-slate-50 transition-all">
                  <span className="text-sm font-medium text-slate-700 hidden sm:block">{user.name}</span>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-xs font-semibold">
                    {initials || "ES"}
                  </div>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="w-56 bg-white rounded-xl shadow-xl border border-slate-200/60 p-2 z-50"
                  align="end"
                  sideOffset={8}
                >
                  <div className="px-3 py-2 border-b border-slate-200/60">
                    <p className="text-sm font-medium text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                  </div>
                  <div className="p-1">
                    <NavLink
                      to="/workspace/profile"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <IconProfile />
                      <span>Профиль</span>
                    </NavLink>
                    <button
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                      onClick={() => {
                        logout().catch(() => undefined);
                      }}
                    >
                      <IconLogout />
                      <span>Выйти</span>
                    </button>
                  </div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
              <Logo variant="full" size={24} />
              <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400">
                <IconClose />
              </button>
            </div>

            <nav className="space-y-1">
              <MobileNavItem to="/workspace" icon={<IconDashboard />} label={t("nav.dashboard")} onClick={() => setMobileMenuOpen(false)} />
              <MobileNavItem to="/workspace/candidates" icon={<IconCandidates />} label={t("nav.candidates")} onClick={() => setMobileMenuOpen(false)} />
              <MobileNavItem to="/workspace/teams" icon={<IconTeams />} label={t("nav.teams")} onClick={() => setMobileMenuOpen(false)} />
              <MobileNavItem to="/workspace/finance" icon={<IconFinance />} label={t("nav.finance")} onClick={() => setMobileMenuOpen(false)} />
              <MobileNavItem to="/workspace/profile" icon={<IconProfile />} label={t("nav.profile")} onClick={() => setMobileMenuOpen(false)} />

              <div className="h-4" />

              <MobileNavItem to="/workspace/calendar" icon={<IconCalendar />} label={t("nav.calendar")} onClick={() => setMobileMenuOpen(false)} />
              <MobileNavItem to="/workspace/analytics" icon={<IconAnalytics />} label={t("nav.analytics")} onClick={() => setMobileMenuOpen(false)} />
              <MobileNavItem to="/workspace/training" icon={<IconTraining />} label={t("nav.training")} onClick={() => setMobileMenuOpen(false)} />
              <MobileNavItem to="/workspace/feed" icon={<IconFeed />} label={t("nav.feed")} onClick={() => setMobileMenuOpen(false)} />
              {canManageUsers ? (
                <MobileNavItem to="/workspace/admin" icon={<IconAdmin />} label={t("nav.admin")} onClick={() => setMobileMenuOpen(false)} />
              ) : null}
            </nav>

            <div className="mt-6 pt-4 border-t border-slate-200/60">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/workspace"}
      className={({ isActive }) =>
        `group relative w-full h-12 rounded-xl flex items-center justify-center transition-all ${
          isActive ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
        }`
      }
    >
      {icon}
      <span className="absolute left-full ml-4 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
        {label}
      </span>
    </NavLink>
  );
}

function MobileNavItem({
  to,
  icon,
  label,
  onClick,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/workspace"}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
          isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
        }`
      }
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </NavLink>
  );
}

function NotificationItem({
  title,
  time,
  type,
  onClick,
}: {
  title: string;
  time: string;
  type: "info" | "success" | "muted";
  onClick?: () => void;
}) {
  return (
    <button className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-all text-left" onClick={onClick}>
      <div
        className={`w-2 h-2 rounded-full mt-1.5 ${
          type === "success" ? "bg-emerald-500" : type === "muted" ? "bg-slate-300" : "bg-blue-500"
        }`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{time}</p>
      </div>
    </button>
  );
}

function IconDashboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconCandidates() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M21 8v6M18 11h6" />
    </svg>
  );
}

function IconTeams() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconFinance() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconAnalytics() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

function IconTraining() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  );
}

function IconFeed() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v6m0 6v10M3.93 5.93l4.24 4.24m5.66 5.66l4.24 4.24M1 12h6m6 0h10M3.93 18.07l4.24-4.24m5.66-5.66l4.24-4.24" />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function IconNotifications() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h18M3 6h18M3 18h18" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function formatNotificationTime(value?: string) {
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
