import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  bootstrapRequest,
  clearStoredToken,
  getStoredToken,
  loginRequest,
  logoutRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
  setStoredToken,
  type ApiBootstrap,
} from "../../lib/api";

type AppShellContextValue = {
  token: string | null;
  bootstrap: ApiBootstrap | null;
  user: ApiBootstrap["user"] | null;
  loading: boolean;
  bootstrapping: boolean;
  loginError: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [bootstrap, setBootstrap] = useState<ApiBootstrap | null>(null);
  const [loading, setLoading] = useState(Boolean(getStoredToken()));
  const [bootstrapping, setBootstrapping] = useState(false);
  const [loginError, setLoginError] = useState("");

  const refreshBootstrap = useCallback(async () => {
    const activeToken = token || getStoredToken();
    if (!activeToken) {
      setBootstrap(null);
      setLoading(false);
      return;
    }

    setBootstrapping(true);
    setLoading(true);
    try {
      const nextBootstrap = await bootstrapRequest(activeToken);
      setBootstrap(nextBootstrap);
      setToken(activeToken);
      setStoredToken(activeToken);
      setLoginError("");
    } catch (error) {
      clearStoredToken();
      setToken(null);
      setBootstrap(null);
      setLoginError(error instanceof Error ? error.message : "Не удалось загрузить рабочее пространство");
    } finally {
      setBootstrapping(false);
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      refreshBootstrap().catch(() => undefined);
    } else {
      setLoading(false);
    }
  }, [token, refreshBootstrap]);

  useEffect(() => {
    if (!token || typeof EventSource === "undefined") return;
    const source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    source.onmessage = () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        refreshBootstrap().catch(() => undefined);
      }, 250);
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      source.close();
    };
  }, [token, refreshBootstrap]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setLoginError("");
    try {
      const result = await loginRequest(email, password);
      setStoredToken(result.token);
      setToken(result.token);
      const nextBootstrap = await bootstrapRequest(result.token);
      setBootstrap(nextBootstrap);
    } catch (error) {
      clearStoredToken();
      setToken(null);
      setBootstrap(null);
      setLoginError(error instanceof Error ? error.message : "Не удалось войти");
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await logoutRequest(token);
      } catch {
        // noop
      }
    }
    clearStoredToken();
    setToken(null);
    setBootstrap(null);
    setLoginError("");
  }, [token]);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!token || !bootstrap) return;
      await markNotificationReadRequest(token, notificationId);
      setBootstrap({
        ...bootstrap,
        notifications: bootstrap.notifications.map((notification) =>
          notification.id === notificationId
            ? {
                ...notification,
                readBy: [...new Set([...(notification.readBy || []), bootstrap.user.id])],
              }
            : notification,
        ),
      });
    },
    [bootstrap, token],
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!token || !bootstrap) return;
    await markAllNotificationsReadRequest(token);
    setBootstrap({
      ...bootstrap,
      notifications: bootstrap.notifications.map((notification) => ({
        ...notification,
        readBy: [...new Set([...(notification.readBy || []), bootstrap.user.id])],
      })),
    });
  }, [bootstrap, token]);

  const value = useMemo<AppShellContextValue>(
    () => ({
      token,
      bootstrap,
      user: bootstrap?.user || null,
      loading,
      bootstrapping,
      loginError,
      login,
      logout,
      refreshBootstrap,
      markNotificationRead,
      markAllNotificationsRead,
    }),
    [
      token,
      bootstrap,
      loading,
      bootstrapping,
      loginError,
      login,
      logout,
      refreshBootstrap,
      markNotificationRead,
      markAllNotificationsRead,
    ],
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShell must be used within AppShellProvider");
  }
  return context;
}

export function getInitials(name: string) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || "")
    .join("");
}
