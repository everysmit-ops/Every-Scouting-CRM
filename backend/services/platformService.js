const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { nowIso, newId, hashPassword, safeUser } = require("../lib/auth");
const { UPLOADS_ROOT } = require("../lib/config");
const {
  createAudit,
  createNotification,
  expandCandidates,
  expandOffers,
  expandTasks,
  getBootstrap,
} = require("../lib/domain");

function createPlatformService(repository) {
  async function ensureUploadsDir() {
    await fs.mkdir(UPLOADS_ROOT, { recursive: true });
  }

  function sanitizeFilename(filename) {
    const original = path.basename(String(filename || "upload"));
    const ext = path.extname(original).toLowerCase();
    const stem = path.basename(original, ext).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return {
      ext,
      stem: stem || "file",
    };
  }

  async function saveUploadAsset(user, payload = {}) {
    const filename = String(payload.filename || "").trim();
    const dataBase64 = String(payload.dataBase64 || "").trim();
    const contentType = String(payload.contentType || "application/octet-stream").trim();

    if (!filename) throw new Error("Filename is required");
    if (!dataBase64) throw new Error("Upload data is required");

    const normalizedBase64 = dataBase64.includes(",") ? dataBase64.split(",").pop() : dataBase64;
    const buffer = Buffer.from(normalizedBase64, "base64");
    if (!buffer.length) throw new Error("Upload is empty");
    if (buffer.length > 8 * 1024 * 1024) throw new Error("File is too large. Max 8 MB");

    const { ext, stem } = sanitizeFilename(filename);
    const storedName = `${newId("upload")}-${stem}${ext}`;
    const filePath = path.join(UPLOADS_ROOT, storedName);

    await ensureUploadsDir();
    await fs.writeFile(filePath, buffer);

    if (typeof repository.createAuditEntry === "function") {
      await repository.createAuditEntry({
        id: newId("audit"),
        actorId: user.id,
        action: "UPLOAD",
        entityType: "asset",
        entityId: storedName,
        details: { filename, contentType, size: buffer.length },
        createdAt: nowIso(),
      });
    }

    return {
      upload: {
        filename,
        contentType,
        size: buffer.length,
        url: `/uploads/${storedName}`,
      },
    };
  }

  function getUploadFilePath(url) {
    if (!String(url || "").startsWith("/uploads/")) return null;
    return path.join(UPLOADS_ROOT, path.basename(url));
  }

  async function cleanupUploadedFile(url) {
    const filePath = getUploadFilePath(url);
    if (!filePath) return;
    await fs.unlink(filePath).catch(() => undefined);
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
      username: payload.username || String(payload.email || "").split("@")[0] || null,
      bio: payload.bio || "",
      avatarUrl: payload.avatarUrl || null,
      bannerUrl: payload.bannerUrl || null,
      socialLinks: Array.isArray(payload.socialLinks) ? payload.socialLinks : [],
      lastOnlineAt: payload.lastOnlineAt || null,
      referralCode: payload.referralCode || `REF-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      referralIncomePercent: Number(payload.referralIncomePercent || 5),
      payoutBoost: payload.payoutBoost || "5%",
      locale: payload.locale || "ru",
      permissionsOverride: payload.permissionsOverride || {},
    };
    db.users.push(createdUser);
    const team = db.teams.find((item) => item.id === createdUser.teamId);
    if (team && !team.memberIds.includes(createdUser.id)) {
      team.memberIds.push(createdUser.id);
    }
    return createdUser;
  }

  function syncPayoutsInDb(db) {
    db.payouts = Array.isArray(db.payouts) ? db.payouts : [];
    const payoutsByCandidateId = new Map(db.payouts.map((payout) => [payout.candidateId, payout]));

    db.candidates
      .filter((candidate) => candidate.interviewPassed && candidate.registrationPassed && candidate.shiftsCompleted >= 2)
      .forEach((candidate) => {
        const scout = db.users.find((user) => user.id === candidate.scoutId);
        const offer = db.offers.find((item) => item.id === candidate.offerId);
        const baseAmount = parseMoney(offer?.reward);
        const boostPercent = parsePercent(scout?.payoutBoost);
        const boostAmount = Math.round((baseAmount * boostPercent) / 100);
        const finalAmount = baseAmount + boostAmount;
        const referralPercent = Number(scout?.referralIncomePercent || 0);
        const referralAmount = Math.round((finalAmount * referralPercent) / 100);
        const existing = payoutsByCandidateId.get(candidate.id);

        const payout = {
          id: existing?.id || newId("payout"),
          candidateId: candidate.id,
          scoutId: candidate.scoutId,
          teamId: candidate.teamId,
          offerId: candidate.offerId,
          baseAmount,
          boostPercent,
          boostAmount,
          finalAmount,
          referralPercent,
          referralAmount,
          status: existing?.status || "pending",
          createdAt: existing?.createdAt || candidate.createdAt || nowIso(),
          approvedAt: existing?.approvedAt || null,
          paidAt: existing?.paidAt || null,
          updatedAt: nowIso(),
        };

        payoutsByCandidateId.set(candidate.id, payout);
      });

    db.payouts = Array.from(payoutsByCandidateId.values()).sort((left, right) =>
      String(right.createdAt).localeCompare(String(left.createdAt)),
    );
  }

  async function ensurePayoutsSynced() {
    if (typeof repository.syncPayouts === "function") {
      await repository.syncPayouts(syncPayoutsInDb);
      return;
    }

    await repository.transaction(async (db) => {
      syncPayoutsInDb(db);
    });
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
      await ensurePayoutsSynced();
      if (typeof repository.getBootstrapData === "function") {
        return repository.getBootstrapData(user);
      }
      const db = await repository.read();
      return getBootstrap(db, user);
    },

    async markNotificationRead(user, notificationId) {
      if (typeof repository.markNotificationRead === "function") {
        await repository.markNotificationRead(notificationId, user.id, nowIso());
        return { ok: true, notificationId };
      }

      return repository.transaction(async (db) => {
        const notification = (db.notifications || []).find((item) => item.id === notificationId);
        if (!notification) throw new Error("Notification not found");
        notification.readBy = Array.isArray(notification.readBy) ? notification.readBy : [];
        if (!notification.readBy.includes(user.id)) {
          notification.readBy.push(user.id);
        }
        return { ok: true, notificationId };
      });
    },

    async markAllNotificationsRead(user) {
      if (typeof repository.markAllNotificationsRead === "function") {
        await repository.markAllNotificationsRead(user.id, nowIso());
        return { ok: true };
      }

      return repository.transaction(async (db) => {
        (db.notifications || []).forEach((notification) => {
          if (notification.userIds && !notification.userIds.includes(user.id)) return;
          notification.readBy = Array.isArray(notification.readBy) ? notification.readBy : [];
          if (!notification.readBy.includes(user.id)) {
            notification.readBy.push(user.id);
          }
        });
        return { ok: true };
      });
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

    async uploadAsset(user, payload = {}) {
      return saveUploadAsset(user, payload);
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
          interviewAt: payload.interviewAt || null,
          interviewFormat: payload.interviewFormat || "video",
          interviewerName: payload.interviewerName || "",
          interviewStatus: payload.interviewStatus || (payload.interviewAt ? "scheduled" : "unscheduled"),
          interviewNotes: payload.interviewNotes || "",
          interviewPassed: false,
          registrationPassed: false,
          shiftsCompleted: 0,
          documents: [],
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
          interviewAt: payload.interviewAt || null,
          interviewFormat: payload.interviewFormat || "video",
          interviewerName: payload.interviewerName || "",
          interviewStatus: payload.interviewStatus || (payload.interviewAt ? "scheduled" : "unscheduled"),
          interviewNotes: payload.interviewNotes || "",
          interviewPassed: false,
          registrationPassed: false,
          shiftsCompleted: 0,
          documents: [],
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
        await ensurePayoutsSynced();
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
          interviewAt: payload.interviewAt ?? candidate.interviewAt,
          interviewFormat: payload.interviewFormat ?? candidate.interviewFormat,
          interviewerName: payload.interviewerName ?? candidate.interviewerName,
          interviewStatus: payload.interviewStatus ?? candidate.interviewStatus,
          interviewNotes: payload.interviewNotes ?? candidate.interviewNotes,
          interviewPassed: payload.interviewPassed ?? candidate.interviewPassed,
          registrationPassed: payload.registrationPassed ?? candidate.registrationPassed,
          shiftsCompleted: payload.shiftsCompleted ?? candidate.shiftsCompleted,
          notes: payload.notes ?? candidate.notes,
        });
        createNotification(db, `Статус кандидата ${candidate.name} обновлен`, [candidate.scoutId]);
        createAudit(db, user.id, "UPDATE", "candidate", candidate.id, payload);
        syncPayoutsInDb(db);
        return { candidate: expandCandidates(db, [candidate])[0] };
      });
    },

    async addCandidateDocument(user, candidateId, payload = {}) {
      if (typeof repository.insertCandidateDocument === "function") {
        const currentDb = await repository.read();
        const candidate = currentDb.candidates.find((item) => item.id === candidateId);
        if (!candidate) throw new Error("Candidate not found");
        if (user.role !== "owner" && user.role !== "lead" && candidate.scoutId !== user.id) {
          throw new Error("Forbidden");
        }
        const document = {
          id: newId("doc"),
          candidateId,
          title: payload.title || "Новый документ",
          type: payload.type || "link",
          url: payload.url || "",
          note: payload.note || "",
          uploadedByUserId: user.id,
          createdAt: nowIso(),
        };
        await repository.insertCandidateDocument(document);
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "UPLOAD",
            entityType: "candidate_document",
            entityId: document.id,
            details: { candidateId, title: document.title },
            createdAt: nowIso(),
          });
        }
        const fresh = await repository.read();
        const updated = fresh.candidates.find((item) => item.id === candidateId);
        return { candidate: expandCandidates(fresh, [updated])[0], document };
      }

      return repository.transaction(async (db) => {
        const candidate = db.candidates.find((item) => item.id === candidateId);
        if (!candidate) throw new Error("Candidate not found");
        if (user.role !== "owner" && user.role !== "lead" && candidate.scoutId !== user.id) {
          throw new Error("Forbidden");
        }
        const document = {
          id: newId("doc"),
          candidateId,
          title: payload.title || "Новый документ",
          type: payload.type || "link",
          url: payload.url || "",
          note: payload.note || "",
          uploadedByUserId: user.id,
          createdAt: nowIso(),
        };
        candidate.documents = Array.isArray(candidate.documents) ? candidate.documents : [];
        candidate.documents.unshift(document);
        createAudit(db, user.id, "UPLOAD", "candidate_document", document.id, { candidateId, title: document.title });
        return { candidate: expandCandidates(db, [candidate])[0], document };
      });
    },

    async removeCandidateDocument(user, candidateId, documentId) {
      if (typeof repository.deleteCandidateDocument === "function") {
        const currentDb = await repository.read();
        const candidate = currentDb.candidates.find((item) => item.id === candidateId);
        if (!candidate) throw new Error("Candidate not found");
        if (user.role !== "owner" && user.role !== "lead" && candidate.scoutId !== user.id) {
          throw new Error("Forbidden");
        }
        const document = (candidate.documents || []).find((item) => item.id === documentId);
        if (!document) throw new Error("Document not found");
        await repository.deleteCandidateDocument(documentId);
        await cleanupUploadedFile(document.url);
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "DELETE",
            entityType: "candidate_document",
            entityId: document.id,
            details: { candidateId, title: document.title },
            createdAt: nowIso(),
          });
        }
        const fresh = await repository.read();
        const updated = fresh.candidates.find((item) => item.id === candidateId);
        return { candidate: expandCandidates(fresh, [updated])[0], documentId };
      }

      return repository.transaction(async (db) => {
        const candidate = db.candidates.find((item) => item.id === candidateId);
        if (!candidate) throw new Error("Candidate not found");
        if (user.role !== "owner" && user.role !== "lead" && candidate.scoutId !== user.id) {
          throw new Error("Forbidden");
        }
        const documents = Array.isArray(candidate.documents) ? candidate.documents : [];
        const document = documents.find((item) => item.id === documentId);
        if (!document) throw new Error("Document not found");
        candidate.documents = documents.filter((item) => item.id !== documentId);
        await cleanupUploadedFile(document.url);
        createAudit(db, user.id, "DELETE", "candidate_document", document.id, { candidateId, title: document.title });
        return { candidate: expandCandidates(db, [candidate])[0], documentId };
      });
    },

    async addCandidateComment(user, candidateId, payload = {}) {
      if (typeof repository.insertCandidateComment === "function") {
        const currentDb = await repository.read();
        const candidate = currentDb.candidates.find((item) => item.id === candidateId);
        if (!candidate) throw new Error("Candidate not found");
        if (user.role !== "owner" && user.role !== "lead" && candidate.scoutId !== user.id) {
          throw new Error("Forbidden");
        }
        const comment = {
          id: newId("candidate-comment"),
          candidateId,
          authorId: user.id,
          authorName: user.name,
          body: payload.body || "",
          createdAt: nowIso(),
        };
        await repository.insertCandidateComment(comment);
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "COMMENT",
            entityType: "candidate",
            entityId: candidateId,
            details: { commentId: comment.id },
            createdAt: nowIso(),
          });
        }
        const fresh = await repository.read();
        const updated = fresh.candidates.find((item) => item.id === candidateId);
        return { candidate: expandCandidates(fresh, [updated])[0], comment };
      }

      return repository.transaction(async (db) => {
        const candidate = db.candidates.find((item) => item.id === candidateId);
        if (!candidate) throw new Error("Candidate not found");
        if (user.role !== "owner" && user.role !== "lead" && candidate.scoutId !== user.id) {
          throw new Error("Forbidden");
        }
        const comment = {
          id: newId("candidate-comment"),
          candidateId,
          authorId: user.id,
          authorName: user.name,
          body: payload.body || "",
          createdAt: nowIso(),
        };
        candidate.comments = Array.isArray(candidate.comments) ? candidate.comments : [];
        candidate.comments.push(comment);
        createAudit(db, user.id, "COMMENT", "candidate", candidate.id, { commentId: comment.id });
        return { candidate: expandCandidates(db, [candidate])[0], comment };
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
        await ensurePayoutsSynced();
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
        syncPayoutsInDb(db);
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
        target.permissionsOverride = payload.permissionsOverride ?? target.permissionsOverride ?? {};

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
        syncPayoutsInDb(db);
        return { user: safeUser(target) };
      });
    },

    async updateProfile(user, payload = {}) {
      const socialLinks = Array.isArray(payload.socialLinks)
        ? payload.socialLinks
            .filter((item) => item && item.label && item.url)
            .map((item) => ({ label: String(item.label).trim(), url: String(item.url).trim() }))
        : undefined;

      if (typeof repository.patchOwnProfile === "function") {
        const updated = await repository.patchOwnProfile(user.id, {
          name: payload.name ?? user.name,
          username: payload.username ?? user.username ?? null,
          bio: payload.bio ?? user.bio ?? "",
          avatarUrl: payload.avatarUrl ?? user.avatarUrl ?? null,
          bannerUrl: payload.bannerUrl ?? user.bannerUrl ?? null,
          socialLinks,
          theme: payload.theme ?? user.theme,
          locale: payload.locale ?? user.locale,
          lastOnlineAt: nowIso(),
        });
        if (!updated) throw new Error("User not found");
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "UPDATE",
            entityType: "profile",
            entityId: user.id,
            details: { username: updated.username },
            createdAt: nowIso(),
          });
        }
        return { user: safeUser(updated) };
      }

      return repository.transaction(async (db) => {
        const target = db.users.find((item) => item.id === user.id);
        if (!target) throw new Error("User not found");
        target.name = payload.name ?? target.name;
        target.username = payload.username ?? target.username ?? String(target.email || "").split("@")[0];
        target.bio = payload.bio ?? target.bio ?? "";
        target.avatarUrl = payload.avatarUrl ?? target.avatarUrl ?? null;
        target.bannerUrl = payload.bannerUrl ?? target.bannerUrl ?? null;
        target.socialLinks = socialLinks ?? target.socialLinks ?? [];
        target.theme = payload.theme ?? target.theme;
        target.locale = payload.locale ?? target.locale;
        target.lastOnlineAt = nowIso();
        createAudit(db, user.id, "UPDATE", "profile", target.id, { username: target.username });
        return { user: safeUser(target) };
      });
    },

    async updatePayout(user, payoutId, payload = {}) {
      if (user.role !== "owner") throw new Error("Forbidden");

      if (typeof repository.patchPayoutStatus === "function") {
        const status = payload.status;
        if (!["pending", "approved", "paid"].includes(status)) throw new Error("Invalid payout status");
        const timestamp = nowIso();
        const updated = await repository.patchPayoutStatus(payoutId, {
          status,
          approvedAt: status === "approved" || status === "paid" ? timestamp : null,
          paidAt: status === "paid" ? timestamp : null,
          updatedAt: timestamp,
        });
        if (!updated) throw new Error("Payout not found");
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "UPDATE",
            entityType: "payout",
            entityId: payoutId,
            details: { status },
            createdAt: nowIso(),
          });
        }
        const fresh = await repository.read();
        return { payout: fresh.payouts.find((item) => item.id === payoutId) || updated };
      }

      return repository.transaction(async (db) => {
        const payout = (db.payouts || []).find((item) => item.id === payoutId);
        if (!payout) throw new Error("Payout not found");
        if (!["pending", "approved", "paid"].includes(payload.status)) throw new Error("Invalid payout status");
        const timestamp = nowIso();
        payout.status = payload.status;
        payout.approvedAt = payload.status === "approved" || payload.status === "paid" ? timestamp : null;
        payout.paidAt = payload.status === "paid" ? timestamp : null;
        payout.updatedAt = timestamp;
        createAudit(db, user.id, "UPDATE", "payout", payout.id, { status: payout.status });
        return { payout };
      });
    },

    async updatePayoutBatch(user, payload = {}) {
      if (user.role !== "owner") throw new Error("Forbidden");
      const payoutIds = Array.isArray(payload.payoutIds) ? payload.payoutIds.filter(Boolean) : [];
      if (!payoutIds.length) throw new Error("Payout ids are required");
      const status = payload.status;
      if (!["pending", "approved", "paid"].includes(status)) throw new Error("Invalid payout status");

      if (typeof repository.patchPayoutStatus === "function") {
        const updated = [];
        for (const payoutId of payoutIds) {
          const timestamp = nowIso();
          const payout = await repository.patchPayoutStatus(payoutId, {
            status,
            approvedAt: status === "approved" || status === "paid" ? timestamp : null,
            paidAt: status === "paid" ? timestamp : null,
            updatedAt: timestamp,
          });
          if (payout) {
            updated.push(payout);
            if (typeof repository.createAuditEntry === "function") {
              await repository.createAuditEntry({
                id: newId("audit"),
                actorId: user.id,
                action: "BATCH_UPDATE",
                entityType: "payout",
                entityId: payout.id,
                details: { status, batch: true },
                createdAt: nowIso(),
              });
            }
          }
        }
        return { ok: true, updatedCount: updated.length, payouts: updated };
      }

      return repository.transaction(async (db) => {
        const timestamp = nowIso();
        const updated = (db.payouts || []).filter((item) => payoutIds.includes(item.id));
        updated.forEach((payout) => {
          payout.status = status;
          payout.approvedAt = status === "approved" || status === "paid" ? timestamp : null;
          payout.paidAt = status === "paid" ? timestamp : null;
          payout.updatedAt = timestamp;
          createAudit(db, user.id, "BATCH_UPDATE", "payout", payout.id, { status, batch: true });
        });
        return { ok: true, updatedCount: updated.length, payouts: updated };
      });
    },

    async createPost(user, payload = {}) {
      if (typeof repository.insertPost === "function") {
        const post = {
          id: newId("post"),
          type: payload.type === "news" && user.role !== "owner" ? "forum" : (payload.type || "forum"),
          category: payload.category || (payload.type === "news" ? "announcements" : "general"),
          pinned: Boolean(payload.pinned && user.role === "owner"),
          authorId: user.id,
          authorName: user.name,
          title: payload.title || "Новый пост",
          body: payload.body || "",
          comments: [],
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
          category: payload.category || (payload.type === "news" ? "announcements" : "general"),
          pinned: Boolean(payload.pinned && user.role === "owner"),
          authorId: user.id,
          authorName: user.name,
          title: payload.title || "Новый пост",
          body: payload.body || "",
          comments: [],
          createdAt: nowIso(),
        };
        db.posts.unshift(post);
        createAudit(db, user.id, "CREATE", "post", post.id, { type: post.type });
        return { post };
      });
    },

    async addPostComment(user, postId, payload = {}) {
      if (typeof repository.insertPostComment === "function") {
        const currentDb = await repository.read();
        const post = currentDb.posts.find((item) => item.id === postId);
        if (!post) throw new Error("Post not found");
        const comment = {
          id: newId("comment"),
          postId,
          authorId: user.id,
          authorName: user.name,
          body: payload.body || "",
          createdAt: nowIso(),
        };
        await repository.insertPostComment(comment);
        if (typeof repository.createAuditEntry === "function") {
          await repository.createAuditEntry({
            id: newId("audit"),
            actorId: user.id,
            action: "COMMENT",
            entityType: "post",
            entityId: postId,
            details: { commentId: comment.id },
            createdAt: nowIso(),
          });
        }
        return { comment };
      }

      return repository.transaction(async (db) => {
        const post = db.posts.find((item) => item.id === postId);
        if (!post) throw new Error("Post not found");
        const comment = {
          id: newId("comment"),
          postId,
          authorId: user.id,
          authorName: user.name,
          body: payload.body || "",
          createdAt: nowIso(),
        };
        post.comments = Array.isArray(post.comments) ? post.comments : [];
        post.comments.push(comment);
        createAudit(db, user.id, "COMMENT", "post", postId, { commentId: comment.id });
        return { comment };
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
