import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAppShell } from "../state/AppShellContext";

export function RequirePermission({
  permission,
  children,
  fallbackTo = "/workspace",
}: {
  permission: string;
  children: ReactNode;
  fallbackTo?: string;
}) {
  const { user } = useAppShell();

  if (!user) return null;
  if (!user.permissions?.[permission]) {
    return <Navigate to={fallbackTo} replace />;
  }

  return <>{children}</>;
}
