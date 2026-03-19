export type ApiBootstrap = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    teamId?: string | null;
    subscription?: string;
    theme?: string;
    referralCode?: string;
    referralIncomePercent?: number;
    payoutBoost?: string;
    locale?: string;
    permissions?: Record<string, boolean>;
    bio?: string;
    username?: string;
    bannerUrl?: string;
    avatarUrl?: string;
    socialLinks?: Array<{ label: string; url: string }>;
    lastOnlineAt?: string;
  };
  metadata: {
    permissions: Record<string, boolean>;
    companyName: string;
    locale: string;
    referenceData: {
      teams: Array<{ id: string; name: string }>;
      offers: Array<{ id: string; title: string }>;
      users: Array<{ id: string; name: string; role: string }>;
    };
  };
  summary: {
    candidates: number;
    kpiQualified: number;
    offers: number;
    trainingPending: number;
    applications: number;
  };
  candidates: Array<Record<string, any>>;
  offers: Array<Record<string, any>>;
  teams: Array<Record<string, any>>;
  tasks: Array<Record<string, any>>;
  trainings: Array<Record<string, any>>;
  posts: Array<Record<string, any>>;
  publicApplications: Array<Record<string, any>>;
  notifications: Array<Record<string, any>>;
  payouts: Array<Record<string, any>>;
  scoreboard: Array<Record<string, any>>;
  auditLog: Array<Record<string, any>>;
  users: Array<Record<string, any>>;
};

const API_BASE = "/api";
const TOKEN_STORAGE_KEY = "every-scouting-auth-token";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload as T;
}

export async function loginRequest(email: string, password: string) {
  return apiRequest<{ token: string; user: ApiBootstrap["user"] }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: email.trim(), password }),
  });
}

export async function logoutRequest(token: string) {
  return apiRequest<{ ok: true }>("/auth/logout", {
    method: "POST",
  }, token);
}

export async function bootstrapRequest(token: string) {
  return apiRequest<ApiBootstrap>("/bootstrap", {}, token);
}

export async function markNotificationReadRequest(token: string, notificationId: string) {
  return apiRequest<{ ok: true; notificationId: string }>(`/notifications/${notificationId}/read`, {
    method: "PATCH",
  }, token);
}

export async function markAllNotificationsReadRequest(token: string) {
  return apiRequest<{ ok: true }>("/notifications/read-all", {
    method: "POST",
  }, token);
}

export async function createCandidateRequest(token: string, payload: Record<string, unknown>) {
  return apiRequest<{ candidate: Record<string, any> }>("/candidates", {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}

export async function updateCandidateRequest(token: string, candidateId: string, payload: Record<string, unknown>) {
  return apiRequest<{ candidate: Record<string, any> }>(`/candidates/${candidateId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, token);
}

export async function addCandidateCommentRequest(token: string, candidateId: string, body: string) {
  return apiRequest<{ candidate: Record<string, any>; comment: Record<string, any> }>(`/candidates/${candidateId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  }, token);
}

export async function addCandidateDocumentRequest(
  token: string,
  candidateId: string,
  payload: { title: string; url: string; note?: string; type?: string },
) {
  return apiRequest<{ candidate: Record<string, any>; document: Record<string, any> }>(`/candidates/${candidateId}/documents`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}

export async function updatePayoutRequest(token: string, payoutId: string, status: "pending" | "approved" | "paid") {
  return apiRequest<{ payout: Record<string, any> }>(`/payouts/${payoutId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }, token);
}

export async function createTaskRequest(
  token: string,
  payload: {
    title: string;
    assigneeUserId?: string;
    teamId?: string;
    deadline?: string;
    priority?: "low" | "medium" | "high";
  },
) {
  return apiRequest<{ task: Record<string, any> }>("/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}

export async function updateTaskRequest(
  token: string,
  taskId: string,
  payload: {
    done?: boolean;
    title?: string;
    assigneeUserId?: string | null;
    teamId?: string | null;
    deadline?: string;
    priority?: "low" | "medium" | "high";
  },
) {
  return apiRequest<{ task: Record<string, any> }>(`/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, token);
}

export async function completeTrainingRequest(token: string, trainingId: string) {
  return apiRequest<{ training: Record<string, any> }>(`/trainings/${trainingId}/complete`, {
    method: "POST",
  }, token);
}

export async function createPostRequest(
  token: string,
  payload: { title: string; body: string; type?: string; category?: string; pinned?: boolean },
) {
  return apiRequest<{ post: Record<string, any> }>("/posts", {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}

export async function addPostCommentRequest(token: string, postId: string, body: string) {
  return apiRequest<{ post: Record<string, any>; comment: Record<string, any> }>(`/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  }, token);
}

export async function decideApplicationRequest(
  token: string,
  applicationId: string,
  decision: "approve" | "reject",
  payload: Record<string, unknown> = {},
) {
  return apiRequest<{ application: Record<string, any> }>(`/public/applications/${applicationId}/${decision}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, token);
}

export async function updateProfileRequest(
  token: string,
  payload: {
    name?: string;
    username?: string;
    bio?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    socialLinks?: Array<{ label: string; url: string }>;
    theme?: string;
    locale?: string;
  },
) {
  return apiRequest<{ user: ApiBootstrap["user"] }>("/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, token);
}

export async function createPublicApplicationRequest(payload: {
  name: string;
  contact: string;
  experience: string;
  languages: string;
  motivation: string;
}) {
  return apiRequest<{ ok: true; application: Record<string, any> }>("/public/applications", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createUserRequest(
  token: string,
  payload: {
    name: string;
    email: string;
    password?: string;
    role?: string;
    teamId?: string;
    subscription?: string;
    theme?: string;
    referralIncomePercent?: number;
    payoutBoost?: string;
  },
) {
  return apiRequest<{ user: Record<string, any> }>("/users", {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}
