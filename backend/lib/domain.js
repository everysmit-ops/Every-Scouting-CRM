const { ROLE_LABELS, PERMISSION_LABELS } = require("./config");
const { nowIso, newId, safeUser } = require("./auth");

function createAudit(db, actorId, action, entityType, entityId, details) {
  db.auditLog.unshift({
    id: newId("audit"),
    actorId,
    action,
    entityType,
    entityId,
    details,
    createdAt: nowIso(),
  });
}

function createNotification(db, text, userIds) {
  db.notifications.unshift({
    id: newId("notif"),
    text,
    userIds,
    createdAt: nowIso(),
    readBy: [],
  });
}

function isKpiQualified(candidate) {
  return candidate.interviewPassed && candidate.registrationPassed && candidate.shiftsCompleted >= 2;
}

function visibleCandidates(db, user) {
  if (user.role === "owner") return db.candidates;
  if (user.role === "lead") return db.candidates.filter((candidate) => candidate.teamId === user.teamId);
  return db.candidates.filter((candidate) => candidate.scoutId === user.id);
}

function visibleOffers(db, user) {
  if (user.role === "owner") return db.offers;
  if (user.role === "lead") {
    return db.offers.filter((offer) => offer.assignedScoutIds.some((scoutId) => {
      const scout = db.users.find((userItem) => userItem.id === scoutId);
      return scout && scout.teamId === user.teamId;
    }));
  }
  return db.offers.filter((offer) => offer.assignedScoutIds.includes(user.id));
}

function visibleTasks(db, user) {
  if (user.role === "owner") return db.tasks;
  if (user.role === "lead") return db.tasks.filter((task) => task.teamId === user.teamId || task.assigneeUserId === user.id);
  return db.tasks.filter((task) => task.assigneeUserId === user.id || task.teamId === user.teamId);
}

function visibleChats(db, user) {
  if (user.role === "owner") return db.chats;
  return db.chats.filter((chat) => chat.teamId === user.teamId || chat.participantIds.includes(user.id) || chat.global);
}

function visibleNotifications(db, user) {
  return db.notifications.filter((notification) => !notification.userIds || notification.userIds.includes(user.id)).slice(0, 12);
}

function visiblePayouts(db, user) {
  if (user.role === "owner") return db.payouts || [];
  if (user.role === "lead") return (db.payouts || []).filter((payout) => payout.teamId === user.teamId);
  return (db.payouts || []).filter((payout) => payout.scoutId === user.id);
}

function teamStats(db, user) {
  const visibleTeams = user.role === "owner"
    ? db.teams
    : db.teams.filter((team) => team.id === user.teamId);

  return visibleTeams.map((team) => {
    const teamCandidates = db.candidates.filter((candidate) => candidate.teamId === team.id);
    const qualified = teamCandidates.filter(isKpiQualified).length;
    return {
      ...team,
      kpiPercent: teamCandidates.length ? Math.round((qualified / teamCandidates.length) * 100) : 0,
      membersExpanded: team.memberIds
        .map((memberId) => db.users.find((userItem) => userItem.id === memberId))
        .filter(Boolean)
        .map(safeUser),
      leadUser: safeUser(db.users.find((userItem) => userItem.id === team.leadId)),
    };
  });
}

function expandCandidates(db, items) {
  return items.map((candidate) => ({
    ...candidate,
    offer: db.offers.find((offer) => offer.id === candidate.offerId) || null,
    scout: safeUser(db.users.find((user) => user.id === candidate.scoutId)),
    team: db.teams.find((team) => team.id === candidate.teamId) || null,
    kpiQualified: isKpiQualified(candidate),
  }));
}

function expandOffers(db, items) {
  return items.map((offer) => ({
    ...offer,
    admin: safeUser(db.users.find((user) => user.id === offer.adminId)),
    assignedScouts: offer.assignedScoutIds
      .map((id) => db.users.find((user) => user.id === id))
      .filter(Boolean)
      .map(safeUser),
  }));
}

function expandTasks(db, items) {
  return items.map((task) => ({
    ...task,
    assigneeUser: task.assigneeUserId ? safeUser(db.users.find((user) => user.id === task.assigneeUserId)) : null,
    team: task.teamId ? db.teams.find((team) => team.id === task.teamId) || null : null,
  }));
}

function expandTrainings(db, user) {
  return db.trainings.map((training) => ({
    ...training,
    completed: training.completedUserIds.includes(user.id),
    assignedUsers: training.assignedUserIds
      .map((id) => db.users.find((userItem) => userItem.id === id))
      .filter(Boolean)
      .map(safeUser),
  }));
}

function getBootstrap(db, user) {
  const userView = safeUser(user);
  const candidates = expandCandidates(db, visibleCandidates(db, user));
  const offers = expandOffers(db, visibleOffers(db, user));
  const teams = teamStats(db, user);
  const tasks = expandTasks(db, visibleTasks(db, user));
  const trainings = expandTrainings(db, user);
  const chats = visibleChats(db, user);
  const posts = db.posts.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const publicApplications = user.role === "owner" ? db.publicApplications : [];
  const notifications = visibleNotifications(db, user);
  const payouts = visiblePayouts(db, user)
    .slice()
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  const scoreboard = db.users
    .filter((person) => ["lead", "scout", "referral"].includes(person.role))
    .map((person) => {
      const personCandidates = db.candidates.filter((candidate) => candidate.scoutId === person.id);
      const qualified = personCandidates.filter(isKpiQualified).length;
      const kpiScore = personCandidates.length ? Math.round((qualified / personCandidates.length) * 100) : 0;
      return {
        id: person.id,
        name: person.name,
        role: person.role,
        kpiScore,
        qualified,
        payoutBoost: person.payoutBoost,
      };
    })
    .sort((left, right) => right.kpiScore - left.kpiScore)
    .slice(0, 10);

  return {
    user: userView,
    metadata: {
      roles: ROLE_LABELS,
      permissionLabels: PERMISSION_LABELS,
      permissions: userView.permissions,
      companyName: db.company.name,
      locale: db.company.locale,
      referenceData: {
        teams: db.teams.map((team) => ({ id: team.id, name: team.name })),
        offers: db.offers.map((offer) => ({ id: offer.id, title: offer.title })),
        users: db.users.map((item) => safeUser(item)),
      },
    },
    summary: {
      candidates: candidates.length,
      kpiQualified: candidates.filter((candidate) => candidate.kpiQualified).length,
      offers: offers.length,
      trainingPending: trainings.filter((training) => training.role === user.role && training.mandatory && !training.completed).length,
      applications: publicApplications.length,
    },
    candidates,
    offers,
    teams,
    tasks,
    trainings,
    chats,
    posts,
    publicApplications,
    notifications,
    payouts,
    scoreboard,
    auditLog: db.auditLog.slice(0, 10),
    users: user.role === "owner" ? db.users.map((item) => safeUser(item)) : [],
  };
}

module.exports = {
  createAudit,
  createNotification,
  isKpiQualified,
  expandCandidates,
  expandOffers,
  expandTasks,
  getBootstrap,
};
