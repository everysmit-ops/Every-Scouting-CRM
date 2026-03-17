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

function el(id) {
  return document.getElementById(id);
}

function slug(value) {
  return String(value).toLowerCase().replace(/\s+/g, "-").replace(/[()]/g, "");
}

function getStatusLabel(status) {
  return translations[currentLanguage][status] || status;
}

function optionsForUsers(rolesFilter = null) {
  const users = state.metadata.referenceData.users || [];
  return rolesFilter ? users.filter((item) => rolesFilter.includes(item.role)) : users;
}

function optionMarkup(items, labelKey = "name") {
  return items.map((item) => `<option value="${item.id}">${item[labelKey]}</option>`).join("");
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

function renderDashboardView() {
  const notifications = state.notifications
    .map((item) => `<div class="list-item"><strong>Событие</strong><div class="list-meta">${item.text}</div></div>`)
    .join("");

  const applications = state.publicApplications
    .map(
      (application) => `
        <div class="list-item">
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
              <button class="action-btn" data-approve-application="${application.id}">Одобрить</button>
              <button class="action-btn" data-reject-application="${application.id}">Отклонить</button>
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
        <div class="panel-subtitle">Данные подгружаются с backend по вашей роли и правам доступа.</div>
      </div>
      <button class="action-btn" id="quickCandidateBtn">Добавить кандидата</button>
    </div>

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
        <h3>Уведомления</h3>
        ${notifications || '<p class="empty-text">Пока уведомлений нет.</p>'}
      </div>
      <div>
        <h3>ТОП по KPI</h3>
        <div class="rank-list">${renderScoreboard()}</div>
      </div>
    </section>

    <section class="list-grid">
      <div>
        <h3>Аудит действий</h3>
        ${audit || '<p class="empty-text">Пока пусто.</p>'}
      </div>
      <div>
        <h3>Внешние заявки</h3>
        ${
          state.user.role === "owner"
            ? applications || '<p class="empty-text">Заявок пока нет.</p>'
            : '<p class="empty-text">Этот блок доступен только главному админу.</p>'
        }
      </div>
    </section>
  `;

  el("quickCandidateBtn").addEventListener("click", async () => {
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
}

function renderCandidatesView() {
  const scoutOptions = optionsForUsers(["scout", "referral"]);
  const offerOptions = state.metadata.referenceData.offers || [];
  const teamOptions = state.metadata.referenceData.teams || [];
  const rows = state.candidates
    .map(
      (candidate) => `
        <div class="list-item">
          <div class="list-head">
            <strong>${candidate.name}</strong>
            <span class="chip status-${slug(candidate.status)}">${getStatusLabel(candidate.status)}</span>
          </div>
          <div class="list-meta">${candidate.offer?.title || "Без оффера"} · ${candidate.location} · ${candidate.scout.name}</div>
          <p>${candidate.notes}</p>
          <div class="chip-row">
            <span class="chip">${candidate.team?.name || "Без команды"}</span>
            <span class="chip">Interview: ${candidate.interviewPassed ? "Yes" : "No"}</span>
            <span class="chip">Registration: ${candidate.registrationPassed ? "Yes" : "No"}</span>
            <span class="chip">Shifts: ${candidate.shiftsCompleted}</span>
            <span class="chip">${candidate.kpiQualified ? "KPI counted" : "Not yet in KPI"}</span>
          </div>
          <div class="inline-actions">
            <button class="action-btn" data-candidate="${candidate.id}" data-update="interview">+ интервью</button>
            <button class="action-btn" data-candidate="${candidate.id}" data-update="registration">+ регистрация</button>
            <button class="action-btn" data-candidate="${candidate.id}" data-update="shift">+ смена</button>
          </div>
        </div>
      `,
    )
    .join("");

  el("view-candidates").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Кандидаты и статусы</h3>
        <div class="panel-subtitle">Полная воронка кандидатов с ролевым доступом и KPI-логикой.</div>
      </div>
      <button class="primary-btn" id="toggleCandidateFormBtn">Добавить кандидата</button>
    </div>
    <form class="stack-form hidden" id="candidateCreateForm">
      <div class="form-row form-row-4">
        <label>Имя<input name="name" required placeholder="Имя кандидата" /></label>
        <label>Локация<input name="location" placeholder="Remote / City" /></label>
        <label>Оффер<select name="offerId">${optionMarkup(offerOptions, "title")}</select></label>
        <label>Команда<select name="teamId">${optionMarkup(teamOptions)}</select></label>
      </div>
      ${state.user.role === "owner" ? `<label>Скаут<select name="scoutId">${optionMarkup(scoutOptions)}</select></label>` : ""}
      <label>Заметки<textarea name="notes" rows="3" placeholder="Комментарий по кандидату"></textarea></label>
      <div class="inline-actions">
        <button class="primary-btn" type="submit">Сохранить кандидата</button>
      </div>
    </form>
    <div class="table-like">${rows || '<p class="empty-text">Нет кандидатов.</p>'}</div>
  `;

  el("toggleCandidateFormBtn").addEventListener("click", () => {
    el("candidateCreateForm").classList.toggle("hidden");
  });

  el("candidateCreateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
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
      const candidate = state.candidates.find((item) => item.id === button.dataset.candidate);
      if (!candidate) return;
      const payload = { notes: candidate.notes };
      if (button.dataset.update === "interview") {
        payload.interviewPassed = true;
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
}

function renderOffersView() {
  const scoutOptions = optionsForUsers(["scout", "referral"]);
  const rows = state.offers
    .map(
      (offer) => `
        <div class="list-item">
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
          ? '<button class="primary-btn" id="toggleOfferFormBtn">Создать оффер</button>'
          : ""
      }
    </div>
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
          <button class="primary-btn" type="submit">Создать оффер</button>
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
      el("offerCreateForm").classList.toggle("hidden");
    });
  }
  const offerCreateForm = document.getElementById("offerCreateForm");
  if (offerCreateForm) {
    offerCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
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
}

function renderTeamsView() {
  const teamMarkup = state.teams
    .map(
      (team) => `
        <div class="list-item">
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

  const chatMarkup = state.chats
    .map(
      (chat) => `
        <div class="chat-card">
          <div class="list-head">
            <strong>${chat.name}</strong>
            <span class="chip">${chat.messages.length} сообщений</span>
          </div>
          ${chat.messages
            .slice(-4)
            .map(
              (message) => `
                <div class="chat-meta"><strong>${message.authorName}</strong><span class="list-meta">${message.time}</span></div>
                <p>${message.text}</p>
              `,
            )
            .join("")}
          <div class="inline-actions">
            <input class="chat-input" placeholder="Написать сообщение..." data-chat-input="${chat.id}" />
            <button class="action-btn" data-chat-send="${chat.id}">Отправить</button>
          </div>
        </div>
      `,
    )
    .join("");

  el("view-teams").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Команды и чаты</h3>
        <div class="panel-subtitle">Распределение процентов, KPI и живая коммуникация внутри команды.</div>
      </div>
    </div>
    <section class="list-grid">
      <div>${teamMarkup || '<p class="empty-text">Нет команд.</p>'}</div>
      <div>${chatMarkup || '<p class="empty-text">Нет чатов.</p>'}</div>
    </section>
  `;

  document.querySelectorAll("[data-chat-send]").forEach((button) => {
    button.addEventListener("click", async () => {
      const chatId = button.dataset.chatSend;
      const input = document.querySelector(`[data-chat-input="${chatId}"]`);
      if (!input?.value.trim()) return;
      try {
        await api(`/api/chats/${chatId}/messages`, {
          method: "POST",
          body: JSON.stringify({ text: input.value.trim() }),
        });
        await reloadWorkspace();
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function renderTasksView() {
  const teamOptions = state.metadata.referenceData.teams || [];
  const userOptions = state.metadata.referenceData.users || [];
  const rows = state.tasks
    .map(
      (task) => `
        <div class="list-item">
          <div class="list-head">
            <strong>${task.title}</strong>
            <span class="chip ${task.priority === "high" ? "priority-high" : ""}">${task.deadline}</span>
          </div>
          <div class="list-meta">${task.team?.name || task.assigneeUser?.name || "Без назначения"}</div>
          <div class="inline-actions">
            <button class="action-btn" data-task-toggle="${task.id}">${task.done ? "Переоткрыть" : "Закрыть задачу"}</button>
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
          ? '<button class="primary-btn" id="toggleTaskFormBtn">Новая задача</button>'
          : ""
      }
    </div>
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
        <button class="primary-btn" type="submit">Создать задачу</button>
      </form>
    `
        : ""
    }
    <div class="table-like">${rows || '<p class="empty-text">Нет задач.</p>'}</div>
  `;

  const toggleTaskFormBtn = document.getElementById("toggleTaskFormBtn");
  if (toggleTaskFormBtn) {
    toggleTaskFormBtn.addEventListener("click", () => {
      el("taskCreateForm").classList.toggle("hidden");
    });
  }
  const taskCreateForm = document.getElementById("taskCreateForm");
  if (taskCreateForm) {
    taskCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
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
  const posts = state.posts
    .map(
      (post) => `
        <div class="forum-card">
          <div class="list-head">
            <strong>${post.title}</strong>
            <span class="chip">${post.type === "news" ? "Новости" : "Форум"}</span>
          </div>
          <div class="list-meta">${post.authorName} · ${post.createdAt}</div>
          <p>${post.body}</p>
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
      <button class="primary-btn" id="addPostBtn">Новый пост</button>
    </div>
    <div class="table-like">${posts || '<p class="empty-text">Постов пока нет.</p>'}</div>
  `;

  el("addPostBtn").addEventListener("click", async () => {
    try {
      await api(API.posts, {
        method: "POST",
        body: JSON.stringify({
          type: state.user.role === "owner" ? "news" : "forum",
          title: state.user.role === "owner" ? "Внутренний анонс" : "Новый форумный тред",
          body: "Публикация создана через production-ready API.",
        }),
      });
      await reloadWorkspace();
    } catch (error) {
      toast(error.message);
    }
  });
}

function renderProfileView() {
  el("view-profile").innerHTML = `
    <div class="panel-header">
      <div>
        <h3>Профиль и реферальная система</h3>
        <div class="panel-subtitle">Подписка, кастомизация, реферальный код и буст выплат.</div>
      </div>
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
      </div>
      <div class="profile-block">
        <h3>ТОП по KPI</h3>
        <div class="rank-list">${renderScoreboard()}</div>
      </div>
    </section>
  `;
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
          <div class="inline-actions">
            <button class="action-btn" data-promote-user="${user.id}">Сделать тимлидом</button>
          </div>
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
          <button class="primary-btn" type="submit">Создать аккаунт</button>
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
        }),
      });
      await reloadWorkspace();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelectorAll("[data-promote-user]").forEach((button) => {
    button.addEventListener("click", async () => {
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
    candidates: renderCandidatesView,
    offers: renderOffersView,
    teams: renderTeamsView,
    tasks: renderTasksView,
    training: renderTrainingView,
    social: renderSocialView,
    profile: renderProfileView,
    management: renderManagementView,
  };
  renderers[activeView]();
}

function renderWorkspace() {
  renderSession();
  if (!state?.user) return;
  currentLanguage = state.user.locale || currentLanguage;
  el("languageSelect").value = currentLanguage;
  renderSummary();
  renderNav();
  renderView();
}

function toast(message) {
  const node = el("loginMessage");
  node.textContent = message;
}

async function reloadWorkspace() {
  state = await api(API.bootstrap);
  renderWorkspace();
}

async function login(email, password) {
  const data = await api(API.login, {
    method: "POST",
    body: JSON.stringify({ email, password }),
    headers: {},
  });
  authToken = data.token;
  localStorage.setItem(TOKEN_KEY, authToken);
  await reloadWorkspace();
}

async function logout() {
  if (authToken) {
    try {
      await api(API.logout, { method: "POST" });
    } catch (error) {
      console.warn(error);
    }
  }
  authToken = "";
  state = null;
  localStorage.removeItem(TOKEN_KEY);
  renderSession();
  toast("Вы вышли из системы.");
}

function bindStaticEvents() {
  document.querySelectorAll("[data-scroll]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.scroll).scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  el("applicationForm").addEventListener("submit", async (event) => {
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

  el("loginForm").addEventListener("submit", async (event) => {
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

  el("logoutBtn").addEventListener("click", logout);
  el("languageSelect").addEventListener("change", (event) => {
    currentLanguage = event.target.value;
    renderWorkspace();
  });

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
