const crypto = require("crypto");
const { nowIso, newId, hashPassword, safeUser } = require("../lib/auth");
const {
  createAudit,
  createNotification,
  expandCandidates,
  expandOffers,
  expandTasks,
  getBootstrap,
} = require("../lib/domain");

function createPlatformService(repository) {
  function findUserByCredentials(db, email) {
    return db.users.find((item) => item.email.toLowerCase() === String(email || "").toLowerCase());
  }

  function createManagedUser(db, payload = {}) {
    const password = payload.password || "demo123";
    const passwordSalt = crypto.randomBytes(16).toString("hex");
    const createdUser = {
      id: newId("user"),
      name: payload.name || "Новый пользователь",
      email: String(payload.email || "").trim().toLowerCase(),
      passwordSalt,
      passwordHash: hashPassword(password, passwordSalt),
      passwordUpdatedAt: nowIso(),
      role: payload.role || "scout",
      teamId: payload.teamId || db.teams[0]?.id || null,
      subscription: payload.subscription || "Scout Core",
      theme: payload.theme || "Fresh Start",
      referralCode: payload.referralCode || `REF-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      referralIncomePercent: Number(payload.referralIncomePercent || 5),
      payoutBoost: payload.payoutBoost || "5%",
      locale: payload.locale || "ru",
    };
    db.users.push(createdUser);
    const team = db.teams.find((item) => item.id === createdUser.teamId);
    if (team && !team.memberIds.includes(createdUser.id)) {
      team.memberIds.push(createdUser.id);
    }
    return createdUser;
  }

  return {
    async login({ email, password }) {
      if (typeof repository.findUserByEmail === "function" && typeof repository.replaceSession === "function") {
        const user = await repository.findUserByEmail(email);
        if (!user) throw new Error("Invalid credentials");
        const passwordHash = hashPassword(String(password || ""), user.passwordSalt);
        if (passwordHash !== user.passwordHash) throw new Error("Invalid credentials");

        const token = crypto.randomBytes(24).toString("hex");
        const session = { id: newId("session"), userId: user.id, token, createdAt: nowIso() };
        await repository.replaceSession(session);
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "LOGIN",
            entityType: "session",
            entityId: token,
            details: { email: user.email },
            createdAt: nowIso(),
          });
        }
        return { token, user: safeUser(user) };
      }

      return repository.transaction(async (db) => {
        const user = findUserByCredentials(db, email);
        if (!user) {
          throw new Error("Invalid credentials");
        }

        const passwordHash = hashPassword(String(password || ""), user.passwordSalt);
        if (passwordHash !== user.passwordHash) {
          throw new Error("Invalid credentials");
        }

        const token = crypto.randomBytes(24).toString("hex");
        db.sessions = db.sessions.filter((session) => session.userId !== user.id);
        db.sessions.push({ id: newId("session"), userId: user.id, token, createdAt: nowIso() });
        createAudit(db, user.id, "LOGIN", "session", token, { email: user.email });
        return { token, user: safeUser(user) };
      });
    },

    async logout(token) {
      if (typeof repository.deleteSessionByToken === "function") {
        await repository.deleteSessionByToken(token);
        return { ok: true };
      }

      return repository.transaction(async (db) => {
        db.sessions = db.sessions.filter((session) => session.token !== token);
        return { ok: true };
      });
    },

    async bootstrap(user) {
      if (typeof repository.getBootstrapData === "function") {
        return repository.getBootstrapData(user);
      }
      const db = await repository.read();
      return getBootstrap(db, user);
    },

    async createPublicApplication(payload) {
      if (
        typeof repository.insertPublicApplication === "function" &&
        typeof repository.getUserIdsByRole === "function"
      ) {
        const application = {
          id: newId("application"),
          name: payload.name,
          contact: payload.contact,
          experience: payload.experience,
          languages: payload.languages,
          motivation: payload.motivation,
          createdAt: nowIso(),
          status: "new",
        };
        await repository.insertPublicApplication(application);
        const ownerIds = await repository.getUserIdsByRole("owner");
        if (typeof repository.createNotificationEntry === "function") {
          await repository.createNotificationEntry({
            id: newId("notif"),
            text: `Новая внешняя заявка от ${application.name}`,
            userIds: ownerIds,
            createdAt: nowIso(),
          });
        }
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: "public",
            action: "CREATE",
            entityType: "application",
            entityId: application.id,
            details: { name: application.name },
            createdAt: nowIso(),
          });
        }
        return { ok: true, application };
      }

      return repository.transaction(async (db) => {
        const application = {
          id: newId("application"),
          name: payload.name,
          contact: payload.contact,
          experience: payload.experience,
          languages: payload.languages,
          motivation: payload.motivation,
          createdAt: nowIso(),
          status: "new",
        };
        db.publicApplications.unshift(application);
        const ownerIds = db.users.filter((user) => user.role === "owner").map((user) => user.id);
        createNotification(db, `Новая внешняя заявка от ${application.name}`, ownerIds);
        createAudit(db, "public", "CREATE", "application", application.id, { name: application.name });
        return { ok: true, application };
      });
    },

    async decideApplication(user, applicationId, decision, payload = {}) {
      if (typeof repository.updatePublicApplicationStatus === "function") {
        const application = await repository.updatePublicApplicationStatus(applicationId, decision);
        if (!application) throw new Error("Application not found");

        if (decision === "approved" && payload.createUser) {
          const db = await repository.read();
          const email =
            payload.email || `${String(application.name || "user").toLowerCase().replace(/\s+/g, ".")}@scoutflow.local`;
          if (db.users.find((item) => item.email.toLowerCase() === String(email).toLowerCase())) {
            throw new Error("User with this email already exists");
          }
          const createdUser = createManagedUser(db, {
            ...payload,
            email,
            name: payload.name || application.name,
          });
          if (typeof repository.insertUser === "function") {
            await repository.insertUser(createdUser);
          }
        }

        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: decision.toUpperCase(),
            entityType: "application",
            entityId: application.id,
            details: { name: application.name },
            createdAt: nowIso(),
          });
        }
        return { application };
      }

      return repository.transaction(async (db) => {
        const application = db.publicApplications.find((item) => item.id === applicationId);
        if (!application) {
          throw new Error("Application not found");
        }

        application.status = decision;
        if (decision === "approved" && payload.createUser) {
          const email =
            payload.email || `${String(application.name || "user").toLowerCase().replace(/\s+/g, ".")}@scoutflow.local`;
          if (db.users.find((item) => item.email.toLowerCase() === String(email).toLowerCase())) {
            throw new Error("User with this email already exists");
          }
          createManagedUser(db, {
            ...payload,
            email,
            name: payload.name || application.name,
          });
        }

        createAudit(db, user.id, decision.toUpperCase(), "application", application.id, { name: application.name });
        return { application };
      });
    },

    async createCandidate(user, payload = {}) {
      if (typeof repository.insertCandidate === "function") {
        const db = await repository.read();
        const candidate = {
          id: newId("candidate"),
          name: payload.name || "Новый кандидат",
          offerId: payload.offerId || db.offers[0]?.id,
          scoutId: user.role === "owner" && payload.scoutId ? payload.scoutId : user.id,
          teamId: payload.teamId || user.teamId || db.teams[0]?.id,
          status: payload.status || "screening",
          location: payload.location || "Remote",
          interviewPassed: false,
          registrationPassed: false,
          shiftsCompleted: 0,
          notes: payload.notes || "Добавлен через CRM",
          createdAt: nowIso(),
        };
        await repository.insertCandidate(candidate);
        if (typeof repository.createNotificationEntry === "function") {
          await repository.createNotificationEntry({
            id: newId("notif"),
            text: `Добавлен новый кандидат ${candidate.name}`,
            userIds: [candidate.scoutId],
            createdAt: nowIso(),
          });
        }
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "CREATE",
            entityType: "candidate",
            entityId: candidate.id,
            details: { name: candidate.name },
            createdAt: nowIso(),
          });
        }
        const fresh = await repository.read();
        const inserted = fresh.candidates.find((item) => item.id === candidate.id);
        return { candidate: expandCandidates(fresh, [inserted])[0] };
      }

      return repository.transaction(async (db) => {
        const candidate = {
          id: newId("candidate"),
          name: payload.name || "Новый кандидат",
          offerId: payload.offerId || db.offers[0]?.id,
          scoutId: user.role === "owner" && payload.scoutId ? payload.scoutId : user.id,
          teamId: payload.teamId || user.teamId || db.teams[0]?.id,
          status: payload.status || "screening",
          location: payload.location || "Remote",
          interviewPassed: false,
          registrationPassed: false,
          shiftsCompleted: 0,
          notes: payload.notes || "Добавлен через CRM",
          createdAt: nowIso(),
        };
        db.candidates.unshift(candidate);
        createNotification(db, `Добавлен новый кандидат ${candidate.name}`, [candidate.scoutId]);
        createAudit(db, user.id, "CREATE", "candidate", candidate.id, { name: candidate.name });
        return { candidate: expandCandidates(db, [candidate])[0] };
      });
    },

    async updateCandidate(user, candidateId, payload = {}) {
      if (typeof repository.patchCandidate === "function") {
        const currentDb = await repository.read();
        const current = currentDb.candidates.find((item) => item.id === candidateId);
        if (!current) throw new Error("Candidate not found");
        if (user.role !== "owner" && user.role !== "lead" && current.scoutId !== user.id) {
          throw new Error("Forbidden");
        }
        await repository.patchCandidate(candidateId, payload);
        if (typeof repository.createNotificationEntry === "function") {
          await repository.createNotificationEntry({
            id: newId("notif"),
            text: `Статус кандидата ${current.name} обновлен`,
            userIds: [current.scoutId],
            createdAt: nowIso(),
          });
        }
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "UPDATE",
            entityType: "candidate",
            entityId: candidateId,
            details: payload,
            createdAt: nowIso(),
          });
        }
        const fresh = await repository.read();
        const updated = fresh.candidates.find((item) => item.id === candidateId);
        return { candidate: expandCandidates(fresh, [updated])[0] };
      }

      return repository.transaction(async (db) => {
        const candidate = db.candidates.find((item) => item.id === candidateId);
        if (!candidate) throw new Error("Candidate not found");
        if (user.role !== "owner" && user.role !== "lead" && candidate.scoutId !== user.id) {
          throw new Error("Forbidden");
        }
        Object.assign(candidate, {
          status: payload.status ?? candidate.status,
          interviewPassed: payload.interviewPassed ?? candidate.interviewPassed,
          registrationPassed: payload.registrationPassed ?? candidate.registrationPassed,
          shiftsCompleted: payload.shiftsCompleted ?? candidate.shiftsCompleted,
          notes: payload.notes ?? candidate.notes,
        });
        createNotification(db, `Статус кандидата ${candidate.name} обновлен`, [candidate.scoutId]);
        createAudit(db, user.id, "UPDATE", "candidate", candidate.id, payload);
        return { candidate: expandCandidates(db, [candidate])[0] };
      });
    },

    async createOffer(user, payload = {}) {
      if (typeof repository.insertOffer === "function") {
        const offer = {
          id: newId("offer"),
          title: payload.title || "New Offer",
          reward: payload.reward || "$0",
          assignedScoutIds: Array.isArray(payload.assignedScoutIds) ? payload.assignedScoutIds : [],
          adminId: user.id,
          openings: Number(payload.openings || 1),
          priority: payload.priority || "medium",
          createdAt: nowIso(),
        };
        await repository.insertOffer(offer);
        if (typeof repository.createNotificationEntry === "function" && offer.assignedScoutIds.length) {
          await repository.createNotificationEntry({
            id: newId("notif"),
            text: `Новый оффер ${offer.title} создан`,
            userIds: offer.assignedScoutIds,
            createdAt: nowIso(),
          });
        }
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "CREATE",
            entityType: "offer",
            entityId: offer.id,
            details: { title: offer.title },
            createdAt: nowIso(),
          });
        }
        const fresh = await repository.read();
        const inserted = fresh.offers.find((item) => item.id === offer.id);
        return { offer: expandOffers(fresh, [inserted])[0] };
      }

      return repository.transaction(async (db) => {
        const offer = {
          id: newId("offer"),
          title: payload.title || "New Offer",
          reward: payload.reward || "$0",
          assignedScoutIds: Array.isArray(payload.assignedScoutIds) ? payload.assignedScoutIds : [],
          adminId: user.id,
          openings: Number(payload.openings || 1),
          priority: payload.priority || "medium",
          createdAt: nowIso(),
        };
        db.offers.unshift(offer);
        createAudit(db, user.id, "CREATE", "offer", offer.id, { title: offer.title });
        createNotification(db, `Новый оффер ${offer.title} создан`, offer.assignedScoutIds);
        return { offer: expandOffers(db, [offer])[0] };
      });
    },

    async updateOffer(user, offerId, payload = {}) {
      if (typeof repository.patchOffer === "function") {
        const currentDb = await repository.read();
        const current = currentDb.offers.find((item) => item.id === offerId);
        if (!current) throw new Error("Offer not found");
        await repository.patchOffer(offerId, payload);
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "UPDATE",
            entityType: "offer",
            entityId: offerId,
            details: { title: payload.title ?? current.title },
            createdAt: nowIso(),
          });
        }
        const fresh = await repository.read();
        const updated = fresh.offers.find((item) => item.id === offerId);
        return { offer: expandOffers(fresh, [updated])[0] };
      }

      return repository.transaction(async (db) => {
        const offer = db.offers.find((item) => item.id === offerId);
        if (!offer) throw new Error("Offer not found");
        offer.title = payload.title ?? offer.title;
        offer.reward = payload.reward ?? offer.reward;
        offer.openings = payload.openings ?? offer.openings;
        offer.priority = payload.priority ?? offer.priority;
        if (Array.isArray(payload.assignedScoutIds)) {
          offer.assignedScoutIds = payload.assignedScoutIds;
        }
        createAudit(db, user.id, "UPDATE", "offer", offer.id, { title: offer.title });
        return { offer: expandOffers(db, [offer])[0] };
      });
    },

    async createTask(user, payload = {}) {
      if (typeof repository.insertTask === "function") {
        const task = {
          id: newId("task"),
          title: payload.title || "Новая задача",
          byUserId: user.id,
          assigneeUserId: payload.assigneeUserId || null,
          teamId: payload.teamId || user.teamId || null,
          deadline: payload.deadline || nowIso().slice(0, 10),
          priority: payload.priority || "medium",
          done: false,
          createdAt: nowIso(),
        };
        await repository.insertTask(task);
        if (typeof repository.createNotificationEntry === "function" && task.assigneeUserId) {
          await repository.createNotificationEntry({
            id: newId("notif"),
            text: `Новая задача: ${task.title}`,
            userIds: [task.assigneeUserId],
            createdAt: nowIso(),
          });
        }
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "CREATE",
            entityType: "task",
            entityId: task.id,
            details: { title: task.title },
            createdAt: nowIso(),
          });
        }
        const fresh = await repository.read();
        const inserted = fresh.tasks.find((item) => item.id === task.id);
        return { task: expandTasks(fresh, [inserted])[0] };
      }

      return repository.transaction(async (db) => {
        const task = {
          id: newId("task"),
          title: payload.title || "Новая задача",
          byUserId: user.id,
          assigneeUserId: payload.assigneeUserId || null,
          teamId: payload.teamId || user.teamId || null,
          deadline: payload.deadline || nowIso().slice(0, 10),
          priority: payload.priority || "medium",
          done: false,
          createdAt: nowIso(),
        };
        db.tasks.unshift(task);
        createNotification(db, `Новая задача: ${task.title}`, task.assigneeUserId ? [task.assigneeUserId] : null);
        createAudit(db, user.id, "CREATE", "task", task.id, { title: task.title });
        return { task: expandTasks(db, [task])[0] };
      });
    },

    async updateTask(user, taskId, payload = {}) {
      if (typeof repository.patchTask === "function") {
        const currentDb = await repository.read();
        const current = currentDb.tasks.find((item) => item.id === taskId);
        if (!current) throw new Error("Task not found");
        const canManage = safeUser(user).permissions.manageTasks;
        const canTouchOwn = current.assigneeUserId === user.id;
        if (!canManage && !canTouchOwn) throw new Error("Forbidden");
        await repository.patchTask(taskId, {
          done: payload.done,
          title: canManage ? payload.title : undefined,
          deadline: canManage ? payload.deadline : undefined,
          priority: canManage ? payload.priority : undefined,
          teamId: canManage ? payload.teamId : undefined,
          assigneeUserId: canManage ? payload.assigneeUserId : undefined,
        });
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "UPDATE",
            entityType: "task",
            entityId: taskId,
            details: { done: payload.done ?? current.done },
            createdAt: nowIso(),
          });
        }
        const fresh = await repository.read();
        const updated = fresh.tasks.find((item) => item.id === taskId);
        return { task: expandTasks(fresh, [updated])[0] };
      }

      return repository.transaction(async (db) => {
        const task = db.tasks.find((item) => item.id === taskId);
        if (!task) throw new Error("Task not found");
        const canManage = safeUser(user).permissions.manageTasks;
        const canTouchOwn = task.assigneeUserId === user.id;
        if (!canManage && !canTouchOwn) throw new Error("Forbidden");

        task.done = payload.done ?? task.done;
        task.title = canManage ? payload.title ?? task.title : task.title;
        task.deadline = canManage ? payload.deadline ?? task.deadline : task.deadline;
        task.priority = canManage ? payload.priority ?? task.priority : task.priority;
        task.teamId = canManage ? payload.teamId ?? task.teamId : task.teamId;
        task.assigneeUserId = canManage ? payload.assigneeUserId ?? task.assigneeUserId : task.assigneeUserId;
        createAudit(db, user.id, "UPDATE", "task", task.id, { done: task.done });
        return { task: expandTasks(db, [task])[0] };
      });
    },

    async createTraining(user, payload = {}) {
      if (typeof repository.insertTraining === "function") {
        const training = {
          id: newId("training"),
          title: payload.title || "Новый модуль обучения",
          role: payload.role || "scout",
          mandatory: payload.mandatory !== false,
          assignedByUserId: user.id,
          assignedUserIds: Array.isArray(payload.assignedUserIds) ? payload.assignedUserIds : [],
          completedUserIds: [],
          createdAt: nowIso(),
        };
        await repository.insertTraining(training);
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "CREATE",
            entityType: "training",
            entityId: training.id,
            details: { title: training.title },
            createdAt: nowIso(),
          });
        }
        return { training };
      }

      return repository.transaction(async (db) => {
        const training = {
          id: newId("training"),
          title: payload.title || "Новый модуль обучения",
          role: payload.role || "scout",
          mandatory: payload.mandatory !== false,
          assignedByUserId: user.id,
          assignedUserIds: Array.isArray(payload.assignedUserIds) ? payload.assignedUserIds : [],
          completedUserIds: [],
          createdAt: nowIso(),
        };
        db.trainings.unshift(training);
        createAudit(db, user.id, "CREATE", "training", training.id, { title: training.title });
        return { training };
      });
    },

    async completeTraining(user, trainingId) {
      if (typeof repository.markTrainingCompleted === "function") {
        const currentDb = await repository.read();
        const training = currentDb.trainings.find((item) => item.id === trainingId);
        if (!training) throw new Error("Training not found");
        await repository.markTrainingCompleted(trainingId, user.id, nowIso());
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "COMPLETE",
            entityType: "training",
            entityId: trainingId,
            details: {},
            createdAt: nowIso(),
          });
        }
        return { training: { ...training, completedUserIds: [...new Set([...(training.completedUserIds || []), user.id])] } };
      }

      return repository.transaction(async (db) => {
        const training = db.trainings.find((item) => item.id === trainingId);
        if (!training) throw new Error("Training not found");
        if (!training.completedUserIds.includes(user.id)) {
          training.completedUserIds.push(user.id);
        }
        createAudit(db, user.id, "COMPLETE", "training", training.id, {});
        return { training };
      });
    },

    async createUser(actor, payload = {}) {
      if (typeof repository.insertUser === "function") {
        const db = await repository.read();
        const email = String(payload.email || "").trim().toLowerCase();
        if (!email) throw new Error("Email is required");
        if (db.users.find((item) => item.email.toLowerCase() === email)) {
          throw new Error("User with this email already exists");
        }
        const createdUser = createManagedUser(db, payload);
        await repository.insertUser(createdUser);
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: actor.id,
            action: "CREATE",
            entityType: "user",
            entityId: createdUser.id,
            details: { email: createdUser.email },
            createdAt: nowIso(),
          });
        }
        return { user: safeUser(createdUser) };
      }

      return repository.transaction(async (db) => {
        const email = String(payload.email || "").trim().toLowerCase();
        if (!email) throw new Error("Email is required");
        if (db.users.find((item) => item.email.toLowerCase() === email)) {
          throw new Error("User with this email already exists");
        }
        const createdUser = createManagedUser(db, payload);
        createAudit(db, actor.id, "CREATE", "user", createdUser.id, { email: createdUser.email });
        return { user: safeUser(createdUser) };
      });
    },

    async updateUser(actor, userId, payload = {}) {
      return repository.transaction(async (db) => {
        const target = db.users.find((item) => item.id === userId);
        if (!target) throw new Error("User not found");
        const previousTeamId = target.teamId;
        target.name = payload.name ?? target.name;
        target.role = payload.role ?? target.role;
        target.teamId = payload.teamId ?? target.teamId;
        target.subscription = payload.subscription ?? target.subscription;
        target.payoutBoost = payload.payoutBoost ?? target.payoutBoost;

        if (previousTeamId !== target.teamId) {
          db.teams.forEach((team) => {
            team.memberIds = team.memberIds.filter((id) => id !== target.id);
          });
          const newTeam = db.teams.find((team) => team.id === target.teamId);
          if (newTeam && !newTeam.memberIds.includes(target.id)) {
            newTeam.memberIds.push(target.id);
          }
        }

        createAudit(db, actor.id, "UPDATE", "user", target.id, { role: target.role, teamId: target.teamId });
        return { user: safeUser(target) };
      });
    },

    async createPost(user, payload = {}) {
      if (typeof repository.insertPost === "function") {
        const post = {
          id: newId("post"),
          type: payload.type === "news" && user.role !== "owner" ? "forum" : (payload.type || "forum"),
          authorId: user.id,
          authorName: user.name,
          title: payload.title || "Новый пост",
          body: payload.body || "",
          createdAt: nowIso(),
        };
        await repository.insertPost(post);
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "CREATE",
            entityType: "post",
            entityId: post.id,
            details: { type: post.type },
            createdAt: nowIso(),
          });
        }
        return { post };
      }

      return repository.transaction(async (db) => {
        const post = {
          id: newId("post"),
          type: payload.type === "news" && user.role !== "owner" ? "forum" : (payload.type || "forum"),
          authorId: user.id,
          authorName: user.name,
          title: payload.title || "Новый пост",
          body: payload.body || "",
          createdAt: nowIso(),
        };
        db.posts.unshift(post);
        createAudit(db, user.id, "CREATE", "post", post.id, { type: post.type });
        return { post };
      });
    },

    async createChatMessage(user, chatId, payload = {}) {
      if (typeof repository.insertChatMessage === "function") {
        const currentDb = await repository.read();
        const chat = currentDb.chats.find((item) => item.id === chatId);
        if (!chat) throw new Error("Chat not found");
        if (!(user.role === "owner" || chat.global || chat.teamId === user.teamId || chat.participantIds.includes(user.id))) {
          throw new Error("Forbidden");
        }
        const message = {
          id: newId("msg"),
          authorId: user.id,
          authorName: user.name,
          text: payload.text || "",
          time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
          sentAt: nowIso(),
        };
        await repository.insertChatMessage(chatId, message);
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "CREATE",
            entityType: "message",
            entityId: message.id,
            details: { chatId },
            createdAt: nowIso(),
          });
        }
        return { message };
      }

      return repository.transaction(async (db) => {
        const chat = db.chats.find((item) => item.id === chatId);
        if (!chat) throw new Error("Chat not found");
        if (!(user.role === "owner" || chat.global || chat.teamId === user.teamId || chat.participantIds.includes(user.id))) {
          throw new Error("Forbidden");
        }
        const message = {
          id: newId("msg"),
          authorId: user.id,
          authorName: user.name,
          text: payload.text || "",
          time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        };
        chat.messages.push(message);
        createAudit(db, user.id, "CREATE", "message", message.id, { chatId: chat.id });
        return { message };
      });
    },
  };
}

module.exports = {
  createPlatformService,
};
