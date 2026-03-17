const fs = require("fs");
const path = require("path");
const { readDb } = require("../data/store");
const { ROOT } = require("../lib/config");

const OUTPUT_PATH = path.join(ROOT, "backend", "data", "seed.postgres.sql");

function escapeString(value) {
  return String(value ?? "").replace(/'/g, "''");
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  return `'${escapeString(value)}'`;
}

function insert(table, columns, rows) {
  if (!rows.length) return "";
  const values = rows
    .map((row) => `(${columns.map((column) => sqlValue(row[column])).join(", ")})`)
    .join(",\n");
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n${values};\n`;
}

function buildSql() {
  const db = readDb();
  const chunks = [];

  chunks.push("-- Generated from backend/data/db.json");
  chunks.push("BEGIN;");

  chunks.push(insert("teams", ["id", "name", "lead_id", "lead_percent", "company_percent", "chat_activity"], db.teams.map((team) => ({
    id: team.id,
    name: team.name,
    lead_id: team.leadId,
    lead_percent: team.leadPercent,
    company_percent: team.companyPercent,
    chat_activity: team.chatActivity,
  }))));

  chunks.push(insert("team_members", ["team_id", "user_id"], db.teams.flatMap((team) =>
    (team.memberIds || []).map((userId) => ({
      team_id: team.id,
      user_id: userId,
    })),
  )));

  chunks.push(insert("users", [
    "id",
    "name",
    "email",
    "password_hash",
    "password_salt",
    "password_updated_at",
    "role",
    "team_id",
    "subscription",
    "theme",
    "referral_code",
    "referral_income_percent",
    "payout_boost",
    "locale",
  ], db.users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    password_hash: user.passwordHash,
    password_salt: user.passwordSalt,
    password_updated_at: user.passwordUpdatedAt,
    role: user.role,
    team_id: user.teamId,
    subscription: user.subscription,
    theme: user.theme,
    referral_code: user.referralCode,
    referral_income_percent: user.referralIncomePercent,
    payout_boost: user.payoutBoost,
    locale: user.locale,
  }))));

  chunks.push(insert("offers", ["id", "title", "reward", "admin_id", "openings", "priority", "created_at"], db.offers.map((offer) => ({
    id: offer.id,
    title: offer.title,
    reward: offer.reward,
    admin_id: offer.adminId,
    openings: offer.openings,
    priority: offer.priority,
    created_at: offer.createdAt,
  }))));

  chunks.push(insert("offer_assignments", ["offer_id", "user_id"], db.offers.flatMap((offer) => offer.assignedScoutIds.map((userId) => ({
    offer_id: offer.id,
    user_id: userId,
  })))));

  chunks.push(insert("candidates", [
    "id",
    "name",
    "offer_id",
    "scout_id",
    "team_id",
    "status",
    "location",
    "interview_passed",
    "registration_passed",
    "shifts_completed",
    "notes",
    "created_at",
  ], db.candidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    offer_id: candidate.offerId,
    scout_id: candidate.scoutId,
    team_id: candidate.teamId,
    status: candidate.status,
    location: candidate.location,
    interview_passed: candidate.interviewPassed,
    registration_passed: candidate.registrationPassed,
    shifts_completed: candidate.shiftsCompleted,
    notes: candidate.notes,
    created_at: candidate.createdAt,
  }))));

  chunks.push(insert("tasks", [
    "id",
    "title",
    "by_user_id",
    "assignee_user_id",
    "team_id",
    "deadline",
    "priority",
    "done",
    "created_at",
  ], db.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    by_user_id: task.byUserId,
    assignee_user_id: task.assigneeUserId,
    team_id: task.teamId,
    deadline: task.deadline,
    priority: task.priority,
    done: task.done,
    created_at: task.createdAt,
  }))));

  chunks.push(insert("trainings", ["id", "title", "role", "mandatory", "assigned_by_user_id", "created_at"], db.trainings.map((training) => ({
    id: training.id,
    title: training.title,
    role: training.role,
    mandatory: training.mandatory,
    assigned_by_user_id: training.assignedByUserId,
    created_at: training.createdAt,
  }))));

  chunks.push(insert("training_assignments", ["training_id", "user_id", "completed_at"], db.trainings.flatMap((training) =>
    training.assignedUserIds.map((userId) => ({
      training_id: training.id,
      user_id: userId,
      completed_at: training.completedUserIds.includes(userId) ? training.createdAt : null,
    })),
  )));

  chunks.push(insert("posts", ["id", "type", "author_id", "author_name", "title", "body", "created_at"], db.posts.map((post) => ({
    id: post.id,
    type: post.type,
    author_id: post.authorId,
    author_name: post.authorName,
    title: post.title,
    body: post.body,
    created_at: post.createdAt,
  }))));

  chunks.push(insert("chats", ["id", "name", "team_id", "is_global"], db.chats.map((chat) => ({
    id: chat.id,
    name: chat.name,
    team_id: chat.teamId,
    is_global: chat.global,
  }))));

  chunks.push(insert("chat_participants", ["chat_id", "user_id"], db.chats.flatMap((chat) =>
    (chat.participantIds || []).map((userId) => ({
      chat_id: chat.id,
      user_id: userId,
    })),
  )));

  chunks.push(insert("chat_messages", ["id", "chat_id", "author_id", "author_name", "body", "sent_at"], db.chats.flatMap((chat) =>
    chat.messages.map((message, index) => ({
      id: message.id || `${chat.id}-msg-${index + 1}`,
      chat_id: chat.id,
      author_id: message.authorId,
      author_name: message.authorName,
      body: message.text,
      sent_at: message.sentAt || db.company?.generatedAt || new Date().toISOString(),
    })),
  )));

  chunks.push(insert("public_applications", ["id", "name", "contact", "experience", "languages", "motivation", "status", "created_at"], db.publicApplications.map((application) => ({
    id: application.id,
    name: application.name,
    contact: application.contact,
    experience: application.experience,
    languages: application.languages,
    motivation: application.motivation,
    status: application.status,
    created_at: application.createdAt,
  }))));

  chunks.push(insert("notifications", ["id", "text", "created_at"], db.notifications.map((notification) => ({
    id: notification.id,
    text: notification.text,
    created_at: notification.createdAt,
  }))));

  chunks.push(insert("notification_users", ["notification_id", "user_id", "read_at"], db.notifications.flatMap((notification) =>
    (notification.userIds || []).map((userId) => ({
      notification_id: notification.id,
      user_id: userId,
      read_at: (notification.readBy || []).includes(userId) ? notification.createdAt : null,
    })),
  )));

  chunks.push(insert("audit_log", ["id", "actor_id", "action", "entity_type", "entity_id", "details", "created_at"], db.auditLog.map((entry) => ({
    id: entry.id,
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    details: JSON.stringify(entry.details || {}).replace(/'/g, "''"),
    created_at: entry.createdAt,
  }))).replace(/'(\{.*\})'/g, "'$1'::jsonb"));

  chunks.push(insert("sessions", ["id", "user_id", "token", "created_at"], (db.sessions || []).map((session) => ({
    id: session.id,
    user_id: session.userId,
    token: session.token,
    created_at: session.createdAt,
  }))));

  chunks.push("COMMIT;");
  return chunks.filter(Boolean).join("\n");
}

fs.writeFileSync(OUTPUT_PATH, `${buildSql()}\n`);
console.log(`Seed SQL exported to ${OUTPUT_PATH}`);
