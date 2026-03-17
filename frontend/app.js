const TOKEN_KEY = "scoutflow-auth-token";
const API = {
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  bootstrap: "/api/bootstrap",
  publicApplications: "/api/public/applications",
  candidates: "/api/candidates",
  offers: "/api/offers",
  tasks: "/api/tasks",
  trainings: "/api/trainings",
  posts: "/api/posts",
  users: "/api/users",
  payouts: "/api/payouts",
  uploads: "/api/uploads",
  notifications: "/api/notifications",
};

const roles = {
  owner: "Главный админ",
  lead: "Тимлид",
  scout: "Скаут",
  referral: "Скаут (реферал)",
};

const translations = {
  ru: {
    interview: "Собеседование",
    registered: "Регистрация пройдена",
    twoShifts: "2 смены закрыты",
    training: "На обучении",
    screening: "Скрининг",
    new: "Новый",
    rejected: "Отклонен",
    approved: "Одобрен",
  },
  en: {
    interview: "Interview",
    registered: "Registered",
    twoShifts: "2 shifts done",
    training: "In training",
    screening: "Screening",
    new: "New",
    rejected: "Rejected",
    approved: "Approved",
  },
};

let authToken = localStorage.getItem(TOKEN_KEY) || "";
let state = null;
let activeView = "dashboard";
let currentLanguage = "ru";
let financePeriod = "month";
let financeFilters = {
  status: "all",
  scoutId: "all",
  teamId: "all",
};
let activeChatId = "";
let chatSearch = "";
let socialFilters = {
  type: "all",
  category: "all",
};
let activeDocumentPreview = null;
let liveSyncTimer = null;
let liveSyncInFlight = false;
let lastLiveSyncAt = null;
let liveEventSource = null;
let liveTransport = "polling";
let queuedRealtimeRefresh = false;
let pendingDeepLink = null;

function el(id) {
  return document.getElementById(id);
}

function slug(value) {
  return String(value).toLowerCase().replace(/\s+/g, "-").replace(/[()]/g, "");
}

function getStatusLabel(status) {
  return translations[currentLanguage][status] || status;
}

function parseMoney(value) {
  const normalized = String(value || "").replace(/[^0-9.,-]/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function parsePercent(value) {
  const normalized = String(value || "").replace(/[^0-9.,-]/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value) {
  return new Intl.NumberFormat(currentLanguage === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function getPendingMandatoryTrainings() {
  if (!state?.trainings || !state?.user) return [];
  return state.trainings.filter(
    (training) => training.role === state.user.role && training.mandatory && !training.completed,
  );
}

function hasTrainingLock() {
  return getPendingMandatoryTrainings().length > 0;
}

function ensureTrainingUnlocked(actionLabel = "выполнить действие") {
  if (!hasTrainingLock()) return true;
  activeView = "training";
  renderWorkspace();
  toast(`Сначала нужно завершить обязательное обучение, чтобы ${actionLabel}.`);
  return false;
}

function actionLockAttrs(actionLabel = "continue") {
  return hasTrainingLock()
    ? `disabled title="Закройте обязательное обучение, чтобы ${actionLabel}" aria-disabled="true"`
    : "";
}

function renderTrainingGuard() {
  const pending = getPendingMandatoryTrainings();
  if (!pending.length) return "";
  return `
    <div class="training-guard">
      <div>
        <strong>Рабочий режим ограничен до завершения обучения.</strong>
        <div class="small-note">Осталось обязательных модулей: ${pending.length}. Пока они не закрыты, создание и изменение рабочих сущностей заблокировано.</div>
      </div>
      <button class="action-btn" data-open-training-guard="true">Открыть обучение</button>
    </div>
  `;
}

function formatDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Без даты";
  return new Intl.DateTimeFormat(currentLanguage === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTimeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Не назначено";
  return new Intl.DateTimeFormat(currentLanguage === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getInterviewStatusLabel(status) {
  const labels = {
    unscheduled: "Не назначено",
    scheduled: "Назначено",
    completed: "Проведено",
    rescheduled: "Перенесено",
    no_show: "Не явился",
  };
  return labels[status] || status;
}

function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getChatKindLabel(chat) {
  if (chat.global) return "Global";
  if (chat.participantIds?.length === 2 && !chat.teamId) return "Direct";
  return "Team";
}

function getChatUnreadCount(chat) {
  return (chat.messages || []).slice(-6).filter((message) => message.authorId !== state.user.id).length;
}

function ensureActiveChat(chats) {
  if (!chats.length) {
    activeChatId = "";
    return null;
  }
  const existing = chats.find((chat) => chat.id === activeChatId);
  if (existing) return existing;
  activeChatId = chats[0].id;
  return chats[0];
}

function isInFinancePeriod(value, period) {
  if (period === "all") return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (period === "day") return diffMs <= dayMs;
  if (period === "week") return diffMs <= 7 * dayMs;
  if (period === "month") return diffMs <= 30 * dayMs;
  return true;
}

function bindTrainingGuardButton() {
  document.querySelectorAll("[data-open-training-guard]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = "training";
      renderWorkspace();
    });
  });
}

function optionsForUsers(rolesFilter = null) {
  const users = state.metadata.referenceData.users || [];
  return rolesFilter ? users.filter((item) => rolesFilter.includes(item.role)) : users;
}

function optionMarkup(items, labelKey = "name") {
  return items.map((item) => `<option value="${item.id}">${item[labelKey]}</option>`).join("");
}

function renderPermissionChecklist(selected = {}) {
  const labels = state.metadata.permissionLabels || {};
  return Object.entries(labels)
    .map(
      ([key, label]) => `
        <label class="permission-toggle">
          <input type="checkbox" name="permission_${key}" ${selected[key] ? "checked" : ""} />
          <span>${label}</span>
        </label>
      `,
    )
    .join("");
}

function readPermissionOverrides(formData) {
  const labels = state.metadata.permissionLabels || {};
  return Object.keys(labels).reduce((accumulator, key) => {
    accumulator[key] = formData.get(`permission_${key}`) === "on";
    return accumulator;
  }, {});
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function getDocumentPreviewKind(document) {
  const url = String(document?.url || "").toLowerCase();
  if (!url) return "none";
  if (/\.(png|jpe?g|webp|gif|svg)$/.test(url)) return "image";
  if (url.endsWith(".pdf")) return "pdf";
  return "link";
}

function renderDocumentPreview() {
  const overlay = el("docPreviewOverlay");
  if (!overlay) return;
  if (!activeDocumentPreview) {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
    return;
  }

  const previewKind = getDocumentPreviewKind(activeDocumentPreview);
  const previewBody =
    previewKind === "image"
      ? `<img class="doc-preview-media" src="${activeDocumentPreview.url}" alt="${activeDocumentPreview.title}" />`
      : previewKind === "pdf"
        ? `<iframe class="doc-preview-frame" src="${activeDocumentPreview.url}" title="${activeDocumentPreview.title}"></iframe>`
        : `<div class="doc-preview-fallback">
             <p>Для этого типа документа доступно быстрое открытие в новой вкладке.</p>
             <a class="primary-btn doc-preview-open" href="${activeDocumentPreview.url}" target="_blank" rel="noreferrer">Открыть документ</a>
           </div>`;

  overlay.classList.remove("hidden");
  overlay.innerHTML = `
    <div class="doc-preview-backdrop" data-close-doc-preview="true"></div>
    <section class="doc-preview-card card">
      <div class="list-head">
        <div>
          <strong>${activeDocumentPreview.title}</strong>
          <div class="list-meta">${activeDocumentPreview.type} · ${formatDateLabel(activeDocumentPreview.createdAt)}</div>
        </div>
        <button class="ghost-btn" data-close-doc-preview="true">Закрыть</button>
      </div>
      <div class="doc-preview-stage">${previewBody}</div>
      <div class="inline-actions">
        <a class="ghost-btn doc-link-btn" href="${activeDocumentPreview.url}" target="_blank" rel="noreferrer">Открыть в новой вкладке</a>
      </div>
    </section>
  `;

  overlay.querySelectorAll("[data-close-doc-preview]").forEach((button) => {
    button.addEventListener("click", () => {
      activeDocumentPreview = null;
      renderDocumentPreview();
    });
  });
}

function pushToast(message, options = {}) {
  const stack = el("toastStack");
  if (!stack || !message) return;
  const node = document.createElement("article");
  node.className = "toast-card";
  node.innerHTML = `
    <div class="toast-copy">
      <strong>${options.title || "Every Scouting"}</strong>
      <div>${message}</div>
    </div>
    ${options.actionLabel ? `<button class="ghost-btn" type="button">${options.actionLabel}</button>` : ""}
  `;
  if (options.onAction) {
    node.querySelector("button")?.addEventListener("click", () => {
      options.onAction();
      node.remove();
    });
  }
  stack.appendChild(node);
  window.setTimeout(() => node.remove(), options.duration || 4200);
}

function setDeepLink(view, entityType, entityId) {
  if (!view || !entityType || !entityId) return;
  pendingDeepLink = { view, entityType, entityId };
}

function applyPendingDeepLink() {
  if (!pendingDeepLink || pendingDeepLink.view !== activeView) return;
  const selectorMap = {
    candidate: `[data-candidate-card-id="${pendingDeepLink.entityId}"]`,
    offer: `[data-offer-card-id="${pendingDeepLink.entityId}"]`,
    task: `[data-task-card-id="${pendingDeepLink.entityId}"]`,
    post: `[data-post-card-id="${pendingDeepLink.entityId}"]`,
    application: `[data-application-card-id="${pendingDeepLink.entityId}"]`,
  };
  const target = document.querySelector(selectorMap[pendingDeepLink.entityType] || "");
  if (!target) return;
  target.classList.add("entity-highlight");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => target.classList.remove("entity-highlight"), 2200);
  pendingDeepLink = null;
}

function hasInteractiveFocus() {
  const activeElement = document.activeElement;
  if (!activeElement) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName) || activeElement.isContentEditable;
}

function shouldUseLiveSync() {
  return Boolean(authToken && state?.user && ["dashboard", "teams", "social", "candidates"].includes(activeView));
}

function updateLiveSyncBadge(status = "idle") {
  const badge = el("liveSyncBadge");
  if (!badge) return;
  if (!state?.user) {
    badge.textContent = "Live sync: off";
    badge.className = "live-sync-chip";
    return;
  }

  const suffix = lastLiveSyncAt ? formatDateTimeLabel(lastLiveSyncAt) : "ожидание";
  const transportLabel = liveTransport === "sse" ? "live" : "sync";
  badge.textContent =
    status === "syncing"
      ? `${transportLabel}: обновление...`
      : status === "error"
        ? `${transportLabel}: ошибка`
        : `${transportLabel}: ${suffix}`;
  badge.className = `live-sync-chip ${status === "syncing" ? "syncing" : status === "error" ? "error" : "active"}`;
}

async function syncLiveWorkspace() {
  if (!shouldUseLiveSync() || liveSyncInFlight || hasInteractiveFocus()) return;
  liveSyncInFlight = true;
  updateLiveSyncBadge("syncing");
  try {
    state = await api(API.bootstrap);
    lastLiveSyncAt = new Date().toISOString();
    renderWorkspace();
  } catch (error) {
    console.warn(error);
    updateLiveSyncBadge("error");
  } finally {
    liveSyncInFlight = false;
  }
}

function queueRealtimeRefresh() {
  queuedRealtimeRefresh = true;
  if (!hasInteractiveFocus()) {
    syncLiveWorkspace().catch((error) => console.warn(error));
  }
}

function connectRealtimeStream() {
  if (!authToken || liveEventSource) return;
  try {
    liveEventSource = new EventSource(`/api/events?token=${encodeURIComponent(authToken)}`);
    liveEventSource.addEventListener("ready", () => {
      liveTransport = "sse";
      updateLiveSyncBadge("idle");
    });
    liveEventSource.addEventListener("update", (event) => {
      const payload = JSON.parse(event.data || "{}");
      queueRealtimeRefresh();
      if (payload.message) {
        pushToast(payload.message, {
          title: "Новое событие",
          actionLabel: payload.view && payload.entityType && payload.entityId ? "Открыть" : "",
          onAction: payload.view && payload.entityType && payload.entityId
            ? () => {
                activeView = payload.view;
                setDeepLink(payload.view, payload.entityType, payload.entityId);
                renderWorkspace();
              }
            : null,
        });
      }
    });
    liveEventSource.onerror = () => {
      liveTransport = "polling";
      updateLiveSyncBadge("error");
      if (liveEventSource) {
        liveEventSource.close();
        liveEventSource = null;
      }
    };
  } catch (error) {
    console.warn(error);
    liveTransport = "polling";
  }
}

function disconnectRealtimeStream() {
  if (liveEventSource) {
    liveEventSource.close();
    liveEventSource = null;
  }
  liveTransport = "polling";
}

function stopLiveSync() {
  if (liveSyncTimer) {
    clearInterval(liveSyncTimer);
    liveSyncTimer = null;
  }
  disconnectRealtimeStream();
  liveSyncInFlight = false;
  queuedRealtimeRefresh = false;
  updateLiveSyncBadge();
}

function startLiveSync() {
  stopLiveSync();
  if (!authToken) return;
  connectRealtimeStream();
  liveSyncTimer = window.setInterval(() => {
    if (liveTransport === "sse" && !queuedRealtimeRefresh) return;
    syncLiveWorkspace().catch((error) => console.warn(error));
  }, 12000);
  updateLiveSyncBadge("idle");
}

function renderSummary() {
  const items = [
    { label: "Кандидаты", value: state.summary.candidates, note: "Видимые по вашей роли" },
    { label: "KPI зачтено", value: state.summary.kpiQualified, note: "Интервью + регистрация + 2 смены" },
    { label: "Офферы", value: state.summary.offers, note: "Доступные вам назначения" },
    { label: "Обучение", value: state.summary.trainingPending, note: "Осталось закрыть обязательно" },
  ];

  if (state.user.role === "owner") {
    items[3] = { label: "Входящие заявки", value: state.summary.applications, note: "С публичной страницы" };
  }

  el("summaryGrid").innerHTML = items
    .map(
      (item) => `
        <article class="summary-card">
          <span class="metric-label">${item.label}</span>
          <strong>${item.value}</strong>
          <span class="small-note">${item.note}</span>
        </article>
      `,
    )
    .join("");
}

function getUnreadNotifications() {
  return (state?.notifications || []).filter((item) => !(item.readBy || []).includes(state.user.id));
}

function getNotificationTargetView(notification) {
  const text = String(notification?.text || "").toLowerCase();
  if (text.includes("заявк")) return "management";
  if (text.includes("кандидат")) return "candidates";
  if (text.includes("оффер")) return "offers";
  if (text.includes("задач")) return "tasks";
  if (text.includes("пост") || text.includes("комментар")) return "social";
  return "dashboard";
}

function resolveNotificationTarget(notification) {
  const text = String(notification?.text || "");
  const candidateMatch = text.match(/Добавлен новый кандидат\s+(.+)$/i) || text.match(/Статус кандидата\s+(.+?)\s+обновлен$/i);
  if (candidateMatch) {
    const candidate = (state.candidates || []).find((item) => item.name === candidateMatch[1]?.trim());
    if (candidate) return { view: "candidates", entityType: "candidate", entityId: candidate.id };
  }
  const offerMatch = text.match(/Новый оффер\s+(.+)\s+создан/i);
  if (offerMatch) {
    const offer = (state.offers || []).find((item) => item.title === offerMatch[1]?.trim());
    if (offer) return { view: "offers", entityType: "offer", entityId: offer.id };
  }
  const taskMatch = text.match(/Новая задача:\s+(.+)$/i);
  if (taskMatch) {
    const task = (state.tasks || []).find((item) => item.title === taskMatch[1]?.trim());
    if (task) return { view: "tasks", entityType: "task", entityId: task.id };
  }
  const applicationMatch = text.match(/заявка.*?от\s+(.+)$/i);
  if (applicationMatch) {
    const application = (state.publicApplications || []).find((item) => item.name === applicationMatch[1]?.trim());
    if (application) return { view: "management", entityType: "application", entityId: application.id };
  }
  return { view: getNotificationTargetView(notification), entityType: null, entityId: null };
}

function renderSession() {
  const guest = el("guestState");
  const active = el("activeSession");
  if (!state?.user) {
    guest.classList.remove("hidden");
    active.classList.add("hidden");
    active.innerHTML = "";
    el("workspaceApp").classList.add("hidden");
    return;
  }

  guest.classList.add("hidden");
  active.classList.remove("hidden");
  active.innerHTML = `
    <strong>${state.user.name}</strong>
    <div class="chip-row">
      <span class="chip">${state.user.roleLabel}</span>
      <span class="chip">${state.user.subscription}</span>
      <span class="chip">Boost: ${state.user.payoutBoost}</span>
    </div>
  `;
  el("workspaceApp").classList.remove("hidden");
}

function renderNav() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === activeView);
  });
}

function renderUtilityPanels() {
  const notificationPopover = el("notificationPopover");
  const notificationBadge = el("notificationBadge");
  const unread = getUnreadNotifications();

  if (notificationBadge) {
    notificationBadge.textContent = String(unread.length);
    notificationBadge.classList.toggle("hidden", !unread.length);
  }

  if (notificationPopover) {
    notificationPopover.innerHTML = `
      <div class="popover-title-row">
        <strong>Уведомления</strong>
        <span class="chip">${unread.length} новых</span>
      </div>
      <div class="popover-list">
        ${
          unread.length
            ? unread
                .slice(0, 6)
                .map(
                  (item) => `
                    <button class="popover-item" type="button" data-open-notification-popover="${item.id}">
                      <strong>${item.text}</strong>
                      <span class="small-note">${formatDateTimeLabel(item.createdAt)}</span>
                    </button>
                  `,
                )
                .join("")
            : '<div class="empty-text">Новых уведомлений нет.</div>'
        }
      </div>
      <div class="inline-actions">
        <button class="ghost-btn" type="button" data-mark-all-read-popover="true" ${!unread.length ? "disabled" : ""}>Прочитать все</button>
      </div>
    `;
  }

  document.querySelectorAll("[data-open-notification-popover]").forEach((button) => {
    button.addEventListener("click", async () => {
      const notification = (state.notifications || []).find((item) => item.id === button.dataset.openNotificationPopover);
      if (!notification) return;
      try {
        await api(`${API.notifications}/${notification.id}/read`, { method: "PATCH" });
        state.notifications = (state.notifications || []).map((item) =>
          item.id === notification.id ? { ...item, readBy: [...new Set([...(item.readBy || []), state.user.id])] } : item,
        );
      } catch (error) {
        toast(error.message);
      }
      const target = resolveNotificationTarget(notification);
      activeView = target.view;
      if (target.entityType && target.entityId) {
        setDeepLink(target.view, target.entityType, target.entityId);
      }
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-mark-all-read-popover]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`${API.notifications}/read-all`, { method: "POST" });
        state.notifications = (state.notifications || []).map((item) =>
          item.userIds && !item.userIds.includes(state.user.id)
            ? item
            : { ...item, readBy: [...new Set([...(item.readBy || []), state.user.id])] },
        );
        renderWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function renderDashboardView() {
  const notifications = state.notifications
    .map((item) => `
      <div class="list-item ${!(item.readBy || []).includes(state.user.id) ? "notification-unread" : ""}">
        <strong>Событие</strong>
        <div class="list-meta">${item.text}</div>
      </div>
    `)
    .join("");

  const applications = state.publicApplications
    .map(
      (application) => `
        <div class="list-item" data-application-card-id="${application.id}">
          <div class="list-head">
            <strong>${application.name}</strong>
            <span class="chip status-${slug(application.status)}">${getStatusLabel(application.status)}</span>
          </div>
          <div class="list-meta">${application.contact} · ${application.experience} · ${application.languages}</div>
          <p>${application.motivation}</p>
          ${
            state.user.role === "owner" && application.status === "new"
              ? `
            <div class="inline-actions">
              <button class="action-btn" data-approve-application="${application.id}" ${actionLockAttrs("обрабатывать заявки")}>Одобрить</button>
              <button class="action-btn" data-reject-application="${application.id}" ${actionLockAttrs("обрабатывать заявки")}>Отклонить</button>
            </div>
          `
              : ""
          }
        </div>
      `,
    )
    .join("");

  const audit = state.auditLog
    .map(
      (entry) => `
        <div class="list-item">
          <strong>${entry.action}</strong>
          <div class="list-meta">${entry.entityType} · ${entry.createdAt}</div>
        </div>
      `,
    )
    .join("");

  el("view-dashboard").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Общий обзор</h3>
        <div class="panel-subtitle">Ключевые цифры и сигналы по вашему рабочему контуру без лишнего шума.</div>
      </div>
      <button class="action-btn" id="quickCandidateBtn" ${actionLockAttrs("добавлять кандидатов")}>Добавить кандидата</button>
    </div>

    ${renderTrainingGuard()}

    <section class="stats-grid">
      <article class="mini-card">
        <span class="mini-label">Компания</span>
        <div class="metric-value">${state.metadata.companyName}</div>
        <div class="small-note">Локаль: ${state.metadata.locale}</div>
      </article>
      <article class="mini-card">
        <span class="mini-label">Ваш доступ</span>
        <div class="metric-value">${state.user.roleLabel}</div>
        <div class="small-note">Разрешения зависят от роли.</div>
      </article>
      <article class="mini-card">
        <span class="mini-label">Подписка</span>
        <div class="metric-value">${state.user.subscription}</div>
        <div class="small-note">Внутренний тарифный план</div>
      </article>
    </section>

    <section class="list-grid">
      <div>
        <h3>Быстрые сигналы</h3>
        ${notifications || '<p class="empty-text">Сейчас нет непрочитанных сигналов.</p>'}
      </div>
      <div>
        <h3>Аудит действий</h3>
        ${audit || '<p class="empty-text">Пока пусто.</p>'}
      </div>
    </section>

    ${
      state.user.role === "owner"
        ? `
          <section>
            <h3>Внешние заявки</h3>
            ${applications || '<p class="empty-text">Заявок пока нет.</p>'}
          </section>
        `
        : ""
    }
  `;

  el("quickCandidateBtn").addEventListener("click", async () => {
    if (!ensureTrainingUnlocked("добавлять кандидатов")) return;
    try {
      await api(API.candidates, {
        method: "POST",
        body: JSON.stringify({ name: "Быстрый кандидат", notes: "Добавлен из overview dashboard" }),
      });
      await reloadWorkspace();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelectorAll("[data-approve-application]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!ensureTrainingUnlocked("обрабатывать заявки")) return;
      try {
        await api(`/api/public/applications/${button.dataset.approveApplication}/approve`, {
          method: "PATCH",
          body: JSON.stringify({ createUser: true, role: "scout", teamId: state.metadata.referenceData.teams[0]?.id }),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-reject-application]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!ensureTrainingUnlocked("обрабатывать заявки")) return;
      try {
        await api(`/api/public/applications/${button.dataset.rejectApplication}/reject`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  bindTrainingGuardButton();
}

function renderNotificationsView() {
  const unread = getUnreadNotifications();
  const items = (state.notifications || [])
    .map(
      (item) => `
        <div class="list-item notification-card ${!(item.readBy || []).includes(state.user.id) ? "notification-unread" : ""}">
          <div class="list-head">
            <strong>${item.text}</strong>
            <span class="chip">${formatDateLabel(item.createdAt)}</span>
          </div>
          <div class="inline-actions">
            <button class="ghost-btn" type="button" data-open-notification-target="${item.id}">Открыть раздел</button>
            ${
              !(item.readBy || []).includes(state.user.id)
                ? `<button class="action-btn" type="button" data-read-notification="${item.id}">Прочитано</button>`
                : `<span class="chip">Прочитано</span>`
            }
          </div>
        </div>
      `,
    )
    .join("");

  el("view-notifications").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Центр уведомлений</h3>
        <div class="panel-subtitle">Все системные события, непрочитанные сигналы и быстрые переходы к рабочим разделам.</div>
      </div>
      <button class="primary-btn" id="readAllNotificationsBtn" ${!unread.length ? "disabled" : ""}>Прочитать все</button>
    </div>
    <section class="stats-grid">
      <article class="mini-card">
        <span class="mini-label">Всего</span>
        <div class="metric-value">${state.notifications.length}</div>
        <div class="small-note">События, видимые по вашей роли</div>
      </article>
      <article class="mini-card">
        <span class="mini-label">Непрочитанные</span>
        <div class="metric-value">${unread.length}</div>
        <div class="small-note">Требуют внимания прямо сейчас</div>
      </article>
      <article class="mini-card">
        <span class="mini-label">Live-канал</span>
        <div class="metric-value">${liveTransport === "sse" ? "SSE" : "Polling"}</div>
        <div class="small-note">Текущий способ доставки сигналов</div>
      </article>
    </section>
    <div class="table-like">${items || '<p class="empty-text">Уведомлений пока нет.</p>'}</div>
  `;

  const readAllNotificationsBtn = document.getElementById("readAllNotificationsBtn");
  if (readAllNotificationsBtn) {
    readAllNotificationsBtn.addEventListener("click", async () => {
      try {
        await api(`${API.notifications}/read-all`, { method: "POST" });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  document.querySelectorAll("[data-read-notification]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`${API.notifications}/${button.dataset.readNotification}/read`, { method: "PATCH" });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-open-notification-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const notification = (state.notifications || []).find((item) => item.id === button.dataset.openNotificationTarget);
      if (!notification) return;
      const target = resolveNotificationTarget(notification);
      if (!(notification.readBy || []).includes(state.user.id)) {
        try {
          await api(`${API.notifications}/${notification.id}/read`, { method: "PATCH" });
          state.notifications = state.notifications.map((item) =>
            item.id === notification.id ? { ...item, readBy: [...(item.readBy || []), state.user.id] } : item,
          );
        } catch (error) {
          toast(error.message);
        }
      }
      activeView = target.view;
      if (target.entityType && target.entityId) {
        setDeepLink(target.view, target.entityType, target.entityId);
      }
      renderWorkspace();
    });
  });
}

function renderCandidatesView() {
  const scoutOptions = optionsForUsers(["scout", "referral"]);
  const offerOptions = state.metadata.referenceData.offers || [];
  const teamOptions = state.metadata.referenceData.teams || [];
  const rows = state.candidates
    .map(
      (candidate) => {
        const candidateTimeline = (state.auditLog || [])
          .filter((entry) => entry.entityType === "candidate" && entry.entityId === candidate.id)
          .slice(0, 4);
        return `
        <div class="list-item" data-candidate-card-id="${candidate.id}">
          <div class="list-head">
            <strong>${candidate.name}</strong>
            <span class="chip status-${slug(candidate.status)}">${getStatusLabel(candidate.status)}</span>
          </div>
          <div class="list-meta">${candidate.offer?.title || "Без оффера"} · ${candidate.location} · ${candidate.scout.name}</div>
          <p>${candidate.notes}</p>
          <div class="chip-row">
            <span class="chip">${candidate.team?.name || "Без команды"}</span>
            <span class="chip">Interview slot: ${candidate.interviewAt ? formatDateTimeLabel(candidate.interviewAt) : "Не назначен"}</span>
            <span class="chip">Format: ${candidate.interviewFormat || "video"}</span>
            <span class="chip">${getInterviewStatusLabel(candidate.interviewStatus)}</span>
            <span class="chip">Interview: ${candidate.interviewPassed ? "Yes" : "No"}</span>
            <span class="chip">Registration: ${candidate.registrationPassed ? "Yes" : "No"}</span>
            <span class="chip">Shifts: ${candidate.shiftsCompleted}</span>
            <span class="chip">${candidate.kpiQualified ? "KPI counted" : "Not yet in KPI"}</span>
          </div>
          ${candidate.interviewNotes ? `<div class="small-note">Interview notes: ${candidate.interviewNotes}</div>` : ""}
          <div class="table-like compact-stack">
            ${(candidate.documents || [])
              .map(
                (document) => `
                  <div class="candidate-doc-row">
                    <div>
                      <strong>${document.title}</strong>
                      <div class="list-meta">${document.type} · ${formatDateLabel(document.createdAt)}</div>
                    </div>
                    <div class="inline-actions doc-actions">
                      ${document.url ? `<button class="ghost-btn doc-link-btn" type="button" data-preview-doc="${candidate.id}:${document.id}">Превью</button>` : `<span class="chip">Без ссылки</span>`}
                      ${document.url ? `<a class="ghost-btn doc-link-btn" href="${document.url}" target="_blank" rel="noreferrer">Открыть</a>` : ""}
                      <button class="ghost-btn doc-delete-btn" type="button" data-delete-doc="${candidate.id}:${document.id}" ${actionLockAttrs("удалять документы кандидата")}>Удалить</button>
                    </div>
                  </div>
                `,
              )
              .join("") || '<p class="empty-text">Документы пока не добавлены.</p>'}
          </div>
          <div class="inline-actions">
            <button class="action-btn" data-toggle-docs="${candidate.id}" ${actionLockAttrs("добавлять документы кандидата")}>Документы</button>
            <button class="action-btn" data-schedule-candidate="${candidate.id}" ${actionLockAttrs("назначать интервью")}>Назначить интервью</button>
            <button class="action-btn" data-candidate="${candidate.id}" data-update="interview" ${actionLockAttrs("обновлять статусы кандидатов")}>+ интервью</button>
            <button class="action-btn" data-candidate="${candidate.id}" data-update="registration" ${actionLockAttrs("обновлять статусы кандидатов")}>+ регистрация</button>
            <button class="action-btn" data-candidate="${candidate.id}" data-update="shift" ${actionLockAttrs("обновлять статусы кандидатов")}>+ смена</button>
          </div>
          <div class="list-grid candidate-detail-grid">
            <div>
              <h3>Комментарии</h3>
              <div class="table-like compact-stack">
                ${(candidate.comments || [])
                  .slice()
                  .reverse()
                  .map(
                    (comment) => `
                      <div class="comment-card">
                        <div class="chat-meta">
                          <strong>${comment.authorName}</strong>
                          <span class="list-meta">${formatDateTimeLabel(comment.createdAt)}</span>
                        </div>
                        <p>${comment.body}</p>
                      </div>
                    `,
                  )
                  .join("") || '<p class="empty-text">Комментариев пока нет.</p>'}
              </div>
              <form class="inline-actions comment-form" data-candidate-comment-form="${candidate.id}">
                <input class="chat-input" name="body" placeholder="Добавить заметку по кандидату..." />
                <button class="action-btn" type="submit" ${actionLockAttrs("комментировать кандидата")}>Сохранить</button>
              </form>
            </div>
            <div>
              <h3>Таймлайн</h3>
              <div class="table-like compact-stack">
                ${candidateTimeline
                  .map(
                    (entry) => `
                      <div class="list-item candidate-timeline-item">
                        <strong>${entry.action}</strong>
                        <div class="list-meta">${formatDateTimeLabel(entry.createdAt)}</div>
                      </div>
                    `,
                  )
                  .join("") || '<p class="empty-text">История по кандидату пока пуста.</p>'}
              </div>
            </div>
          </div>
          <form class="stack-form hidden" data-candidate-doc-form="${candidate.id}">
            <div class="form-row form-row-4">
              <label>Название<input name="title" placeholder="CV / Portfolio / Notes" required /></label>
              <label>Тип
                <select name="type">
                  <option value="link">Link</option>
                  <option value="file">File</option>
                  <option value="resume">Resume</option>
                  <option value="portfolio">Portfolio</option>
                  <option value="sheet">Sheet</option>
                </select>
              </label>
              <label>URL<input name="url" placeholder="https://..." /></label>
              <label>Заметка<input name="note" placeholder="Что важно по документу" /></label>
            </div>
            <div class="form-row form-row-4">
              <label>Файл<input name="file" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt" /></label>
            </div>
            <button class="primary-btn" type="submit" ${actionLockAttrs("добавлять документы кандидата")}>Сохранить документ</button>
          </form>
        </div>
      `;
      },
    )
    .join("");

  el("view-candidates").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Кандидаты и статусы</h3>
        <div class="panel-subtitle">Полная воронка кандидатов с ролевым доступом и KPI-логикой.</div>
      </div>
      <button class="primary-btn" id="toggleCandidateFormBtn" ${actionLockAttrs("добавлять кандидатов")}>Добавить кандидата</button>
    </div>
    ${renderTrainingGuard()}
    <form class="stack-form hidden" id="candidateCreateForm">
      <div class="form-row form-row-4">
        <label>Имя<input name="name" required placeholder="Имя кандидата" /></label>
        <label>Локация<input name="location" placeholder="Remote / City" /></label>
        <label>Оффер<select name="offerId">${optionMarkup(offerOptions, "title")}</select></label>
        <label>Команда<select name="teamId">${optionMarkup(teamOptions)}</select></label>
      </div>
      ${state.user.role === "owner" ? `<label>Скаут<select name="scoutId">${optionMarkup(scoutOptions)}</select></label>` : ""}
      <div class="form-row form-row-4">
        <label>Интервью дата/время<input name="interviewAt" type="datetime-local" /></label>
        <label>Формат
          <select name="interviewFormat">
            <option value="video">Video</option>
            <option value="voice">Voice</option>
            <option value="office">Office</option>
          </select>
        </label>
        <label>Статус интервью
          <select name="interviewStatus">
            <option value="unscheduled">Не назначено</option>
            <option value="scheduled">Назначено</option>
            <option value="completed">Проведено</option>
            <option value="rescheduled">Перенесено</option>
            <option value="no_show">Не явился</option>
          </select>
        </label>
        <label>Интервьюер<input name="interviewerName" placeholder="Кто проводит интервью" /></label>
      </div>
      <label>Заметки интервью<textarea name="interviewNotes" rows="2" placeholder="Что важно учесть перед созвоном"></textarea></label>
      <label>Заметки<textarea name="notes" rows="3" placeholder="Комментарий по кандидату"></textarea></label>
      <div class="inline-actions">
        <button class="primary-btn" type="submit" ${actionLockAttrs("добавлять кандидатов")}>Сохранить кандидата</button>
      </div>
    </form>
    <div class="table-like">${rows || '<p class="empty-text">Нет кандидатов.</p>'}</div>
  `;

  el("toggleCandidateFormBtn").addEventListener("click", () => {
    if (!ensureTrainingUnlocked("добавлять кандидатов")) return;
    el("candidateCreateForm").classList.toggle("hidden");
  });

  el("candidateCreateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureTrainingUnlocked("добавлять кандидатов")) return;
    const formData = new FormData(event.currentTarget);
    try {
      await api(API.candidates, {
        method: "POST",
        body: JSON.stringify({
          name: formData.get("name"),
          location: formData.get("location"),
          offerId: formData.get("offerId"),
          teamId: formData.get("teamId"),
          scoutId: formData.get("scoutId"),
          interviewAt: formData.get("interviewAt") ? new Date(formData.get("interviewAt")).toISOString() : null,
          interviewFormat: formData.get("interviewFormat"),
          interviewStatus: formData.get("interviewStatus"),
          interviewerName: formData.get("interviewerName"),
          interviewNotes: formData.get("interviewNotes"),
          notes: formData.get("notes"),
        }),
      });
      await reloadWorkspace();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelectorAll("[data-candidate]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!ensureTrainingUnlocked("обновлять статусы кандидатов")) return;
      const candidate = state.candidates.find((item) => item.id === button.dataset.candidate);
      if (!candidate) return;
      const payload = { notes: candidate.notes };
      if (button.dataset.update === "interview") {
        payload.interviewPassed = true;
        payload.interviewStatus = "completed";
        payload.status = "interview";
      }
      if (button.dataset.update === "registration") {
        payload.registrationPassed = true;
        payload.status = "registered";
      }
      if (button.dataset.update === "shift") {
        payload.shiftsCompleted = candidate.shiftsCompleted + 1;
        payload.status = candidate.shiftsCompleted + 1 >= 2 ? "twoShifts" : candidate.status;
      }
      try {
        await api(`${API.candidates}/${candidate.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-schedule-candidate]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!ensureTrainingUnlocked("назначать интервью")) return;
      const candidate = state.candidates.find((item) => item.id === button.dataset.scheduleCandidate);
      if (!candidate) return;
      const schedule = new Date(Date.now() + 24 * 60 * 60 * 1000);
      schedule.setHours(12, 0, 0, 0);
      try {
        await api(`${API.candidates}/${candidate.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            interviewAt: schedule.toISOString(),
            interviewFormat: candidate.interviewFormat || "video",
            interviewStatus: "scheduled",
            interviewerName: candidate.interviewerName || state.user.name,
            status: candidate.status === "screening" ? "interview" : candidate.status,
          }),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-toggle-docs]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!ensureTrainingUnlocked("добавлять документы кандидата")) return;
      const form = document.querySelector(`[data-candidate-doc-form="${button.dataset.toggleDocs}"]`);
      if (!form) return;
      form.classList.toggle("hidden");
    });
  });

  document.querySelectorAll("[data-candidate-doc-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ensureTrainingUnlocked("добавлять документы кандидата")) return;
      const formData = new FormData(event.currentTarget);
      try {
        const file = formData.get("file");
        let documentUrl = formData.get("url");
        if (file instanceof File && file.size > 0) {
          const upload = await api(API.uploads, {
            method: "POST",
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type || "application/octet-stream",
              dataBase64: await readFileAsBase64(file),
            }),
          });
          documentUrl = upload.upload.url;
        }
        const documentType = file instanceof File && file.size > 0 && formData.get("type") === "link"
          ? "file"
          : formData.get("type");
        await api(`${API.candidates}/${event.currentTarget.dataset.candidateDocForm}/documents`, {
          method: "POST",
          body: JSON.stringify({
            title: formData.get("title") || (file instanceof File && file.size > 0 ? file.name : ""),
            type: documentType,
            url: documentUrl,
            note: formData.get("note"),
          }),
        });
        event.currentTarget.reset();
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-candidate-comment-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ensureTrainingUnlocked("комментировать кандидата")) return;
      const formData = new FormData(event.currentTarget);
      try {
        await api(`${API.candidates}/${event.currentTarget.dataset.candidateCommentForm}/comments`, {
          method: "POST",
          body: JSON.stringify({
            body: formData.get("body"),
          }),
        });
        event.currentTarget.reset();
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-preview-doc]").forEach((button) => {
    button.addEventListener("click", () => {
      const [candidateId, documentId] = button.dataset.previewDoc.split(":");
      const candidate = state.candidates.find((item) => item.id === candidateId);
      const document = candidate?.documents?.find((item) => item.id === documentId);
      if (!document?.url) {
        toast("У документа нет ссылки для просмотра.");
        return;
      }
      activeDocumentPreview = document;
      renderDocumentPreview();
    });
  });

  document.querySelectorAll("[data-delete-doc]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!ensureTrainingUnlocked("удалять документы кандидата")) return;
      const [candidateId, documentId] = button.dataset.deleteDoc.split(":");
      try {
        await api(`${API.candidates}/${candidateId}/documents/${documentId}`, {
          method: "DELETE",
        });
        if (activeDocumentPreview?.id === documentId) {
          activeDocumentPreview = null;
          renderDocumentPreview();
        }
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  bindTrainingGuardButton();
}

function renderOffersView() {
  const scoutOptions = optionsForUsers(["scout", "referral"]);
  const rows = state.offers
    .map(
      (offer) => `
        <div class="list-item" data-offer-card-id="${offer.id}">
          <div class="list-head">
            <strong>${offer.title}</strong>
            <span class="chip ${offer.priority === "high" ? "priority-high" : ""}">${offer.reward}</span>
          </div>
          <div class="list-meta">Открыто мест: ${offer.openings} · Админ: ${offer.admin.name}</div>
          <div class="chip-row">
            ${offer.assignedScouts.map((person) => `<span class="chip">${person.name}</span>`).join("") || "<span class='chip'>Без назначений</span>"}
          </div>
        </div>
      `,
    )
    .join("");

  el("view-offers").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Офферы и назначения</h3>
        <div class="panel-subtitle">Главный админ создает офферы и распределяет по скаутам.</div>
      </div>
      ${
        state.metadata.permissions.manageOffers
          ? `<button class="primary-btn" id="toggleOfferFormBtn" ${actionLockAttrs("создавать офферы")}>Создать оффер</button>`
          : ""
      }
    </div>
    ${renderTrainingGuard()}
    ${
      state.metadata.permissions.manageOffers
        ? `
      <form class="stack-form hidden" id="offerCreateForm">
        <div class="form-row form-row-4">
          <label>Название<input name="title" required placeholder="Название оффера" /></label>
          <label>Награда<input name="reward" value="$300" /></label>
          <label>Открытых мест<input name="openings" type="number" min="1" value="3" /></label>
          <label>Приоритет
            <select name="priority">
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <label>Назначенные скауты
          <select name="assignedScoutIds" multiple size="4">${optionMarkup(scoutOptions)}</select>
        </label>
        <div class="inline-actions">
          <button class="primary-btn" type="submit" ${actionLockAttrs("создавать офферы")}>Создать оффер</button>
        </div>
      </form>
    `
        : ""
    }
    <div class="table-like">${rows || '<p class="empty-text">Нет офферов.</p>'}</div>
  `;

  const toggleOfferFormBtn = document.getElementById("toggleOfferFormBtn");
  if (toggleOfferFormBtn) {
    toggleOfferFormBtn.addEventListener("click", () => {
      if (!ensureTrainingUnlocked("создавать офферы")) return;
      el("offerCreateForm").classList.toggle("hidden");
    });
  }
  const offerCreateForm = document.getElementById("offerCreateForm");
  if (offerCreateForm) {
    offerCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ensureTrainingUnlocked("создавать офферы")) return;
      const formData = new FormData(event.currentTarget);
      try {
        await api(API.offers, {
          method: "POST",
          body: JSON.stringify({
            title: formData.get("title"),
            reward: formData.get("reward"),
            openings: Number(formData.get("openings")),
            priority: formData.get("priority"),
            assignedScoutIds: formData.getAll("assignedScoutIds"),
          }),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  bindTrainingGuardButton();
}

function renderCalendarView() {
  const interviews = state.candidates
    .filter((candidate) => candidate.interviewAt)
    .slice()
    .sort((left, right) => new Date(left.interviewAt) - new Date(right.interviewAt));
  const upcomingTasks = state.tasks
    .slice()
    .sort((left, right) => String(left.deadline || "").localeCompare(String(right.deadline || "")));
  const today = new Date().toISOString().slice(0, 10);
  const leadPlan = state.user.role === "owner"
    ? state.teams.map((team) => ({
        id: team.id,
        name: team.name,
        interviewsToday: interviews.filter((candidate) => candidate.team?.id === team.id && String(candidate.interviewAt || "").slice(0, 10) === today).length,
        openTasks: state.tasks.filter((task) => task.team?.id === team.id && !task.done).length,
      }))
    : [{
        id: state.user.teamId || "self",
        name: state.user.role === "lead" ? "Моя команда" : "Мой день",
        interviewsToday: interviews.filter((candidate) => String(candidate.interviewAt || "").slice(0, 10) === today).length,
        openTasks: state.tasks.filter((task) => !task.done && (task.assigneeUser?.id === state.user.id || task.team?.id === state.user.teamId)).length,
      }];
  const interviewerStats = Object.values(
    interviews.reduce((accumulator, candidate) => {
      const key = candidate.interviewerName || "Без интервьюера";
      if (!accumulator[key]) {
        accumulator[key] = {
          name: key,
          total: 0,
          completed: 0,
          noShow: 0,
          scheduled: 0,
        };
      }
      accumulator[key].total += 1;
      if (candidate.interviewStatus === "completed") accumulator[key].completed += 1;
      if (candidate.interviewStatus === "no_show") accumulator[key].noShow += 1;
      if (candidate.interviewStatus === "scheduled" || candidate.interviewStatus === "rescheduled") accumulator[key].scheduled += 1;
      return accumulator;
    }, {}),
  ).sort((left, right) => right.completed - left.completed || right.total - left.total);
  const interviewLog = interviews
    .slice()
    .sort((left, right) => new Date(right.interviewAt) - new Date(left.interviewAt))
    .slice(0, 8);

  const todayAgenda = [
    ...interviews
      .filter((candidate) => String(candidate.interviewAt || "").slice(0, 10) === today)
      .map((candidate) => ({
        title: `Интервью: ${candidate.name}`,
        meta: `${formatDateTimeLabel(candidate.interviewAt)} · ${candidate.interviewFormat || "video"} · ${candidate.offer?.title || "Без оффера"}`,
      })),
    ...upcomingTasks
      .filter((task) => task.deadline === today)
      .map((task) => ({
        title: `Дедлайн: ${task.title}`,
        meta: `${task.team?.name || task.assigneeUser?.name || "Без назначения"} · ${task.priority}`,
      })),
  ];

  el("view-calendar").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Календарь и планирование</h3>
        <div class="panel-subtitle">Ближайшие интервью, дедлайны задач и повестка на день.</div>
      </div>
    </div>
    ${renderTrainingGuard()}

    <section class="stats-grid">
      <article class="mini-card">
        <span class="mini-label">Интервью в плане</span>
        <div class="metric-value">${interviews.length}</div>
        <div class="small-note">Все назначенные интервью в видимой вам зоне</div>
      </article>
      <article class="mini-card">
        <span class="mini-label">На сегодня</span>
        <div class="metric-value">${todayAgenda.length}</div>
        <div class="small-note">Интервью и дедлайны на текущий день</div>
      </article>
      <article class="mini-card">
        <span class="mini-label">Ближайшие дедлайны</span>
        <div class="metric-value">${upcomingTasks.length}</div>
        <div class="small-note">Задачи в рабочем календарном потоке</div>
      </article>
    </section>

    <section>
      <h3>План тимлида на день</h3>
      <div class="table-like">
        ${leadPlan
          .map(
            (item) => `
              <div class="calendar-row">
                <div>
                  <strong>${item.name}</strong>
                  <div class="list-meta">Интервью сегодня: ${item.interviewsToday}</div>
                </div>
                <span class="chip">${item.openTasks} открытых задач</span>
                <span class="chip">${item.interviewsToday ? "Нужен контроль" : "Ровный день"}</span>
                <button class="ghost-btn" type="button" data-open-plan="${item.id}">Сфокусироваться</button>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>

    <section class="list-grid">
      <div>
        <h3>Статистика интервьюеров</h3>
        <div class="table-like">
          ${interviewerStats
            .map(
              (item) => `
                <div class="calendar-row">
                  <div>
                    <strong>${item.name}</strong>
                    <div class="list-meta">Всего интервью: ${item.total}</div>
                  </div>
                  <span class="chip">Проведено: ${item.completed}</span>
                  <span class="chip">В плане: ${item.scheduled}</span>
                  <span class="chip">No-show: ${item.noShow}</span>
                  <span class="chip">${item.total ? Math.round((item.completed / item.total) * 100) : 0}% completion</span>
                </div>
              `,
            )
            .join("") || '<p class="empty-text">Статистики по интервьюерам пока нет.</p>'}
        </div>
      </div>
      <div>
        <h3>Журнал интервью</h3>
        <div class="table-like">
          ${interviewLog
            .map(
              (candidate) => `
                <div class="list-item" data-candidate-card-id="${candidate.id}">
                  <div class="list-head">
                    <strong>${candidate.name}</strong>
                    <span class="chip">${getInterviewStatusLabel(candidate.interviewStatus)}</span>
                  </div>
                  <div class="list-meta">${formatDateTimeLabel(candidate.interviewAt)} · ${candidate.interviewerName || "Без интервьюера"}</div>
                  <p>${candidate.interviewNotes || "Заметки по интервью пока не заполнены."}</p>
                </div>
              `,
            )
            .join("") || '<p class="empty-text">Журнал пока пуст.</p>'}
        </div>
      </div>
    </section>

    <section class="list-grid">
      <div>
        <h3>Сегодня</h3>
        <div class="table-like">
          ${todayAgenda
            .map(
              (item) => `
                <div class="list-item">
                  <strong>${item.title}</strong>
                  <div class="list-meta">${item.meta}</div>
                </div>
              `,
            )
            .join("") || '<p class="empty-text">На сегодня событий нет.</p>'}
        </div>
      </div>
      <div>
        <h3>Ближайшие интервью</h3>
        <div class="table-like">
          ${interviews
            .map(
              (candidate) => `
                <div class="calendar-row">
                  <div>
                    <strong>${candidate.name}</strong>
                    <div class="list-meta">${candidate.offer?.title || "Без оффера"} · ${candidate.scout?.name || "Без скаута"}</div>
                  </div>
                  <span class="chip">${formatDateTimeLabel(candidate.interviewAt)}</span>
                  <span class="chip">${candidate.interviewFormat || "video"}</span>
                  <span class="chip">${candidate.interviewerName || "Интервьюер не назначен"}</span>
                  <span class="chip">${getInterviewStatusLabel(candidate.interviewStatus)}</span>
                  <div class="inline-actions">
                    <button class="ghost-btn" type="button" data-calendar-action="${candidate.id}:completed">Проведено</button>
                    <button class="ghost-btn" type="button" data-calendar-action="${candidate.id}:rescheduled">Перенести</button>
                    <button class="ghost-btn" type="button" data-calendar-action="${candidate.id}:no_show">No-show</button>
                  </div>
                </div>
                ${candidate.interviewNotes ? `<div class="small-note calendar-note">${candidate.interviewNotes}</div>` : ""}
              `,
            )
            .join("") || '<p class="empty-text">Интервью пока не назначены.</p>'}
        </div>
      </div>
    </section>

    <section>
      <h3>План по задачам</h3>
      <div class="table-like">
        ${upcomingTasks
          .map(
            (task) => `
              <div class="calendar-row">
                <div>
                  <strong>${task.title}</strong>
                  <div class="list-meta">${task.team?.name || task.assigneeUser?.name || "Без назначения"}</div>
                </div>
                <span class="chip">${task.deadline || "Без дедлайна"}</span>
                <span class="chip ${task.priority === "high" ? "priority-high" : ""}">${task.priority}</span>
                <span class="chip">${task.done ? "Закрыта" : "Открыта"}</span>
              </div>
            `,
          )
          .join("") || '<p class="empty-text">Задач для календаря пока нет.</p>'}
      </div>
    </section>
  `;

  document.querySelectorAll("[data-open-plan]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = "tasks";
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-calendar-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!ensureTrainingUnlocked("управлять интервью")) return;
      const [candidateId, action] = button.dataset.calendarAction.split(":");
      const candidate = state.candidates.find((item) => item.id === candidateId);
      if (!candidate) return;
      const payload = {
        interviewStatus: action,
        interviewNotes: candidate.interviewNotes,
      };
      if (action === "completed") {
        payload.interviewPassed = true;
        payload.status = "interview";
      }
      if (action === "rescheduled") {
        const schedule = new Date(candidate.interviewAt || Date.now());
        schedule.setHours(schedule.getHours() + 24);
        payload.interviewAt = schedule.toISOString();
        payload.interviewStatus = "rescheduled";
        payload.interviewPassed = false;
      }
      if (action === "no_show") {
        payload.interviewPassed = false;
        payload.status = "screening";
      }
      try {
        await api(`${API.candidates}/${candidate.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  bindTrainingGuardButton();
}

function renderTeamsView() {
  const teamMarkup = state.teams
    .map(
      (team) => `
        <div class="list-item team-overview-card">
          <div class="list-head">
            <strong>${team.name}</strong>
            <span class="chip">${team.kpiPercent}% KPI</span>
          </div>
          <div class="list-meta">Тимлид: ${team.leadUser.name} · Участников: ${team.membersExpanded.length}</div>
          <div class="chip-row">
            <span class="chip">Lead %: ${team.leadPercent}%</span>
            <span class="chip">Company %: ${team.companyPercent}%</span>
            ${team.membersExpanded.map((member) => `<span class="chip">${member.name}</span>`).join("")}
          </div>
        </div>
      `,
    )
    .join("");

  el("view-teams").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Команды</h3>
        <div class="panel-subtitle">Распределение процентов, KPI и состав каждой команды без коммуникационного блока.</div>
      </div>
    </div>
    ${renderTrainingGuard()}
    <section>
      <div class="section-heading-row">
        <h3>Команды</h3>
        <span class="chip">${state.teams.length} активных команд</span>
      </div>
      <div class="table-like team-overview-list">${teamMarkup || '<p class="empty-text">Нет команд.</p>'}</div>
    </section>
    <section>
      <div class="section-heading-row">
        <h3>Командная структура</h3>
        <span class="chip">${state.teams.reduce((sum, team) => sum + team.membersExpanded.length, 0)} участников</span>
      </div>
      <div class="small-note">Чат полностью удален из проекта. В этом разделе остаются только команды, состав, проценты и KPI.</div>
    </section>
  `;

  bindTrainingGuardButton();
}

function getFinanceModel() {
  const payoutSource = (state.payouts || [])
    .filter((payout) => isInFinancePeriod(payout.createdAt, financePeriod))
    .map((payout) => {
      const candidate = state.candidates.find((item) => item.id === payout.candidateId);
      const scout = (state.metadata.referenceData.users || []).find((item) => item.id === payout.scoutId);
      const team = state.teams.find((item) => item.id === payout.teamId) || state.metadata.referenceData.teams.find((item) => item.id === payout.teamId);
      const offer = state.offers.find((item) => item.id === payout.offerId) || state.metadata.referenceData.offers.find((item) => item.id === payout.offerId);
      return {
        ...payout,
        name: candidate?.name || "Кандидат",
        offerTitle: offer?.title || "Без оффера",
        teamName: team?.name || "Без команды",
        scoutName: scout?.name || "Без скаута",
        payoutStatus: payout.status,
        baseReward: payout.baseAmount,
        projectedPayout: payout.finalAmount,
      };
    });

  const filteredLedger = payoutSource.filter((item) => {
    const statusMatches = financeFilters.status === "all" || item.payoutStatus === financeFilters.status;
    const scoutMatches = financeFilters.scoutId === "all" || item.scoutId === financeFilters.scoutId;
    const teamMatches = financeFilters.teamId === "all" || item.teamId === financeFilters.teamId;
    return statusMatches && scoutMatches && teamMatches;
  });

  const visiblePersonalPayouts = filteredLedger.filter((item) =>
    state.user.role === "owner" ? true : item.scoutId === state.user.id,
  );
  const qualifiedPayouts = visiblePersonalPayouts;

  const personalBase = qualifiedPayouts.reduce((sum, item) => sum + item.baseAmount, 0);
  const personalBoost = qualifiedPayouts.reduce((sum, item) => sum + item.boostAmount, 0);
  const personalProjected = qualifiedPayouts.reduce((sum, item) => sum + item.finalAmount, 0);
  const referralProjected = qualifiedPayouts.reduce((sum, item) => sum + item.referralAmount, 0);
  const boostPercent = parsePercent(state.user.payoutBoost);

  const teamFinance = state.teams.map((team) => {
    const teamPayouts = filteredLedger.filter((payout) => payout.teamId === team.id);
    const gross = teamPayouts.reduce((sum, payout) => sum + payout.baseAmount, 0);
    const leadShare = Math.round((gross * team.leadPercent) / 100);
    const companyShare = Math.round((gross * team.companyPercent) / 100);
    const scoutPool = Math.max(gross - leadShare - companyShare, 0);
    return {
      id: team.id,
      name: team.name,
      qualifiedCount: teamPayouts.length,
      gross,
      leadShare,
      companyShare,
      scoutPool,
      leadPercent: team.leadPercent,
      companyPercent: team.companyPercent,
    };
  }).sort((left, right) => right.gross - left.gross);

  const ledger = filteredLedger
    .map((item) => ({
      ...item,
    }))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));

  const statusBreakdown = {
    pending: ledger.filter((item) => item.payoutStatus === "pending").reduce((sum, item) => sum + item.finalAmount, 0),
    approved: ledger.filter((item) => item.payoutStatus === "approved").reduce((sum, item) => sum + item.finalAmount, 0),
    paid: ledger.filter((item) => item.payoutStatus === "paid").reduce((sum, item) => sum + item.finalAmount, 0),
  };

  const leadershipBoard = state.metadata.referenceData.users
    .filter((person) => ["lead", "scout", "referral"].includes(person.role))
    .map((person) => {
      const personPayouts = filteredLedger.filter((payout) => payout.scoutId === person.id);
      const gross = personPayouts.reduce((sum, payout) => sum + payout.baseAmount, 0);
      const boost = personPayouts.reduce((sum, payout) => sum + payout.boostAmount, 0);
      return {
        id: person.id,
        name: person.name,
        role: person.role,
        qualifiedCount: personPayouts.length,
        gross,
        boost,
        projected: gross + boost,
      };
    })
    .filter((person) => person.qualifiedCount > 0 || state.user.role === "owner")
    .sort((left, right) => right.projected - left.projected);

  const batches = [
    {
      id: "pending",
      label: "Готовить payout batch",
      status: "pending",
      amount: statusBreakdown.pending,
      count: ledger.filter((item) => item.payoutStatus === "pending").length,
      note: "Новые кейсы, которые можно проверить и подтвердить.",
    },
    {
      id: "approved",
      label: "Ближайшая выплата",
      status: "approved",
      amount: statusBreakdown.approved,
      count: ledger.filter((item) => item.payoutStatus === "approved").length,
      note: "Подтвержденные выплаты, готовые к переводу.",
    },
    {
      id: "paid",
      label: "Закрытый batch",
      status: "paid",
      amount: statusBreakdown.paid,
      count: ledger.filter((item) => item.payoutStatus === "paid").length,
      note: "Уже закрытые и выплаченные записи.",
    },
  ];

  return {
    boostPercent,
    qualifiedPayouts,
    personalBase,
    personalBoost,
    personalProjected,
    referralProjected,
    teamFinance,
    ledger,
    statusBreakdown,
    leadershipBoard,
    batches,
  };
}

function renderTasksView() {
  const teamOptions = state.metadata.referenceData.teams || [];
  const userOptions = state.metadata.referenceData.users || [];
  const rows = state.tasks
    .map(
      (task) => `
        <div class="list-item" data-task-card-id="${task.id}">
          <div class="list-head">
            <strong>${task.title}</strong>
            <span class="chip ${task.priority === "high" ? "priority-high" : ""}">${task.deadline}</span>
          </div>
          <div class="list-meta">${task.team?.name || task.assigneeUser?.name || "Без назначения"}</div>
          <div class="inline-actions">
            <button class="action-btn" data-task-toggle="${task.id}" ${actionLockAttrs("менять статус задач")}>${task.done ? "Переоткрыть" : "Закрыть задачу"}</button>
          </div>
        </div>
      `,
    )
    .join("");

  el("view-tasks").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Задачи и операционный контроль</h3>
        <div class="panel-subtitle">Постановка задач по командам и пользователям.</div>
      </div>
      ${
        state.metadata.permissions.manageTasks
          ? `<button class="primary-btn" id="toggleTaskFormBtn" ${actionLockAttrs("создавать задачи")}>Новая задача</button>`
          : ""
      }
    </div>
    ${renderTrainingGuard()}
    ${
      state.metadata.permissions.manageTasks
        ? `
      <form class="stack-form hidden" id="taskCreateForm">
        <div class="form-row form-row-4">
          <label>Задача<input name="title" required placeholder="Описание задачи" /></label>
          <label>Дедлайн<input name="deadline" type="date" /></label>
          <label>Команда<select name="teamId"><option value="">Без команды</option>${optionMarkup(teamOptions)}</select></label>
          <label>Пользователь<select name="assigneeUserId"><option value="">Без пользователя</option>${optionMarkup(userOptions)}</select></label>
        </div>
        <label>Приоритет
          <select name="priority">
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <button class="primary-btn" type="submit" ${actionLockAttrs("создавать задачи")}>Создать задачу</button>
      </form>
    `
        : ""
    }
    <div class="table-like">${rows || '<p class="empty-text">Нет задач.</p>'}</div>
  `;

  const toggleTaskFormBtn = document.getElementById("toggleTaskFormBtn");
  if (toggleTaskFormBtn) {
    toggleTaskFormBtn.addEventListener("click", () => {
      if (!ensureTrainingUnlocked("создавать задачи")) return;
      el("taskCreateForm").classList.toggle("hidden");
    });
  }
  const taskCreateForm = document.getElementById("taskCreateForm");
  if (taskCreateForm) {
    taskCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ensureTrainingUnlocked("создавать задачи")) return;
      const formData = new FormData(event.currentTarget);
      try {
        await api(API.tasks, {
          method: "POST",
          body: JSON.stringify({
            title: formData.get("title"),
            deadline: formData.get("deadline"),
            teamId: formData.get("teamId") || null,
            assigneeUserId: formData.get("assigneeUserId") || null,
            priority: formData.get("priority"),
          }),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  document.querySelectorAll("[data-task-toggle]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!ensureTrainingUnlocked("менять статус задач")) return;
      const task = state.tasks.find((item) => item.id === button.dataset.taskToggle);
      if (!task) return;
      try {
        await api(`${API.tasks}/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ done: !task.done }),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  bindTrainingGuardButton();
}

function renderFinanceView() {
  const finance = getFinanceModel();
  const payoutAudit = (state.auditLog || []).filter((item) => item.entityType === "payout");
  const scoutOptions = (state.metadata.referenceData.users || []).filter((item) => ["scout", "referral", "lead"].includes(item.role));
  const teamOptions = state.metadata.referenceData.teams || [];
  const periodOptions = [
    { id: "day", label: "24 часа" },
    { id: "week", label: "7 дней" },
    { id: "month", label: "30 дней" },
    { id: "all", label: "Все время" },
  ];
  const payoutRows = finance.qualifiedPayouts
    .map(
      (item) => `
        <div class="finance-row">
          <div>
            <strong>${item.name}</strong>
            <div class="list-meta">${item.offerTitle} · ${item.teamName} · ${formatDateLabel(item.createdAt)}</div>
          </div>
          <span class="chip">База: ${formatMoney(item.baseReward)}</span>
          <span class="chip">Буст: ${formatMoney(item.boostAmount)}</span>
          <strong>${formatMoney(item.projectedPayout)}</strong>
        </div>
      `,
    )
    .join("");

  const ledgerRows = finance.ledger
    .map(
      (item) => `
        <div class="finance-ledger-row">
          <div>
            <strong>${item.name}</strong>
            <div class="list-meta">${item.offerTitle} · ${item.scoutName} · ${formatDateLabel(item.createdAt)}</div>
          </div>
          <span class="chip status-${item.payoutStatus}">${item.payoutStatus === "paid" ? "Выплачено" : item.payoutStatus === "approved" ? "Подтверждено" : "Ожидает"}</span>
          <span class="chip">Реф. канал: ${formatMoney(item.referralAmount)}</span>
          <div class="finance-ledger-actions">
            <strong>${formatMoney(item.finalAmount)}</strong>
            ${
              state.user.role === "owner"
                ? `
              <div class="inline-actions">
                ${item.payoutStatus === "pending" ? `<button class="action-btn" data-payout-status="${item.id}" data-status="approved">Подтвердить</button>` : ""}
                ${item.payoutStatus !== "paid" ? `<button class="action-btn" data-payout-status="${item.id}" data-status="paid">Отметить выплату</button>` : ""}
              </div>
            `
                : ""
            }
          </div>
        </div>
      `,
    )
    .join("");

  const teamRows = finance.teamFinance
    .map(
      (team) => `
        <div class="finance-row finance-row-team">
          <div>
            <strong>${team.name}</strong>
            <div class="list-meta">KPI-закрытий: ${team.qualifiedCount}</div>
          </div>
          <span class="chip">Lead ${team.leadPercent}%: ${formatMoney(team.leadShare)}</span>
          <span class="chip">Company ${team.companyPercent}%: ${formatMoney(team.companyShare)}</span>
          <strong>${formatMoney(team.scoutPool)}</strong>
        </div>
      `,
    )
    .join("");

  const leadershipRows = finance.leadershipBoard
    .map(
      (item) => `
        <div class="finance-ledger-row">
          <div>
            <strong>${item.name}</strong>
            <div class="list-meta">${roles[item.role]} · KPI-кейсов: ${item.qualifiedCount}</div>
          </div>
          <span class="chip">База: ${formatMoney(item.gross)}</span>
          <span class="chip">Буст: ${formatMoney(item.boost)}</span>
          <strong>${formatMoney(item.projected)}</strong>
        </div>
      `,
    )
    .join("");

  const batchRows = finance.batches
    .map(
      (batch) => `
        <div class="batch-card">
          <div class="list-head">
            <strong>${batch.label}</strong>
            <span class="chip status-${batch.status}">${batch.count} записей</span>
          </div>
          <div class="metric-value">${formatMoney(batch.amount)}</div>
          <div class="small-note">${batch.note}</div>
          <div class="inline-actions">
            <button class="action-btn" data-batch-filter="${batch.status}">Показать batch</button>
            ${
              state.user.role === "owner" && batch.count
                ? `<button class="primary-btn" data-batch-apply="${batch.status}">${batch.status === "pending" ? "Подтвердить все" : batch.status === "approved" ? "Выплатить все" : "Отчет"}</button>`
                : ""
            }
          </div>
        </div>
      `,
    )
    .join("");

  const payoutAuditRows = payoutAudit
    .map(
      (item) => `
        <div class="list-item">
          <div class="list-head">
            <strong>${item.action}</strong>
            <span class="chip">${item.entityId}</span>
          </div>
          <div class="list-meta">${formatDateLabel(item.createdAt)} · ${JSON.stringify(item.details || {})}</div>
        </div>
      `,
    )
    .join("");

  el("view-finance").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Финансы и выплаты</h3>
        <div class="panel-subtitle">Прогноз по выплатам строится на KPI-кандидатах, бусте профиля и процентной модели команды.</div>
      </div>
      <div class="period-switch">
        ${periodOptions
          .map(
            (item) => `
              <button class="period-chip ${financePeriod === item.id ? "active" : ""}" data-finance-period="${item.id}">${item.label}</button>
            `,
          )
          .join("")}
      </div>
    </div>
    ${renderTrainingGuard()}

    ${
      state.user.role === "owner"
        ? `
      <section class="finance-filter-bar">
        <label>
          Статус
          <select id="financeStatusFilter">
            <option value="all" ${financeFilters.status === "all" ? "selected" : ""}>Все</option>
            <option value="pending" ${financeFilters.status === "pending" ? "selected" : ""}>Ожидает</option>
            <option value="approved" ${financeFilters.status === "approved" ? "selected" : ""}>Подтверждено</option>
            <option value="paid" ${financeFilters.status === "paid" ? "selected" : ""}>Выплачено</option>
          </select>
        </label>
        <label>
          Скаут
          <select id="financeScoutFilter">
            <option value="all">Все</option>
            ${scoutOptions
              .map(
                (item) => `<option value="${item.id}" ${financeFilters.scoutId === item.id ? "selected" : ""}>${item.name}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label>
          Команда
          <select id="financeTeamFilter">
            <option value="all">Все</option>
            ${teamOptions
              .map(
                (item) => `<option value="${item.id}" ${financeFilters.teamId === item.id ? "selected" : ""}>${item.name}</option>`,
              )
              .join("")}
          </select>
        </label>
        <div class="inline-actions finance-toolbar">
          <button class="secondary-btn" id="financeResetFiltersBtn">Сбросить</button>
          <button class="primary-btn" id="financeExportBtn">Экспорт CSV</button>
          <button class="ghost-btn" id="financeReportBtn">Payout report</button>
        </div>
      </section>
    `
        : ""
    }

    <section class="stats-grid">
      <article class="mini-card">
        <span class="mini-label">KPI закрыто</span>
        <div class="metric-value">${finance.qualifiedPayouts.length}</div>
        <div class="small-note">Кандидаты с интервью, регистрацией и двумя сменами</div>
      </article>
      <article class="mini-card">
        <span class="mini-label">Базовый пул</span>
        <div class="metric-value">${formatMoney(finance.personalBase)}</div>
        <div class="small-note">Сумма reward по вашим KPI-кандидатам</div>
      </article>
      <article class="mini-card">
        <span class="mini-label">Буст профиля</span>
        <div class="metric-value">${formatMoney(finance.personalBoost)}</div>
        <div class="small-note">${state.user.payoutBoost} добавляется к личным успешным офферам</div>
      </article>
      <article class="mini-card">
        <span class="mini-label">Уже выплачено</span>
        <div class="metric-value">${formatMoney(finance.statusBreakdown.paid)}</div>
        <div class="small-note">Расчетная сумма по кейсам со статусом выплаты "выплачено"</div>
      </article>
    </section>

    <section class="list-grid">
      <div>
        <h3>Личный прогноз выплат</h3>
        <div class="finance-total">
          <strong>${formatMoney(finance.personalProjected)}</strong>
          <span class="small-note">Итог с учетом текущего буста профиля</span>
        </div>
        <div class="table-like">${payoutRows || '<p class="empty-text">Пока нет KPI-кандидатов, влияющих на выплаты.</p>'}</div>
      </div>
      <div>
        <h3>Реферальный контур</h3>
        <div class="profile-block finance-side-card">
          <div class="chip-row">
            <span class="chip">Код: ${state.user.referralCode}</span>
            <span class="chip">Процент: ${state.user.referralIncomePercent}%</span>
            <span class="chip">Подписка: ${state.user.subscription}</span>
          </div>
          <p class="small-note">До привязки детальной сети рефералов блок показывает расчетный доход по вашему текущему проценту и результатам.</p>
          <div class="metric-value">${formatMoney(finance.referralProjected)}</div>
        </div>
      </div>
    </section>

    <section class="stats-grid">
      <article class="mini-card">
        <span class="mini-label">Ожидает</span>
        <div class="metric-value">${formatMoney(finance.statusBreakdown.pending)}</div>
        <div class="small-note">Новые кейсы, еще не дошедшие до подтверждения выплаты</div>
      </article>
      <article class="mini-card">
        <span class="mini-label">Подтверждено</span>
        <div class="metric-value">${formatMoney(finance.statusBreakdown.approved)}</div>
        <div class="small-note">Сумма, которую можно готовить к ближайшей выплате</div>
      </article>
      <article class="mini-card">
        <span class="mini-label">Реферальный доход</span>
        <div class="metric-value">${formatMoney(finance.referralProjected)}</div>
        <div class="small-note">Расчет по вашему текущему проценту канала</div>
      </article>
    </section>

    <section class="list-grid">
      <div>
        <h3>Ledger выплат</h3>
        <div class="table-like">${ledgerRows || '<p class="empty-text">За выбранный период пока нет записей в ledger.</p>'}</div>
      </div>
      <div>
        <h3>${state.user.role === "owner" ? "Payroll leaderboard" : "Ваш payout-rank"}</h3>
        <div class="table-like">${leadershipRows || '<p class="empty-text">Пока нет данных для сравнения выплат.</p>'}</div>
      </div>
    </section>

    ${
      state.user.role === "owner"
        ? `
      <section>
        <h3>Payout batches</h3>
        <div class="batch-grid">${batchRows}</div>
      </section>
    `
        : ""
    }

    ${
      state.user.role === "owner"
        ? `
      <section>
        <h3>История payout-событий</h3>
        <div class="table-like">${payoutAuditRows || '<p class="empty-text">История payout-действий пока пуста.</p>'}</div>
      </section>
    `
        : ""
    }

    <section>
      <h3>Экономика команд</h3>
      <div class="table-like">${teamRows || '<p class="empty-text">Для вашей роли пока нет видимых командных выплат.</p>'}</div>
    </section>
  `;

  document.querySelectorAll("[data-finance-period]").forEach((button) => {
    button.addEventListener("click", () => {
      financePeriod = button.dataset.financePeriod;
      renderFinanceView();
    });
  });

  document.querySelectorAll("[data-payout-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`${API.payouts}/${button.dataset.payoutStatus}`, {
          method: "PATCH",
          body: JSON.stringify({ status: button.dataset.status }),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-batch-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      financeFilters.status = button.dataset.batchFilter;
      renderFinanceView();
    });
  });

  document.querySelectorAll("[data-batch-apply]").forEach((button) => {
    button.addEventListener("click", async () => {
      const fromStatus = button.dataset.batchApply;
      const targetStatus = fromStatus === "pending" ? "approved" : fromStatus === "approved" ? "paid" : null;
      if (!targetStatus) {
        toast("Для закрытого batch используйте payout report.");
        return;
      }
      const payoutIds = finance.ledger.filter((item) => item.payoutStatus === fromStatus).map((item) => item.id);
      if (!payoutIds.length) {
        toast("Нет выплат для массового действия.");
        return;
      }
      try {
        await api(`${API.payouts}/batch`, {
          method: "POST",
          body: JSON.stringify({ payoutIds, status: targetStatus }),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  const financeStatusFilter = document.getElementById("financeStatusFilter");
  if (financeStatusFilter) {
    financeStatusFilter.addEventListener("change", (event) => {
      financeFilters.status = event.target.value;
      renderFinanceView();
    });
  }

  const financeScoutFilter = document.getElementById("financeScoutFilter");
  if (financeScoutFilter) {
    financeScoutFilter.addEventListener("change", (event) => {
      financeFilters.scoutId = event.target.value;
      renderFinanceView();
    });
  }

  const financeTeamFilter = document.getElementById("financeTeamFilter");
  if (financeTeamFilter) {
    financeTeamFilter.addEventListener("change", (event) => {
      financeFilters.teamId = event.target.value;
      renderFinanceView();
    });
  }

  const financeResetFiltersBtn = document.getElementById("financeResetFiltersBtn");
  if (financeResetFiltersBtn) {
    financeResetFiltersBtn.addEventListener("click", () => {
      financeFilters = { status: "all", scoutId: "all", teamId: "all" };
      renderFinanceView();
    });
  }

  const financeExportBtn = document.getElementById("financeExportBtn");
  if (financeExportBtn) {
    financeExportBtn.addEventListener("click", () => {
      const rows = finance.ledger.map((item) =>
        [
          item.name,
          item.scoutName,
          item.teamName,
          item.offerTitle,
          item.payoutStatus,
          item.baseAmount,
          item.boostAmount,
          item.finalAmount,
          item.referralAmount,
          item.createdAt,
        ].join(","),
      );
      const csv = [
        "candidate,scout,team,offer,status,base_amount,boost_amount,final_amount,referral_amount,created_at",
        ...rows,
      ].join("\n");
      downloadTextFile(`scoutflow-payouts-${financePeriod}.csv`, csv, "text/csv;charset=utf-8");
    });
  }

  const financeReportBtn = document.getElementById("financeReportBtn");
  if (financeReportBtn) {
    financeReportBtn.addEventListener("click", () => {
      const lines = [
        `Every Scouting payout report`,
        `Period: ${financePeriod}`,
        `Status filter: ${financeFilters.status}`,
        `Scout filter: ${financeFilters.scoutId}`,
        `Team filter: ${financeFilters.teamId}`,
        ``,
        `Pending: ${formatMoney(finance.statusBreakdown.pending)}`,
        `Approved: ${formatMoney(finance.statusBreakdown.approved)}`,
        `Paid: ${formatMoney(finance.statusBreakdown.paid)}`,
        ``,
        `Ledger:`,
        ...finance.ledger.map(
          (item) =>
            `${item.name} | ${item.scoutName} | ${item.teamName} | ${item.offerTitle} | ${item.payoutStatus} | ${formatMoney(item.finalAmount)}`,
        ),
      ];
      downloadTextFile(`scoutflow-payout-report-${financePeriod}.txt`, lines.join("\n"));
    });
  }

  bindTrainingGuardButton();
}

function renderAnalyticsView() {
  const candidates = state.candidates || [];
  const interviews = candidates.filter((candidate) => candidate.interviewAt);
  const completedInterviews = candidates.filter((candidate) => candidate.interviewStatus === "completed" || candidate.interviewPassed);
  const registered = candidates.filter((candidate) => candidate.registrationPassed);
  const kpiQualified = candidates.filter((candidate) => candidate.kpiQualified);
  const offerCount = state.offers.length || 1;

  const funnel = [
    { label: "Всего кандидатов", value: candidates.length, note: "Видимые по вашей роли" },
    { label: "Назначено интервью", value: interviews.length, note: candidates.length ? `${Math.round((interviews.length / candidates.length) * 100)}% от потока` : "0% от потока" },
    { label: "Проведено интервью", value: completedInterviews.length, note: interviews.length ? `${Math.round((completedInterviews.length / interviews.length) * 100)}% completion` : "0% completion" },
    { label: "Регистрация", value: registered.length, note: completedInterviews.length ? `${Math.round((registered.length / completedInterviews.length) * 100)}% после интервью` : "0% после интервью" },
    { label: "KPI зачтено", value: kpiQualified.length, note: registered.length ? `${Math.round((kpiQualified.length / registered.length) * 100)}% после регистрации` : "0% после регистрации" },
  ];

  const teamAnalytics = state.teams
    .map((team) => {
      const teamCandidates = candidates.filter((candidate) => candidate.team?.id === team.id || candidate.teamId === team.id);
      const teamQualified = teamCandidates.filter((candidate) => candidate.kpiQualified).length;
      const teamInterviews = teamCandidates.filter((candidate) => candidate.interviewAt).length;
      return {
        id: team.id,
        name: team.name,
        candidates: teamCandidates.length,
        interviews: teamInterviews,
        qualified: teamQualified,
        conversion: teamCandidates.length ? Math.round((teamQualified / teamCandidates.length) * 100) : 0,
      };
    })
    .sort((left, right) => right.conversion - left.conversion || right.qualified - left.qualified);

  const scoutAnalytics = (state.metadata.referenceData.users || [])
    .filter((user) => ["lead", "scout", "referral"].includes(user.role))
    .map((user) => {
      const ownedCandidates = candidates.filter((candidate) => candidate.scout?.id === user.id || candidate.scoutId === user.id);
      const ownedQualified = ownedCandidates.filter((candidate) => candidate.kpiQualified).length;
      const interviewsCompleted = ownedCandidates.filter((candidate) => candidate.interviewStatus === "completed" || candidate.interviewPassed).length;
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        candidates: ownedCandidates.length,
        interviewsCompleted,
        qualified: ownedQualified,
        conversion: ownedCandidates.length ? Math.round((ownedQualified / ownedCandidates.length) * 100) : 0,
      };
    })
    .filter((user) => user.candidates > 0 || state.user.role === "owner")
    .sort((left, right) => right.conversion - left.conversion || right.qualified - left.qualified);

  const interviewerAnalytics = Object.values(
    interviews.reduce((accumulator, candidate) => {
      const key = candidate.interviewerName || "Без интервьюера";
      if (!accumulator[key]) {
        accumulator[key] = { name: key, total: 0, completed: 0, noShow: 0, converted: 0 };
      }
      accumulator[key].total += 1;
      if (candidate.interviewStatus === "completed" || candidate.interviewPassed) accumulator[key].completed += 1;
      if (candidate.interviewStatus === "no_show") accumulator[key].noShow += 1;
      if (candidate.registrationPassed) accumulator[key].converted += 1;
      return accumulator;
    }, {}),
  ).sort((left, right) => right.converted - left.converted || right.completed - left.completed);

  const operationalSignals = [
    {
      label: "Кандидатов на 1 оффер",
      value: (candidates.length / offerCount).toFixed(1),
      note: "Нагрузка на открытые вакансии",
    },
    {
      label: "No-show rate",
      value: interviews.length ? `${Math.round((interviews.filter((candidate) => candidate.interviewStatus === "no_show").length / interviews.length) * 100)}%` : "0%",
      note: "Доля интервью, которые сорвались",
    },
    {
      label: "Срочные задачи",
      value: state.tasks.filter((task) => !task.done && task.priority === "high").length,
      note: "Незакрытые high-priority задачи",
    },
    {
      label: "Обязательное обучение",
      value: getPendingMandatoryTrainings().length,
      note: "Сколько блокеров осталось у текущего пользователя",
    },
  ];

  const analyticsReport = [
    `Every Scouting analytics snapshot`,
    `Date: ${new Date().toLocaleString("ru-RU")}`,
    "",
    "Funnel:",
    ...funnel.map((item) => `- ${item.label}: ${item.value} (${item.note})`),
    "",
    "Teams:",
    ...teamAnalytics.map((team) => `- ${team.name}: ${team.qualified}/${team.candidates} KPI (${team.conversion}%)`),
    "",
    "Scouts:",
    ...scoutAnalytics.slice(0, 10).map((user) => `- ${user.name}: ${user.qualified}/${user.candidates} KPI (${user.conversion}%)`),
  ].join("\n");

  el("view-analytics").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Аналитика и конверсии</h3>
        <div class="panel-subtitle">Воронка кандидатов, эффективность интервью, рейтинг команд и управленческие сигналы по всей платформе.</div>
      </div>
      <div class="inline-actions">
        <button class="primary-btn" id="analyticsExportBtn">Экспорт отчета</button>
      </div>
    </div>

    <section class="stats-grid">
      ${funnel
        .map(
          (item) => `
            <article class="mini-card">
              <span class="mini-label">${item.label}</span>
              <div class="metric-value">${item.value}</div>
              <div class="small-note">${item.note}</div>
            </article>
          `,
        )
        .join("")}
    </section>

    <section class="stats-grid">
      ${operationalSignals
        .map(
          (item) => `
            <article class="mini-card">
              <span class="mini-label">${item.label}</span>
              <div class="metric-value">${item.value}</div>
              <div class="small-note">${item.note}</div>
            </article>
          `,
        )
        .join("")}
    </section>

    <section class="list-grid">
      <div>
        <h3>Команды</h3>
        <div class="table-like">
          ${teamAnalytics
            .map(
              (team) => `
                <div class="finance-ledger-row">
                  <div>
                    <strong>${team.name}</strong>
                    <div class="list-meta">Кандидаты: ${team.candidates} · Интервью: ${team.interviews}</div>
                  </div>
                  <span class="chip">KPI: ${team.qualified}</span>
                  <strong>${team.conversion}%</strong>
                </div>
              `,
            )
            .join("") || '<p class="empty-text">Нет командных данных.</p>'}
        </div>
      </div>
      <div>
        <h3>Интервьюеры</h3>
        <div class="table-like">
          ${interviewerAnalytics
            .map(
              (item) => `
                <div class="finance-ledger-row">
                  <div>
                    <strong>${item.name}</strong>
                    <div class="list-meta">Всего: ${item.total} · Проведено: ${item.completed}</div>
                  </div>
                  <span class="chip">No-show: ${item.noShow}</span>
                  <strong>${item.total ? Math.round((item.converted / item.total) * 100) : 0}% reg-conversion</strong>
                </div>
              `,
            )
            .join("") || '<p class="empty-text">Пока нет статистики по интервьюерам.</p>'}
        </div>
      </div>
    </section>

    <section>
      <h3>Рейтинг скаутов</h3>
      <div class="rank-list">
        ${scoutAnalytics
          .map(
            (item, index) => `
              <div class="rank-item">
                <div class="rank-badge">${index + 1}</div>
                <div>
                  <strong>${item.name}</strong>
                  <div class="list-meta">${roles[item.role]} · Кандидаты: ${item.candidates} · Интервью: ${item.interviewsCompleted}</div>
                </div>
                <strong>${item.conversion}%</strong>
              </div>
            `,
          )
          .join("") || '<p class="empty-text">Пока нет данных по скаутам.</p>'}
      </div>
    </section>
  `;

  document.getElementById("analyticsExportBtn").addEventListener("click", () => {
    downloadTextFile(`analytics-report-${new Date().toISOString().slice(0, 10)}.txt`, analyticsReport);
  });
}

function renderTrainingView() {
  const assigneeOptions = optionsForUsers(["lead", "scout", "referral"]);
  const relevant = state.trainings.filter((training) => training.role === state.user.role);
  const pending = relevant.filter((training) => training.mandatory && !training.completed);

  const rows = state.trainings
    .map(
      (training) => `
        <div class="list-item">
          <div class="list-head">
            <strong>${training.title}</strong>
            <span class="chip">${roles[training.role]}</span>
          </div>
          <div class="list-meta">Обязательное: ${training.mandatory ? "Да" : "Нет"}</div>
          <div class="chip-row">
            <span class="chip">${training.completed ? "Завершено вами" : "Не завершено"}</span>
            <span class="chip">Назначено: ${training.assignedUsers.length}</span>
          </div>
          ${
            training.role === state.user.role && !training.completed
              ? `<button class="action-btn" data-complete-training="${training.id}">Отметить прохождение</button>`
              : ""
          }
        </div>
      `,
    )
    .join("");

  el("view-training").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Обязательное обучение</h3>
        <div class="panel-subtitle">Без завершения обязательных модулей работа пользователя должна быть ограничена.</div>
      </div>
      ${
        state.metadata.permissions.manageTrainings
          ? '<button class="primary-btn" id="toggleTrainingFormBtn">Назначить модуль</button>'
          : ""
      }
    </div>
    ${
      state.metadata.permissions.manageTrainings
        ? `
      <form class="stack-form hidden" id="trainingCreateForm">
        <div class="form-row form-row-4">
          <label>Название<input name="title" required placeholder="Название обучения" /></label>
          <label>Роль
            <select name="role">
              <option value="lead">Тимлид</option>
              <option value="scout">Скаут</option>
              <option value="referral">Скаут (реферал)</option>
            </select>
          </label>
          <label>Обязательное
            <select name="mandatory">
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </label>
          <label>Пользователи
            <select name="assignedUserIds" multiple size="4">${optionMarkup(assigneeOptions)}</select>
          </label>
        </div>
        <button class="primary-btn" type="submit">Назначить обучение</button>
      </form>
    `
        : ""
    }
    ${
      pending.length
        ? `<div class="training-lock"><strong>Внимание:</strong> для вашей роли осталось ${pending.length} обязательных модулей.</div>`
        : '<div class="mini-card"><strong>Все обязательные обучения закрыты.</strong></div>'
    }
    <div class="table-like">${rows || '<p class="empty-text">Нет обучений.</p>'}</div>
  `;

  document.querySelectorAll("[data-complete-training]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/trainings/${button.dataset.completeTraining}/complete`, { method: "POST" });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  const toggleTrainingFormBtn = document.getElementById("toggleTrainingFormBtn");
  if (toggleTrainingFormBtn) {
    toggleTrainingFormBtn.addEventListener("click", () => {
      el("trainingCreateForm").classList.toggle("hidden");
    });
  }
  const trainingCreateForm = document.getElementById("trainingCreateForm");
  if (trainingCreateForm) {
    trainingCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        await api(API.trainings, {
          method: "POST",
          body: JSON.stringify({
            title: formData.get("title"),
            role: formData.get("role"),
            mandatory: formData.get("mandatory") === "true",
            assignedUserIds: formData.getAll("assignedUserIds"),
          }),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  }
}

function renderSocialView() {
  const visiblePosts = state.posts
    .filter((post) => socialFilters.type === "all" || post.type === socialFilters.type)
    .filter((post) => socialFilters.category === "all" || (post.category || "general") === socialFilters.category)
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || String(right.createdAt).localeCompare(String(left.createdAt)));

  const pinnedPosts = visiblePosts.filter((post) => post.pinned);
  const regularPosts = visiblePosts.filter((post) => !post.pinned);
  const postMarkup = (items) =>
    items
    .map(
      (post) => `
        <div class="forum-card" data-post-card-id="${post.id}">
          <div class="list-head">
            <strong>${post.pinned ? "Закреплено · " : ""}${post.title}</strong>
            <span class="chip">${post.type === "news" ? "Новости" : "Форум"}</span>
          </div>
          <div class="chip-row">
            <span class="chip">${post.category || "general"}</span>
            <span class="chip">${(post.comments || []).length} комментариев</span>
          </div>
          <div class="list-meta">${post.authorName} · ${formatDateLabel(post.createdAt)}</div>
          <p>${post.body}</p>
          <div class="table-like">
            ${(post.comments || [])
              .map(
                (comment) => `
                  <div class="comment-card">
                    <div class="chat-meta">
                      <strong>${comment.authorName}</strong>
                      <span class="list-meta">${formatDateLabel(comment.createdAt)}</span>
                    </div>
                    <p>${comment.body}</p>
                  </div>
                `,
              )
              .join("") || '<p class="empty-text">Комментариев пока нет.</p>'}
          </div>
          <form class="inline-actions comment-form" data-comment-form="${post.id}">
            <input class="chat-input" name="body" placeholder="Оставить комментарий..." />
            <button class="action-btn" type="submit" ${actionLockAttrs("комментировать посты")}>Ответить</button>
          </form>
        </div>
      `,
    )
    .join("");

  el("view-social").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Форум и новостная лента</h3>
        <div class="panel-subtitle">Внутреннее сообщество, обмен опытом и объявления компании.</div>
      </div>
      <button class="primary-btn" id="addPostBtn" ${actionLockAttrs("создавать посты")}>Новый пост</button>
    </div>
    ${renderTrainingGuard()}
    <section class="finance-filter-bar">
      <label>
        Тип
        <select id="socialTypeFilter">
          <option value="all" ${socialFilters.type === "all" ? "selected" : ""}>Все</option>
          <option value="news" ${socialFilters.type === "news" ? "selected" : ""}>Новости</option>
          <option value="forum" ${socialFilters.type === "forum" ? "selected" : ""}>Форум</option>
        </select>
      </label>
      <label>
        Категория
        <select id="socialCategoryFilter">
          <option value="all" ${socialFilters.category === "all" ? "selected" : ""}>Все</option>
          <option value="general" ${socialFilters.category === "general" ? "selected" : ""}>General</option>
          <option value="announcements" ${socialFilters.category === "announcements" ? "selected" : ""}>Announcements</option>
          <option value="scripts" ${socialFilters.category === "scripts" ? "selected" : ""}>Scripts</option>
          <option value="cases" ${socialFilters.category === "cases" ? "selected" : ""}>Cases</option>
        </select>
      </label>
      <div class="inline-actions finance-toolbar">
        <button class="secondary-btn" id="socialResetFiltersBtn">Сбросить</button>
      </div>
    </section>
    <form class="stack-form hidden" id="socialPostForm">
      <div class="form-row form-row-4">
        <label>Тип
          <select name="type">
            <option value="${state.user.role === "owner" ? "news" : "forum"}">${state.user.role === "owner" ? "Новости" : "Форум"}</option>
            <option value="forum">Форум</option>
            ${state.user.role === "owner" ? '<option value="news">Новости</option>' : ""}
          </select>
        </label>
        <label>Категория
          <select name="category">
            <option value="general">General</option>
            <option value="announcements">Announcements</option>
            <option value="scripts">Scripts</option>
            <option value="cases">Cases</option>
          </select>
        </label>
        ${state.user.role === "owner" ? '<label>Закрепить<select name="pinned"><option value="false">Нет</option><option value="true">Да</option></select></label>' : ""}
        <label>Заголовок<input name="title" required placeholder="Название поста" /></label>
      </div>
      <label>Текст<textarea name="body" rows="4" placeholder="Что важно донести команде?"></textarea></label>
      <button class="primary-btn" type="submit" ${actionLockAttrs("создавать посты")}>Опубликовать</button>
    </form>
    ${pinnedPosts.length ? `<section><h3>Закрепленные</h3><div class="table-like">${postMarkup(pinnedPosts)}</div></section>` : ""}
    <section><h3>Лента</h3><div class="table-like">${postMarkup(regularPosts) || '<p class="empty-text">Постов пока нет.</p>'}</div></section>
  `;

  el("addPostBtn").addEventListener("click", () => {
    if (!ensureTrainingUnlocked("создавать посты")) return;
    el("socialPostForm").classList.toggle("hidden");
  });

  document.getElementById("socialPostForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureTrainingUnlocked("создавать посты")) return;
    const formData = new FormData(event.currentTarget);
    try {
      await api(API.posts, {
        method: "POST",
        body: JSON.stringify({
          type: formData.get("type"),
          category: formData.get("category"),
          pinned: formData.get("pinned") === "true",
          title: formData.get("title"),
          body: formData.get("body"),
        }),
      });
      await reloadWorkspace();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelectorAll("[data-comment-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ensureTrainingUnlocked("комментировать посты")) return;
      const formData = new FormData(event.currentTarget);
      try {
        await api(`${API.posts}/${event.currentTarget.dataset.commentForm}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: formData.get("body") }),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  document.getElementById("socialTypeFilter").addEventListener("change", (event) => {
    socialFilters.type = event.target.value;
    renderSocialView();
  });

  document.getElementById("socialCategoryFilter").addEventListener("change", (event) => {
    socialFilters.category = event.target.value;
    renderSocialView();
  });

  document.getElementById("socialResetFiltersBtn").addEventListener("click", () => {
    socialFilters = { type: "all", category: "all" };
    renderSocialView();
  });

  bindTrainingGuardButton();
}

function renderProfileView() {
  const finance = getFinanceModel();
  el("view-profile").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Профиль и реферальная система</h3>
        <div class="panel-subtitle">Подписка, кастомизация, реферальный код и буст выплат.</div>
      </div>
      <button class="ghost-btn" id="toggleProfileEditBtn">Редактировать</button>
    </div>
    <section class="profile-grid">
      <div class="profile-block">
        <h3>${state.user.name}</h3>
        <p>${state.user.email}</p>
        <div class="chip-row">
          <span class="chip">${state.user.roleLabel}</span>
          <span class="chip">${state.user.subscription}</span>
          <span class="chip">Theme: ${state.user.theme}</span>
          <span class="chip">Boost: ${state.user.payoutBoost}</span>
        </div>
      </div>
      <div class="profile-block">
        <h3>Рефералы</h3>
        <div class="chip-row">
          <span class="chip">Code: ${state.user.referralCode}</span>
          <span class="chip">Income: ${state.user.referralIncomePercent}%</span>
        </div>
        <p class="small-note">Расчетный доход канала при текущем профиле: ${formatMoney(finance.referralProjected)}.</p>
      </div>
      <div class="profile-block">
        <form class="stack-form hidden" id="profileCustomizationForm">
          <label>Ник<input name="nickname" placeholder="Как показывать имя" value="${state.user.name}" /></label>
          <label>Username<input name="username" placeholder="@everyscout" /></label>
          <label>Биография<textarea name="bio" rows="3" placeholder="Коротко о себе"></textarea></label>
          <button class="primary-btn" type="submit">Сохранить</button>
        </form>
      </div>
    </section>
  `;

  const toggleProfileEditBtn = el("toggleProfileEditBtn");
  if (toggleProfileEditBtn) {
    toggleProfileEditBtn.addEventListener("click", () => {
      const form = el("profileCustomizationForm");
      if (form) form.classList.toggle("hidden");
    });
  }

  const profileCustomizationForm = el("profileCustomizationForm");
  if (profileCustomizationForm) {
    profileCustomizationForm.addEventListener("submit", (event) => {
      event.preventDefault();
      toast("Блок редактирования профиля открыт как отдельная кнопка. Полную кастомизацию можно продолжать развивать отсюда.");
    });
  }
}

function renderManagementView() {
  if (state.user.role !== "owner") {
    el("view-management").innerHTML = `
      <div class="panel-header">
        <div>
          <h3>Управление</h3>
          <div class="panel-subtitle">Расширенное администрирование доступно только главному админу.</div>
        </div>
      </div>
      <p class="empty-text">Для вашей роли этот раздел доступен только в режиме просмотра других модулей.</p>
    `;
    return;
  }

  const users = (state.users || [])
    .map(
      (user) => `
        <div class="list-item">
          <div class="list-head">
            <strong>${user.name}</strong>
            <span class="chip">${user.roleLabel}</span>
          </div>
          <div class="list-meta">${user.email} · ${user.subscription} · Team: ${user.teamId || "none"}</div>
          <div class="chip-row">
            ${Object.entries(user.permissions || {})
              .filter(([, enabled]) => enabled)
              .map(([key]) => `<span class="chip">${(state.metadata.permissionLabels || {})[key] || key}</span>`)
              .join("")}
          </div>
          <div class="inline-actions">
            <button class="action-btn" data-promote-user="${user.id}" ${actionLockAttrs("менять роли сотрудников")}>Сделать тимлидом</button>
            <button class="action-btn" data-toggle-permissions="${user.id}" ${actionLockAttrs("настраивать права сотрудников")}>Права</button>
          </div>
          <form class="stack-form hidden" data-user-permissions-form="${user.id}">
            <div class="permission-grid">
              ${renderPermissionChecklist(user.permissions)}
            </div>
            <button class="primary-btn" type="submit" ${actionLockAttrs("настраивать права сотрудников")}>Сохранить права</button>
          </form>
        </div>
      `,
    )
    .join("");

  el("view-management").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Управление людьми и заявками</h3>
        <div class="panel-subtitle">Создание пользователей, назначение ролей и обработка внешних заявок.</div>
      </div>
    </div>
    ${renderTrainingGuard()}
    <section class="list-grid">
      <div>
        <h3>Создать пользователя</h3>
        <form class="stack-form" id="userCreateForm">
          <div class="form-row form-row-4">
            <label>Имя<input name="name" required /></label>
            <label>Email<input name="email" type="email" required /></label>
            <label>Пароль<input name="password" value="demo123" /></label>
            <label>Роль
              <select name="role">
                <option value="lead">Тимлид</option>
                <option value="scout">Скаут</option>
                <option value="referral">Скаут (реферал)</option>
              </select>
            </label>
          </div>
          <div class="form-row form-row-4">
            <label>Команда<select name="teamId">${optionMarkup(state.metadata.referenceData.teams || [])}</select></label>
            <label>Подписка<input name="subscription" value="Scout Core" /></label>
            <label>Буст выплат<input name="payoutBoost" value="5%" /></label>
            <label>Theme<input name="theme" value="Fresh Start" /></label>
          </div>
          <div class="permission-grid">
            ${renderPermissionChecklist()}
          </div>
          <button class="primary-btn" type="submit" ${actionLockAttrs("создавать сотрудников")}>Создать аккаунт</button>
        </form>
      </div>
      <div>
        <h3>Сотрудники</h3>
        <div class="table-like">${users}</div>
      </div>
    </section>
  `;

  el("userCreateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureTrainingUnlocked("создавать сотрудников")) return;
    const formData = new FormData(event.currentTarget);
    try {
      await api(API.users, {
        method: "POST",
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          password: formData.get("password"),
          role: formData.get("role"),
          teamId: formData.get("teamId"),
          subscription: formData.get("subscription"),
          payoutBoost: formData.get("payoutBoost"),
          theme: formData.get("theme"),
          permissionsOverride: readPermissionOverrides(formData),
        }),
      });
      await reloadWorkspace();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelectorAll("[data-promote-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!ensureTrainingUnlocked("менять роли сотрудников")) return;
      const user = state.users.find((item) => item.id === button.dataset.promoteUser);
      if (!user) return;
      try {
        await api(`${API.users}/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify({ role: "lead" }),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-toggle-permissions]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!ensureTrainingUnlocked("настраивать права сотрудников")) return;
      const form = document.querySelector(`[data-user-permissions-form="${button.dataset.togglePermissions}"]`);
      if (!form) return;
      form.classList.toggle("hidden");
    });
  });

  document.querySelectorAll("[data-user-permissions-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ensureTrainingUnlocked("настраивать права сотрудников")) return;
      const formData = new FormData(event.currentTarget);
      try {
        await api(`${API.users}/${event.currentTarget.dataset.userPermissionsForm}`, {
          method: "PATCH",
          body: JSON.stringify({
            permissionsOverride: readPermissionOverrides(formData),
          }),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  bindTrainingGuardButton();
}

function renderScoreboard() {
  return state.scoreboard
    .map(
      (item, index) => `
        <div class="rank-item">
          <div class="rank-badge">${index + 1}</div>
          <div>
            <strong>${item.name}</strong>
            <div class="list-meta">${roles[item.role]}</div>
          </div>
          <strong>${item.kpiScore}%</strong>
        </div>
      `,
    )
    .join("");
}

function renderView() {
  document.querySelectorAll(".content-panel[id^='view-']").forEach((panel) => panel.classList.add("hidden"));
  const panel = el(`view-${activeView}`);
  if (!panel) return;
  panel.classList.remove("hidden");

  const renderers = {
    dashboard: renderDashboardView,
    notifications: renderNotificationsView,
    candidates: renderCandidatesView,
    calendar: renderCalendarView,
    offers: renderOffersView,
    teams: renderTeamsView,
    tasks: renderTasksView,
    finance: renderFinanceView,
    analytics: renderAnalyticsView,
    training: renderTrainingView,
    social: renderSocialView,
    profile: renderProfileView,
    management: renderManagementView,
  };
  renderers[activeView]();
}

function renderWorkspace() {
  try {
    renderSession();
    if (!state?.user) {
      updateLiveSyncBadge();
      renderDocumentPreview();
      return;
    }
    currentLanguage = state.user.locale || currentLanguage;
    if (el("languageSelect")) el("languageSelect").value = currentLanguage;
    renderSummary();
    renderNav();
    renderUtilityPanels();
    renderView();
    renderDocumentPreview();
    applyPendingDeepLink();
    if (queuedRealtimeRefresh && !hasInteractiveFocus()) {
      queuedRealtimeRefresh = false;
    }
    updateLiveSyncBadge("idle");
  } catch (error) {
    console.error(error);
    const currentView = el(`view-${activeView}`);
    if (currentView) {
      currentView.innerHTML = `
        <div class="panel-header">
          <div>
            <h3>Не удалось отрисовать раздел</h3>
            <div class="panel-subtitle">Попробуйте обновить страницу. Часть интерфейса была собрана из старой версии и сейчас синхронизируется.</div>
          </div>
        </div>
      `;
    }
    pushToast(error.message || "Ошибка рендера workspace");
  }
}

function toast(message) {
  const node = el("loginMessage");
  if (node) node.textContent = message;
  pushToast(message);
}

async function reloadWorkspace() {
  state = await api(API.bootstrap);
  lastLiveSyncAt = new Date().toISOString();
  renderWorkspace();
}

async function login(email, password) {
  const data = await api(API.login, {
    method: "POST",
    body: JSON.stringify({ email: String(email || "").trim(), password: String(password || "").trim() }),
    headers: {},
  });
  authToken = data.token;
  localStorage.setItem(TOKEN_KEY, authToken);
  await reloadWorkspace();
  startLiveSync();
}

async function logout() {
  stopLiveSync();
  if (authToken) {
    try {
      await api(API.logout, { method: "POST" });
    } catch (error) {
      console.warn(error);
    }
  }
  authToken = "";
  state = null;
  activeDocumentPreview = null;
  localStorage.removeItem(TOKEN_KEY);
  renderSession();
  renderDocumentPreview();
  toast("Вы вышли из системы.");
}

function bindStaticEvents() {
  document.addEventListener("focusin", () => {
    if (queuedRealtimeRefresh) {
      updateLiveSyncBadge("syncing");
    }
  });

  document.addEventListener("focusout", () => {
    if (queuedRealtimeRefresh) {
      window.setTimeout(() => {
        if (!hasInteractiveFocus()) {
          syncLiveWorkspace().catch((error) => console.warn(error));
        }
      }, 0);
    }
  });

  document.querySelectorAll("[data-scroll]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.scroll).scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const applicationForm = el("applicationForm");
  if (applicationForm) {
    applicationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        await api(API.publicApplications, {
          method: "POST",
          body: JSON.stringify({
            name: formData.get("name"),
            contact: formData.get("contact"),
            experience: formData.get("experience"),
            languages: formData.get("languages"),
            motivation: formData.get("motivation"),
          }),
        });
        event.currentTarget.reset();
        toast("Заявка отправлена и уже доступна главному админу.");
      } catch (error) {
        toast(error.message);
      }
    });
  }

  const loginForm = el("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        toast("Выполняю вход...");
        await login(formData.get("email"), formData.get("password"));
        toast("Вход выполнен. Рабочее пространство загружено.");
      } catch (error) {
        toast(error.message);
      }
    });
  }

  const logoutBtn = el("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  const languageSelect = el("languageSelect");
  if (languageSelect) {
    languageSelect.addEventListener("change", (event) => {
      currentLanguage = event.target.value;
      renderWorkspace();
    });
  }

  const notificationToggleBtn = el("notificationToggleBtn");
  if (notificationToggleBtn) {
    notificationToggleBtn.addEventListener("click", () => {
      const popover = el("notificationPopover");
      if (popover) popover.classList.toggle("hidden");
    });
  }

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view;
      renderWorkspace();
    });
  });
}

async function bootstrap() {
  bindStaticEvents();
  if (authToken) {
    try {
      await reloadWorkspace();
      startLiveSync();
      toast("Сессия восстановлена.");
      return;
    } catch (error) {
      authToken = "";
      localStorage.removeItem(TOKEN_KEY);
    }
  }
  renderSession();
}

bootstrap();
