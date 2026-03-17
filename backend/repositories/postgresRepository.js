const { getPool } = require("../lib/postgres");
const { normalizeDb, safeUser } = require("../lib/auth");
const { ROLE_LABELS, PERMISSION_LABELS } = require("../lib/config");
const { isKpiQualified } = require("../lib/domain");

function mapRowsById(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

function textOrNull(value) {
  return value === undefined ? null : value;
}

function createPostgresRepository() {
  const pool = getPool();
  let payoutsTableReady = false;
  let socialSchemaReady = false;
  let candidateDocsReady = false;
  let candidateCommentsReady = false;

  async function ensurePayoutsTable() {
    if (payoutsTableReady) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payouts (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        scout_id TEXT REFERENCES users(id),
        team_id TEXT REFERENCES teams(id),
        offer_id TEXT REFERENCES offers(id),
        base_amount INTEGER NOT NULL DEFAULT 0,
        boost_percent INTEGER NOT NULL DEFAULT 0,
        boost_amount INTEGER NOT NULL DEFAULT 0,
        final_amount INTEGER NOT NULL DEFAULT 0,
        referral_percent INTEGER NOT NULL DEFAULT 0,
        referral_amount INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL,
        approved_at TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE (candidate_id)
      )
    `);
    payoutsTableReady = true;
  }

  async function ensureSocialSchema() {
    if (socialSchemaReady) return;
    await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general'");
    await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions_override JSONB NOT NULL DEFAULT '{}'::jsonb");
    await pool.query("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interview_at TIMESTAMPTZ");
    await pool.query("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interview_format TEXT");
    await pool.query("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interviewer_name TEXT");
    await pool.query("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interview_status TEXT NOT NULL DEFAULT 'unscheduled'");
    await pool.query("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interview_notes TEXT NOT NULL DEFAULT ''");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS post_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        author_id TEXT REFERENCES users(id),
        author_name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `);
    socialSchemaReady = true;
  }

  async function ensureCandidateDocsSchema() {
    if (candidateDocsReady) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidate_documents (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'link',
        url TEXT,
        note TEXT NOT NULL DEFAULT '',
        uploaded_by_user_id TEXT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL
      )
    `);
    candidateDocsReady = true;
  }

  async function ensureCandidateCommentsSchema() {
    if (candidateCommentsReady) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidate_comments (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        author_id TEXT REFERENCES users(id),
        author_name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `);
    candidateCommentsReady = true;
  }

  async function queryOne(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows[0] || null;
  }

  async function queryMany(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows;
  }

  async function queryAll(client) {
    const [
      teamsRes,
      teamMembersRes,
      usersRes,
      offersRes,
      offerAssignmentsRes,
      candidatesRes,
      candidateDocumentsRes,
      candidateCommentsRes,
      tasksRes,
      trainingsRes,
      trainingAssignmentsRes,
      postsRes,
      postCommentsRes,
      chatsRes,
      chatParticipantsRes,
      chatMessagesRes,
      publicApplicationsRes,
      notificationsRes,
      notificationUsersRes,
      auditLogRes,
      sessionsRes,
      payoutsRes,
    ] = await Promise.all([
      client.query("SELECT * FROM teams"),
      client.query("SELECT * FROM team_members"),
      client.query("SELECT * FROM users"),
      client.query("SELECT * FROM offers"),
      client.query("SELECT * FROM offer_assignments"),
      client.query("SELECT * FROM candidates"),
      (async () => {
        await ensureCandidateDocsSchema();
        return client.query("SELECT * FROM candidate_documents ORDER BY created_at DESC");
      })(),
      (async () => {
        await ensureCandidateCommentsSchema();
        return client.query("SELECT * FROM candidate_comments ORDER BY created_at ASC");
      })(),
      client.query("SELECT * FROM tasks"),
      client.query("SELECT * FROM trainings"),
      client.query("SELECT * FROM training_assignments"),
      (async () => {
        await ensureSocialSchema();
        return client.query("SELECT * FROM posts");
      })(),
      (async () => {
        await ensureSocialSchema();
        return client.query("SELECT * FROM post_comments ORDER BY created_at ASC");
      })(),
      client.query("SELECT * FROM chats"),
      client.query("SELECT * FROM chat_participants"),
      client.query("SELECT * FROM chat_messages ORDER BY sent_at ASC"),
      client.query("SELECT * FROM public_applications"),
      client.query("SELECT * FROM notifications"),
      client.query("SELECT * FROM notification_users"),
      client.query("SELECT * FROM audit_log ORDER BY created_at DESC"),
      client.query("SELECT * FROM sessions"),
      (async () => {
        await ensurePayoutsTable();
        return client.query("SELECT * FROM payouts ORDER BY created_at DESC");
      })(),
    ]);

    const membersByTeam = new Map();
    teamMembersRes.rows.forEach((row) => {
      if (!membersByTeam.has(row.team_id)) membersByTeam.set(row.team_id, []);
      membersByTeam.get(row.team_id).push(row.user_id);
    });

    const assignmentsByOffer = new Map();
    offerAssignmentsRes.rows.forEach((row) => {
      if (!assignmentsByOffer.has(row.offer_id)) assignmentsByOffer.set(row.offer_id, []);
      assignmentsByOffer.get(row.offer_id).push(row.user_id);
    });

    const assignmentsByTraining = new Map();
    const completedByTraining = new Map();
    trainingAssignmentsRes.rows.forEach((row) => {
      if (!assignmentsByTraining.has(row.training_id)) assignmentsByTraining.set(row.training_id, []);
      assignmentsByTraining.get(row.training_id).push(row.user_id);
      if (row.completed_at) {
        if (!completedByTraining.has(row.training_id)) completedByTraining.set(row.training_id, []);
        completedByTraining.get(row.training_id).push(row.user_id);
      }
    });

    const documentsByCandidate = new Map();
    candidateDocumentsRes.rows.forEach((row) => {
      if (!documentsByCandidate.has(row.candidate_id)) documentsByCandidate.set(row.candidate_id, []);
      documentsByCandidate.get(row.candidate_id).push({
        id: row.id,
        candidateId: row.candidate_id,
        title: row.title,
        type: row.type,
        url: row.url,
        note: row.note,
        uploadedByUserId: row.uploaded_by_user_id,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      });
    });
    const commentsByCandidate = new Map();
    candidateCommentsRes.rows.forEach((row) => {
      if (!commentsByCandidate.has(row.candidate_id)) commentsByCandidate.set(row.candidate_id, []);
      commentsByCandidate.get(row.candidate_id).push({
        id: row.id,
        candidateId: row.candidate_id,
        authorId: row.author_id,
        authorName: row.author_name,
        body: row.body,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      });
    });

    const participantsByChat = new Map();
    chatParticipantsRes.rows.forEach((row) => {
      if (!participantsByChat.has(row.chat_id)) participantsByChat.set(row.chat_id, []);
      participantsByChat.get(row.chat_id).push(row.user_id);
    });

    const messagesByChat = new Map();
    chatMessagesRes.rows.forEach((row) => {
      if (!messagesByChat.has(row.chat_id)) messagesByChat.set(row.chat_id, []);
      messagesByChat.get(row.chat_id).push({
        id: row.id,
        authorId: row.author_id,
        authorName: row.author_name,
        text: row.body,
        time: new Date(row.sent_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        sentAt: row.sent_at.toISOString ? row.sent_at.toISOString() : row.sent_at,
      });
    });

    const commentsByPost = new Map();
    postCommentsRes.rows.forEach((row) => {
      if (!commentsByPost.has(row.post_id)) commentsByPost.set(row.post_id, []);
      commentsByPost.get(row.post_id).push({
        id: row.id,
        postId: row.post_id,
        authorId: row.author_id,
        authorName: row.author_name,
        body: row.body,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      });
    });

    const notificationUsers = new Map();
    const notificationReads = new Map();
    notificationUsersRes.rows.forEach((row) => {
      if (!notificationUsers.has(row.notification_id)) notificationUsers.set(row.notification_id, []);
      notificationUsers.get(row.notification_id).push(row.user_id);
      if (row.read_at) {
        if (!notificationReads.has(row.notification_id)) notificationReads.set(row.notification_id, []);
        notificationReads.get(row.notification_id).push(row.user_id);
      }
    });

    const db = {
      company: { name: "ScoutFlow HQ", locale: "ru-RU" },
      teams: teamsRes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        leadId: row.lead_id,
        memberIds: membersByTeam.get(row.id) || [],
        leadPercent: row.lead_percent,
        companyPercent: row.company_percent,
        chatActivity: row.chat_activity,
      })),
      users: usersRes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        passwordHash: row.password_hash,
        passwordSalt: row.password_salt,
        passwordUpdatedAt: row.password_updated_at?.toISOString?.() || row.password_updated_at,
        role: row.role,
        teamId: row.team_id,
        subscription: row.subscription,
        theme: row.theme,
        referralCode: row.referral_code,
        referralIncomePercent: row.referral_income_percent,
        payoutBoost: row.payout_boost,
        locale: row.locale,
        permissionsOverride: row.permissions_override || {},
      })),
      offers: offersRes.rows.map((row) => ({
        id: row.id,
        title: row.title,
        reward: row.reward,
        assignedScoutIds: assignmentsByOffer.get(row.id) || [],
        adminId: row.admin_id,
        openings: row.openings,
        priority: row.priority,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      })),
      candidates: candidatesRes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        offerId: row.offer_id,
        scoutId: row.scout_id,
        teamId: row.team_id,
        status: row.status,
        location: row.location,
        interviewAt: row.interview_at?.toISOString?.() || row.interview_at,
        interviewFormat: row.interview_format || "video",
        interviewerName: row.interviewer_name || "",
        interviewStatus: row.interview_status || (row.interview_passed ? "completed" : row.interview_at ? "scheduled" : "unscheduled"),
        interviewNotes: row.interview_notes || "",
        interviewPassed: row.interview_passed,
        registrationPassed: row.registration_passed,
        shiftsCompleted: row.shifts_completed,
        documents: documentsByCandidate.get(row.id) || [],
        comments: commentsByCandidate.get(row.id) || [],
        notes: row.notes,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      })),
      tasks: tasksRes.rows.map((row) => ({
        id: row.id,
        title: row.title,
        byUserId: row.by_user_id,
        assigneeUserId: row.assignee_user_id,
        teamId: row.team_id,
        deadline: row.deadline?.toISOString?.().slice(0, 10) || row.deadline,
        priority: row.priority,
        done: row.done,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      })),
      trainings: trainingsRes.rows.map((row) => ({
        id: row.id,
        title: row.title,
        role: row.role,
        mandatory: row.mandatory,
        assignedByUserId: row.assigned_by_user_id,
        assignedUserIds: assignmentsByTraining.get(row.id) || [],
        completedUserIds: completedByTraining.get(row.id) || [],
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      })),
      posts: postsRes.rows.map((row) => ({
        id: row.id,
        type: row.type,
        category: row.category || "general",
        pinned: !!row.pinned,
        authorId: row.author_id,
        authorName: row.author_name,
        title: row.title,
        body: row.body,
        comments: commentsByPost.get(row.id) || [],
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      })),
      chats: chatsRes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        teamId: row.team_id,
        global: row.is_global,
        participantIds: participantsByChat.get(row.id) || [],
        messages: messagesByChat.get(row.id) || [],
      })),
      publicApplications: publicApplicationsRes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        contact: row.contact,
        experience: row.experience,
        languages: row.languages,
        motivation: row.motivation,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
        status: row.status,
      })),
      notifications: notificationsRes.rows.map((row) => ({
        id: row.id,
        text: row.text,
        userIds: notificationUsers.get(row.id) || [],
        createdAt: row.created_at?.toISOString?.() || row.created_at,
        readBy: notificationReads.get(row.id) || [],
      })),
      auditLog: auditLogRes.rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        details: row.details || {},
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      })),
      sessions: sessionsRes.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        token: row.token,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      })),
      payouts: payoutsRes.rows.map((row) => ({
        id: row.id,
        candidateId: row.candidate_id,
        scoutId: row.scout_id,
        teamId: row.team_id,
        offerId: row.offer_id,
        baseAmount: row.base_amount,
        boostPercent: row.boost_percent,
        boostAmount: row.boost_amount,
        finalAmount: row.final_amount,
        referralPercent: row.referral_percent,
        referralAmount: row.referral_amount,
        status: row.status,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
        approvedAt: row.approved_at?.toISOString?.() || row.approved_at,
        paidAt: row.paid_at?.toISOString?.() || row.paid_at,
        updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
      })),
    };

    normalizeDb(db);
    return db;
  }

  async function queryBootstrapData(client, user) {
    const [
      usersRes,
      teamsRes,
      teamMembersRes,
      offersRes,
      offerAssignmentsRes,
      postsRes,
      postCommentsRes,
      trainingsRes,
      trainingAssignmentsRes,
      candidateDocumentsRes,
      candidateCommentsRes,
      notificationsRes,
      notificationUsersRes,
      auditLogRes,
      chatsRes,
      chatParticipantsRes,
      chatMessagesRes,
      publicApplicationsRes,
      payoutsRes,
    ] = await Promise.all([
      client.query("SELECT * FROM users"),
      client.query("SELECT * FROM teams"),
      client.query("SELECT * FROM team_members"),
      client.query("SELECT * FROM offers"),
      client.query("SELECT * FROM offer_assignments"),
      (async () => {
        await ensureSocialSchema();
        return client.query("SELECT * FROM posts ORDER BY pinned DESC, created_at DESC");
      })(),
      (async () => {
        await ensureSocialSchema();
        return client.query("SELECT * FROM post_comments ORDER BY created_at ASC");
      })(),
      client.query("SELECT * FROM trainings"),
      client.query("SELECT * FROM training_assignments"),
      (async () => {
        await ensureCandidateDocsSchema();
        return client.query("SELECT * FROM candidate_documents ORDER BY created_at DESC");
      })(),
      (async () => {
        await ensureCandidateCommentsSchema();
        return client.query("SELECT * FROM candidate_comments ORDER BY created_at ASC");
      })(),
      client.query(
        `SELECT n.* FROM notifications n
         LEFT JOIN notification_users nu ON nu.notification_id = n.id
         WHERE $1 = 'owner' OR nu.user_id = $2
         GROUP BY n.id
         ORDER BY n.created_at DESC
         LIMIT 12`,
        [user.role, user.id],
      ),
      client.query("SELECT * FROM notification_users"),
      client.query("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 10"),
      client.query(
        `SELECT * FROM chats
         WHERE $1 = 'owner'
           OR is_global = TRUE
           OR team_id = $2
           OR id IN (SELECT chat_id FROM chat_participants WHERE user_id = $3)`,
        [user.role, user.teamId, user.id],
      ),
      client.query("SELECT * FROM chat_participants"),
      client.query("SELECT * FROM chat_messages ORDER BY sent_at ASC"),
      user.role === "owner"
        ? client.query("SELECT * FROM public_applications ORDER BY created_at DESC")
        : Promise.resolve({ rows: [] }),
      (async () => {
        await ensurePayoutsTable();
        return client.query(
          user.role === "owner"
            ? "SELECT * FROM payouts ORDER BY created_at DESC"
            : user.role === "lead"
              ? "SELECT * FROM payouts WHERE team_id = $1 ORDER BY created_at DESC"
              : "SELECT * FROM payouts WHERE scout_id = $1 ORDER BY created_at DESC",
          user.role === "owner" ? [] : [user.role === "lead" ? user.teamId : user.id],
        );
      })(),
    ]);

    const visibleCandidatesRes = await client.query(
      user.role === "owner"
        ? "SELECT * FROM candidates"
        : user.role === "lead"
          ? "SELECT * FROM candidates WHERE team_id = $1"
          : "SELECT * FROM candidates WHERE scout_id = $1",
      user.role === "owner" ? [] : [user.role === "lead" ? user.teamId : user.id],
    );

    const visibleTasksRes = await client.query(
      user.role === "owner"
        ? "SELECT * FROM tasks"
        : user.role === "lead"
          ? "SELECT * FROM tasks WHERE team_id = $1 OR assignee_user_id = $2"
          : "SELECT * FROM tasks WHERE assignee_user_id = $1 OR team_id = $2",
      user.role === "owner" ? [] : user.role === "lead" ? [user.teamId, user.id] : [user.id, user.teamId],
    );

    const visibleOffersRes = await client.query(
      user.role === "owner"
        ? "SELECT * FROM offers"
        : user.role === "lead"
          ? `SELECT DISTINCT o.* FROM offers o
             JOIN offer_assignments oa ON oa.offer_id = o.id
             JOIN users u ON u.id = oa.user_id
             WHERE u.team_id = $1`
          : `SELECT o.* FROM offers o
             JOIN offer_assignments oa ON oa.offer_id = o.id
             WHERE oa.user_id = $1`,
      user.role === "owner" ? [] : [user.role === "lead" ? user.teamId : user.id],
    );

    const allCandidatesForAggregatesRes = await client.query("SELECT * FROM candidates");

    const membersByTeam = new Map();
    teamMembersRes.rows.forEach((row) => {
      if (!membersByTeam.has(row.team_id)) membersByTeam.set(row.team_id, []);
      membersByTeam.get(row.team_id).push(row.user_id);
    });

    const assignmentsByOffer = new Map();
    offerAssignmentsRes.rows.forEach((row) => {
      if (!assignmentsByOffer.has(row.offer_id)) assignmentsByOffer.set(row.offer_id, []);
      assignmentsByOffer.get(row.offer_id).push(row.user_id);
    });

    const assignmentsByTraining = new Map();
    const completedByTraining = new Map();
    trainingAssignmentsRes.rows.forEach((row) => {
      if (!assignmentsByTraining.has(row.training_id)) assignmentsByTraining.set(row.training_id, []);
      assignmentsByTraining.get(row.training_id).push(row.user_id);
      if (row.completed_at) {
        if (!completedByTraining.has(row.training_id)) completedByTraining.set(row.training_id, []);
        completedByTraining.get(row.training_id).push(row.user_id);
      }
    });

    const commentsByPost = new Map();
    postCommentsRes.rows.forEach((row) => {
      if (!commentsByPost.has(row.post_id)) commentsByPost.set(row.post_id, []);
      commentsByPost.get(row.post_id).push({
        id: row.id,
        postId: row.post_id,
        authorId: row.author_id,
        authorName: row.author_name,
        body: row.body,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      });
    });

    const documentsByCandidate = new Map();
    candidateDocumentsRes.rows.forEach((row) => {
      if (!documentsByCandidate.has(row.candidate_id)) documentsByCandidate.set(row.candidate_id, []);
      documentsByCandidate.get(row.candidate_id).push({
        id: row.id,
        candidateId: row.candidate_id,
        title: row.title,
        type: row.type,
        url: row.url,
        note: row.note,
        uploadedByUserId: row.uploaded_by_user_id,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      });
    });

    const participantsByChat = new Map();
    chatParticipantsRes.rows.forEach((row) => {
      if (!participantsByChat.has(row.chat_id)) participantsByChat.set(row.chat_id, []);
      participantsByChat.get(row.chat_id).push(row.user_id);
    });

    const messagesByChat = new Map();
    chatMessagesRes.rows.forEach((row) => {
      if (!messagesByChat.has(row.chat_id)) messagesByChat.set(row.chat_id, []);
      messagesByChat.get(row.chat_id).push({
        id: row.id,
        authorId: row.author_id,
        authorName: row.author_name,
        text: row.body,
        time: new Date(row.sent_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        sentAt: row.sent_at?.toISOString?.() || row.sent_at,
      });
    });

    const notificationUsers = new Map();
    const notificationReads = new Map();
    notificationUsersRes.rows.forEach((row) => {
      if (!notificationUsers.has(row.notification_id)) notificationUsers.set(row.notification_id, []);
      notificationUsers.get(row.notification_id).push(row.user_id);
      if (row.read_at) {
        if (!notificationReads.has(row.notification_id)) notificationReads.set(row.notification_id, []);
        notificationReads.get(row.notification_id).push(row.user_id);
      }
    });

    const users = usersRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt,
      passwordUpdatedAt: row.password_updated_at?.toISOString?.() || row.password_updated_at,
      role: row.role,
      teamId: row.team_id,
      subscription: row.subscription,
      theme: row.theme,
      referralCode: row.referral_code,
      referralIncomePercent: row.referral_income_percent,
      payoutBoost: row.payout_boost,
      locale: row.locale,
      permissionsOverride: row.permissions_override || {},
    }));

    const teams = teamsRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      leadId: row.lead_id,
      memberIds: membersByTeam.get(row.id) || [],
      leadPercent: row.lead_percent,
      companyPercent: row.company_percent,
      chatActivity: row.chat_activity,
    }));

    const allOffers = offersRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      reward: row.reward,
      assignedScoutIds: assignmentsByOffer.get(row.id) || [],
      adminId: row.admin_id,
      openings: row.openings,
      priority: row.priority,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
    }));

    const visibleOfferIds = new Set(visibleOffersRes.rows.map((row) => row.id));
    const offers = allOffers.filter((offer) => visibleOfferIds.has(offer.id));

    const allCandidates = allCandidatesForAggregatesRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      offerId: row.offer_id,
      scoutId: row.scout_id,
      teamId: row.team_id,
      status: row.status,
      location: row.location,
      interviewAt: row.interview_at?.toISOString?.() || row.interview_at,
      interviewFormat: row.interview_format || "video",
      interviewerName: row.interviewer_name || "",
      interviewStatus: row.interview_status || (row.interview_passed ? "completed" : row.interview_at ? "scheduled" : "unscheduled"),
      interviewNotes: row.interview_notes || "",
      interviewPassed: row.interview_passed,
      registrationPassed: row.registration_passed,
      shiftsCompleted: row.shifts_completed,
      documents: documentsByCandidate.get(row.id) || [],
      comments: commentsByCandidate.get(row.id) || [],
      notes: row.notes,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
    }));

    const candidates = visibleCandidatesRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      offerId: row.offer_id,
      scoutId: row.scout_id,
      teamId: row.team_id,
      status: row.status,
      location: row.location,
      interviewAt: row.interview_at?.toISOString?.() || row.interview_at,
      interviewFormat: row.interview_format || "video",
      interviewerName: row.interviewer_name || "",
      interviewStatus: row.interview_status || (row.interview_passed ? "completed" : row.interview_at ? "scheduled" : "unscheduled"),
      interviewNotes: row.interview_notes || "",
      interviewPassed: row.interview_passed,
      registrationPassed: row.registration_passed,
      shiftsCompleted: row.shifts_completed,
      documents: documentsByCandidate.get(row.id) || [],
      comments: commentsByCandidate.get(row.id) || [],
      notes: row.notes,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
    }));

    const tasks = visibleTasksRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      byUserId: row.by_user_id,
      assigneeUserId: row.assignee_user_id,
      teamId: row.team_id,
      deadline: row.deadline?.toISOString?.().slice(0, 10) || row.deadline,
      priority: row.priority,
      done: row.done,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
    }));

    const trainings = trainingsRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      role: row.role,
      mandatory: row.mandatory,
      assignedByUserId: row.assigned_by_user_id,
      assignedUserIds: assignmentsByTraining.get(row.id) || [],
      completedUserIds: completedByTraining.get(row.id) || [],
      createdAt: row.created_at?.toISOString?.() || row.created_at,
    }));

    const chats = chatsRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      teamId: row.team_id,
      global: row.is_global,
      participantIds: participantsByChat.get(row.id) || [],
      messages: messagesByChat.get(row.id) || [],
    }));

    const notifications = notificationsRes.rows.map((row) => ({
      id: row.id,
      text: row.text,
      userIds: notificationUsers.get(row.id) || [],
      createdAt: row.created_at?.toISOString?.() || row.created_at,
      readBy: notificationReads.get(row.id) || [],
    }));

    const payouts = payoutsRes.rows.map((row) => ({
      id: row.id,
      candidateId: row.candidate_id,
      scoutId: row.scout_id,
      teamId: row.team_id,
      offerId: row.offer_id,
      baseAmount: row.base_amount,
      boostPercent: row.boost_percent,
      boostAmount: row.boost_amount,
      finalAmount: row.final_amount,
      referralPercent: row.referral_percent,
      referralAmount: row.referral_amount,
      status: row.status,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
      approvedAt: row.approved_at?.toISOString?.() || row.approved_at,
      paidAt: row.paid_at?.toISOString?.() || row.paid_at,
      updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
    }));

    const auditLog = auditLogRes.rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: row.details || {},
      createdAt: row.created_at?.toISOString?.() || row.created_at,
    }));

    const publicApplications = publicApplicationsRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      contact: row.contact,
      experience: row.experience,
      languages: row.languages,
      motivation: row.motivation,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
      status: row.status,
    }));

    const posts = postsRes.rows.map((row) => ({
      id: row.id,
      type: row.type,
      category: row.category || "general",
      pinned: !!row.pinned,
      authorId: row.author_id,
      authorName: row.author_name,
      title: row.title,
      body: row.body,
      comments: commentsByPost.get(row.id) || [],
      createdAt: row.created_at?.toISOString?.() || row.created_at,
    }));

    const visibleTeams = user.role === "owner" ? teams : teams.filter((team) => team.id === user.teamId);
    const scoreboard = users
      .filter((person) => ["lead", "scout", "referral"].includes(person.role))
      .map((person) => {
        const personCandidates = allCandidates.filter((candidate) => candidate.scoutId === person.id);
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

    const teamsExpanded = visibleTeams.map((team) => {
      const teamCandidates = allCandidates.filter((candidate) => candidate.teamId === team.id);
      const qualified = teamCandidates.filter(isKpiQualified).length;
      return {
        ...team,
        kpiPercent: teamCandidates.length ? Math.round((qualified / teamCandidates.length) * 100) : 0,
        membersExpanded: (team.memberIds || [])
          .map((memberId) => users.find((item) => item.id === memberId))
          .filter(Boolean)
          .map(safeUser),
        leadUser: safeUser(users.find((item) => item.id === team.leadId)),
      };
    });

    const expandedCandidates = candidates.map((candidate) => ({
      ...candidate,
      offer: allOffers.find((offer) => offer.id === candidate.offerId) || null,
      scout: safeUser(users.find((item) => item.id === candidate.scoutId)),
      team: teams.find((team) => team.id === candidate.teamId) || null,
      kpiQualified: isKpiQualified(candidate),
    }));

    const expandedOffers = offers.map((offer) => ({
      ...offer,
      admin: safeUser(users.find((item) => item.id === offer.adminId)),
      assignedScouts: (offer.assignedScoutIds || [])
        .map((id) => users.find((item) => item.id === id))
        .filter(Boolean)
        .map(safeUser),
    }));

    const expandedTasks = tasks.map((task) => ({
      ...task,
      assigneeUser: task.assigneeUserId ? safeUser(users.find((item) => item.id === task.assigneeUserId)) : null,
      team: task.teamId ? teams.find((team) => team.id === task.teamId) || null : null,
    }));

    const expandedTrainings = trainings.map((training) => ({
      ...training,
      completed: (training.completedUserIds || []).includes(user.id),
      assignedUsers: (training.assignedUserIds || [])
        .map((id) => users.find((item) => item.id === id))
        .filter(Boolean)
        .map(safeUser),
    }));

    const userView = safeUser(user);

    return {
      user: userView,
      metadata: {
        roles: ROLE_LABELS,
        permissionLabels: PERMISSION_LABELS,
        permissions: userView.permissions,
        companyName: "ScoutFlow HQ",
        locale: "ru-RU",
        referenceData: {
          teams: teams.map((team) => ({ id: team.id, name: team.name })),
          offers: allOffers.map((offer) => ({ id: offer.id, title: offer.title })),
          users: users.map((item) => safeUser(item)),
        },
      },
      summary: {
        candidates: expandedCandidates.length,
        kpiQualified: expandedCandidates.filter((candidate) => candidate.kpiQualified).length,
        offers: expandedOffers.length,
        trainingPending: expandedTrainings.filter((training) => training.role === user.role && training.mandatory && !training.completed).length,
        applications: publicApplications.length,
      },
      candidates: expandedCandidates,
      offers: expandedOffers,
      teams: teamsExpanded,
      tasks: expandedTasks,
      trainings: expandedTrainings,
      chats,
      posts,
      publicApplications,
      notifications,
      payouts,
      scoreboard,
      auditLog,
      users: user.role === "owner" ? users.map((item) => safeUser(item)) : [],
    };
  }

  async function replaceAll(client, db) {
    const orderedDeletes = [
      "sessions",
      "payouts",
      "post_comments",
      "candidate_documents",
      "notification_users",
      "notifications",
      "chat_participants",
      "chat_messages",
      "chats",
      "training_assignments",
      "trainings",
      "tasks",
      "offer_assignments",
      "candidates",
      "offers",
      "team_members",
      "audit_log",
      "public_applications",
      "users",
      "teams",
    ];
    for (const table of orderedDeletes) {
      await client.query(`DELETE FROM ${table}`);
    }

    for (const team of db.teams) {
      await client.query(
        "INSERT INTO teams (id, name, lead_id, lead_percent, company_percent, chat_activity) VALUES ($1,$2,$3,$4,$5,$6)",
        [team.id, team.name, textOrNull(team.leadId), team.leadPercent, team.companyPercent, team.chatActivity],
      );
      for (const memberId of team.memberIds || []) {
        await client.query("INSERT INTO team_members (team_id, user_id) VALUES ($1,$2)", [team.id, memberId]);
      }
    }

    for (const user of db.users) {
      await client.query(
        `INSERT INTO users
        (id, name, email, password_hash, password_salt, password_updated_at, role, team_id, subscription, theme, referral_code, referral_income_percent, payout_boost, locale, permissions_override)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
        [
          user.id,
          user.name,
          user.email,
          user.passwordHash,
          user.passwordSalt,
          textOrNull(user.passwordUpdatedAt),
          user.role,
          textOrNull(user.teamId),
          user.subscription,
          user.theme,
          user.referralCode,
          user.referralIncomePercent,
          user.payoutBoost,
          user.locale,
          JSON.stringify(user.permissionsOverride || {}),
        ],
      );
    }

    for (const offer of db.offers) {
      await client.query(
        "INSERT INTO offers (id, title, reward, admin_id, openings, priority, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [offer.id, offer.title, offer.reward, textOrNull(offer.adminId), offer.openings, offer.priority, offer.createdAt],
      );
      for (const userId of offer.assignedScoutIds || []) {
        await client.query("INSERT INTO offer_assignments (offer_id, user_id) VALUES ($1,$2)", [offer.id, userId]);
      }
    }

    for (const candidate of db.candidates) {
      await client.query(
        `INSERT INTO candidates
        (id, name, offer_id, scout_id, team_id, status, location, interview_at, interview_format, interviewer_name, interview_status, interview_notes, interview_passed, registration_passed, shifts_completed, notes, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          candidate.id,
          candidate.name,
          textOrNull(candidate.offerId),
          textOrNull(candidate.scoutId),
          textOrNull(candidate.teamId),
          candidate.status,
          textOrNull(candidate.location),
          textOrNull(candidate.interviewAt),
          textOrNull(candidate.interviewFormat),
          textOrNull(candidate.interviewerName),
          candidate.interviewStatus || "unscheduled",
          candidate.interviewNotes || "",
          candidate.interviewPassed,
          candidate.registrationPassed,
          candidate.shiftsCompleted,
          candidate.notes,
          candidate.createdAt,
        ],
      );
      for (const document of candidate.documents || []) {
        await client.query(
          "INSERT INTO candidate_documents (id, candidate_id, title, type, url, note, uploaded_by_user_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [document.id, candidate.id, document.title, document.type, textOrNull(document.url), document.note || "", textOrNull(document.uploadedByUserId), document.createdAt],
        );
      }
      for (const comment of candidate.comments || []) {
        await client.query(
          "INSERT INTO candidate_comments (id, candidate_id, author_id, author_name, body, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
          [comment.id, candidate.id, textOrNull(comment.authorId), comment.authorName, comment.body, comment.createdAt],
        );
      }
    }

    await ensurePayoutsTable();
    for (const payout of db.payouts || []) {
      await client.query(
        `INSERT INTO payouts
        (id, candidate_id, scout_id, team_id, offer_id, base_amount, boost_percent, boost_amount, final_amount, referral_percent, referral_amount, status, created_at, approved_at, paid_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          payout.id,
          payout.candidateId,
          textOrNull(payout.scoutId),
          textOrNull(payout.teamId),
          textOrNull(payout.offerId),
          payout.baseAmount,
          payout.boostPercent,
          payout.boostAmount,
          payout.finalAmount,
          payout.referralPercent,
          payout.referralAmount,
          payout.status,
          payout.createdAt,
          textOrNull(payout.approvedAt),
          textOrNull(payout.paidAt),
          payout.updatedAt,
        ],
      );
    }

    for (const task of db.tasks) {
      await client.query(
        "INSERT INTO tasks (id, title, by_user_id, assignee_user_id, team_id, deadline, priority, done, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [task.id, task.title, textOrNull(task.byUserId), textOrNull(task.assigneeUserId), textOrNull(task.teamId), textOrNull(task.deadline), task.priority, task.done, task.createdAt],
      );
    }

    for (const training of db.trainings) {
      await client.query(
        "INSERT INTO trainings (id, title, role, mandatory, assigned_by_user_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [training.id, training.title, training.role, training.mandatory, textOrNull(training.assignedByUserId), training.createdAt],
      );
      for (const userId of training.assignedUserIds || []) {
        const completed = (training.completedUserIds || []).includes(userId) ? training.createdAt : null;
        await client.query(
          "INSERT INTO training_assignments (training_id, user_id, completed_at) VALUES ($1,$2,$3)",
          [training.id, userId, textOrNull(completed)],
        );
      }
    }

    for (const post of db.posts) {
      await client.query(
        "INSERT INTO posts (id, type, category, pinned, author_id, author_name, title, body, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [post.id, post.type, post.category || "general", !!post.pinned, textOrNull(post.authorId), post.authorName, post.title, post.body, post.createdAt],
      );
      for (const comment of post.comments || []) {
        await client.query(
          "INSERT INTO post_comments (id, post_id, author_id, author_name, body, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
          [comment.id, post.id, textOrNull(comment.authorId), comment.authorName, comment.body, comment.createdAt],
        );
      }
    }

    for (const chat of db.chats) {
      await client.query(
        "INSERT INTO chats (id, name, team_id, is_global) VALUES ($1,$2,$3,$4)",
        [chat.id, chat.name, textOrNull(chat.teamId), !!chat.global],
      );
      for (const userId of chat.participantIds || []) {
        await client.query("INSERT INTO chat_participants (chat_id, user_id) VALUES ($1,$2)", [chat.id, userId]);
      }
      for (const message of chat.messages || []) {
        await client.query(
          "INSERT INTO chat_messages (id, chat_id, author_id, author_name, body, sent_at) VALUES ($1,$2,$3,$4,$5,$6)",
          [message.id, chat.id, textOrNull(message.authorId), message.authorName, message.text, textOrNull(message.sentAt || new Date().toISOString())],
        );
      }
    }

    for (const application of db.publicApplications) {
      await client.query(
        "INSERT INTO public_applications (id, name, contact, experience, languages, motivation, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [application.id, application.name, application.contact, application.experience, application.languages, application.motivation, application.status, application.createdAt],
      );
    }

    for (const notification of db.notifications) {
      await client.query(
        "INSERT INTO notifications (id, text, created_at) VALUES ($1,$2,$3)",
        [notification.id, notification.text, notification.createdAt],
      );
      for (const userId of notification.userIds || []) {
        const readAt = (notification.readBy || []).includes(userId) ? notification.createdAt : null;
        await client.query(
          "INSERT INTO notification_users (notification_id, user_id, read_at) VALUES ($1,$2,$3)",
          [notification.id, userId, textOrNull(readAt)],
        );
      }
    }

    for (const entry of db.auditLog) {
      await client.query(
        "INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, created_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)",
        [entry.id, textOrNull(entry.actorId), entry.action, entry.entityType, entry.entityId, JSON.stringify(entry.details || {}), entry.createdAt],
      );
    }

    for (const session of db.sessions || []) {
      await client.query(
        "INSERT INTO sessions (id, user_id, token, created_at) VALUES ($1,$2,$3,$4)",
        [session.id, session.userId, session.token, session.createdAt],
      );
    }
  }

  return {
    provider: "postgres",

    async read() {
      const client = await pool.connect();
      try {
        return await queryAll(client);
      } finally {
        client.release();
      }
    },

    async write(db) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await replaceAll(client, db);
        await client.query("COMMIT");
        return db;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async transaction(mutator) {
      const db = await this.read();
      const result = await mutator(db);
      await this.write(db);
      return result;
    },

    async findUserByEmail(email) {
      const row = await queryOne("SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [email]);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        passwordHash: row.password_hash,
        passwordSalt: row.password_salt,
        passwordUpdatedAt: row.password_updated_at?.toISOString?.() || row.password_updated_at,
        role: row.role,
        teamId: row.team_id,
        subscription: row.subscription,
        theme: row.theme,
        referralCode: row.referral_code,
        referralIncomePercent: row.referral_income_percent,
        payoutBoost: row.payout_boost,
        locale: row.locale,
        permissionsOverride: row.permissions_override || {},
      };
    },

    async findUserByToken(token) {
      const row = await queryOne(
        `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = $1`,
        [token],
      );
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        passwordHash: row.password_hash,
        passwordSalt: row.password_salt,
        passwordUpdatedAt: row.password_updated_at?.toISOString?.() || row.password_updated_at,
        role: row.role,
        teamId: row.team_id,
        subscription: row.subscription,
        theme: row.theme,
        referralCode: row.referral_code,
        referralIncomePercent: row.referral_income_percent,
        payoutBoost: row.payout_boost,
        locale: row.locale,
        permissionsOverride: row.permissions_override || {},
      };
    },

    async syncPayouts(syncer) {
      await ensurePayoutsTable();
      const db = await this.read();
      await syncer(db);
      for (const payout of db.payouts || []) {
        await pool.query(
          `INSERT INTO payouts
          (id, candidate_id, scout_id, team_id, offer_id, base_amount, boost_percent, boost_amount, final_amount, referral_percent, referral_amount, status, created_at, approved_at, paid_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          ON CONFLICT (candidate_id) DO UPDATE SET
            scout_id = EXCLUDED.scout_id,
            team_id = EXCLUDED.team_id,
            offer_id = EXCLUDED.offer_id,
            base_amount = EXCLUDED.base_amount,
            boost_percent = EXCLUDED.boost_percent,
            boost_amount = EXCLUDED.boost_amount,
            final_amount = EXCLUDED.final_amount,
            referral_percent = EXCLUDED.referral_percent,
            referral_amount = EXCLUDED.referral_amount,
            updated_at = EXCLUDED.updated_at`,
          [
            payout.id,
            payout.candidateId,
            textOrNull(payout.scoutId),
            textOrNull(payout.teamId),
            textOrNull(payout.offerId),
            payout.baseAmount,
            payout.boostPercent,
            payout.boostAmount,
            payout.finalAmount,
            payout.referralPercent,
            payout.referralAmount,
            payout.status,
            payout.createdAt,
            textOrNull(payout.approvedAt),
            textOrNull(payout.paidAt),
            payout.updatedAt,
          ],
        );
      }
    },

    async getBootstrapData(user) {
      const client = await pool.connect();
      try {
        return await queryBootstrapData(client, user);
      } finally {
        client.release();
      }
    },

    async health() {
      const row = await queryOne("SELECT NOW() AS current_time");
      return {
        ok: true,
        provider: "postgres",
        currentTime: row?.current_time?.toISOString?.() || row?.current_time || null,
      };
    },

    async close() {
      await pool.end();
    },

    async replaceSession(session) {
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [session.userId]);
      await pool.query(
        "INSERT INTO sessions (id, user_id, token, created_at) VALUES ($1, $2, $3, $4)",
        [session.id, session.userId, session.token, session.createdAt],
      );
    },

    async deleteSessionByToken(token) {
      await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
    },

    async getUserIdsByRole(role) {
      const rows = await queryMany("SELECT id FROM users WHERE role = $1", [role]);
      return rows.map((row) => row.id);
    },

    async createAuditEntry(entry) {
      await pool.query(
        "INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, created_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)",
        [entry.id, textOrNull(entry.actorId), entry.action, entry.entityType, entry.entityId, JSON.stringify(entry.details || {}), entry.createdAt],
      );
    },

    async createNotificationEntry(notification) {
      await pool.query(
        "INSERT INTO notifications (id, text, created_at) VALUES ($1, $2, $3)",
        [notification.id, notification.text, notification.createdAt],
      );
      for (const userId of notification.userIds || []) {
        await pool.query(
          "INSERT INTO notification_users (notification_id, user_id, read_at) VALUES ($1, $2, $3)",
          [notification.id, userId, null],
        );
      }
    },

    async markNotificationRead(notificationId, userId, readAt) {
      await pool.query(
        `UPDATE notification_users
         SET read_at = COALESCE(read_at, $3)
         WHERE notification_id = $1 AND user_id = $2`,
        [notificationId, userId, readAt],
      );
    },

    async markAllNotificationsRead(userId, readAt) {
      await pool.query(
        `UPDATE notification_users
         SET read_at = COALESCE(read_at, $2)
         WHERE user_id = $1`,
        [userId, readAt],
      );
    },

    async insertPublicApplication(application) {
      await pool.query(
        "INSERT INTO public_applications (id, name, contact, experience, languages, motivation, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [application.id, application.name, application.contact, application.experience, application.languages, application.motivation, application.status, application.createdAt],
      );
    },

    async updatePublicApplicationStatus(applicationId, status) {
      const row = await queryOne(
        "UPDATE public_applications SET status = $2 WHERE id = $1 RETURNING *",
        [applicationId, status],
      );
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        contact: row.contact,
        experience: row.experience,
        languages: row.languages,
        motivation: row.motivation,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
        status: row.status,
      };
    },

    async insertUser(user) {
      await pool.query(
        `INSERT INTO users
        (id, name, email, password_hash, password_salt, password_updated_at, role, team_id, subscription, theme, referral_code, referral_income_percent, payout_boost, locale, permissions_override)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
        [
          user.id,
          user.name,
          user.email,
          user.passwordHash,
          user.passwordSalt,
          user.passwordUpdatedAt,
          user.role,
          textOrNull(user.teamId),
          user.subscription,
          user.theme,
          user.referralCode,
          user.referralIncomePercent,
          user.payoutBoost,
          user.locale,
          JSON.stringify(user.permissionsOverride || {}),
        ],
      );
      if (user.teamId) {
        await pool.query(
          "INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [user.teamId, user.id],
        );
      }
    },

    async insertCandidate(candidate) {
      await pool.query(
        `INSERT INTO candidates
        (id, name, offer_id, scout_id, team_id, status, location, interview_at, interview_format, interviewer_name, interview_passed, registration_passed, shifts_completed, notes, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          candidate.id,
          candidate.name,
          textOrNull(candidate.offerId),
          textOrNull(candidate.scoutId),
          textOrNull(candidate.teamId),
          candidate.status,
          textOrNull(candidate.location),
          textOrNull(candidate.interviewAt),
          textOrNull(candidate.interviewFormat),
          textOrNull(candidate.interviewerName),
          candidate.interviewPassed,
          candidate.registrationPassed,
          candidate.shiftsCompleted,
          candidate.notes,
          candidate.createdAt,
        ],
      );
    },

    async patchCandidate(candidateId, payload) {
      const fields = [];
      const values = [];
      const mapping = {
        status: "status",
        interviewAt: "interview_at",
        interviewFormat: "interview_format",
        interviewerName: "interviewer_name",
        interviewStatus: "interview_status",
        interviewNotes: "interview_notes",
        interviewPassed: "interview_passed",
        registrationPassed: "registration_passed",
        shiftsCompleted: "shifts_completed",
        notes: "notes",
      };
      Object.entries(mapping).forEach(([key, column]) => {
        if (payload[key] !== undefined) {
          fields.push(`${column} = $${fields.length + 2}`);
          values.push(payload[key]);
        }
      });
      if (!fields.length) {
        return queryOne("SELECT * FROM candidates WHERE id = $1", [candidateId]);
      }
      const row = await queryOne(
        `UPDATE candidates SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
        [candidateId, ...values],
      );
      return row;
    },

    async insertCandidateDocument(document) {
      await ensureCandidateDocsSchema();
      await pool.query(
        "INSERT INTO candidate_documents (id, candidate_id, title, type, url, note, uploaded_by_user_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [document.id, document.candidateId, document.title, document.type, textOrNull(document.url), document.note || "", textOrNull(document.uploadedByUserId), document.createdAt],
      );
    },

    async deleteCandidateDocument(documentId) {
      await ensureCandidateDocsSchema();
      await pool.query("DELETE FROM candidate_documents WHERE id = $1", [documentId]);
    },

    async insertCandidateComment(comment) {
      await ensureCandidateCommentsSchema();
      await pool.query(
        "INSERT INTO candidate_comments (id, candidate_id, author_id, author_name, body, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [comment.id, comment.candidateId, textOrNull(comment.authorId), comment.authorName, comment.body, comment.createdAt],
      );
    },

    async patchPayoutStatus(payoutId, payload) {
      await ensurePayoutsTable();
      const row = await queryOne(
        `UPDATE payouts
         SET status = COALESCE($2, status),
             approved_at = $3,
             paid_at = $4,
             updated_at = COALESCE($5, updated_at)
         WHERE id = $1
         RETURNING *`,
        [payoutId, textOrNull(payload.status), textOrNull(payload.approvedAt), textOrNull(payload.paidAt), textOrNull(payload.updatedAt)],
      );
      if (!row) return null;
      return {
        id: row.id,
        candidateId: row.candidate_id,
        scoutId: row.scout_id,
        teamId: row.team_id,
        offerId: row.offer_id,
        baseAmount: row.base_amount,
        boostPercent: row.boost_percent,
        boostAmount: row.boost_amount,
        finalAmount: row.final_amount,
        referralPercent: row.referral_percent,
        referralAmount: row.referral_amount,
        status: row.status,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
        approvedAt: row.approved_at?.toISOString?.() || row.approved_at,
        paidAt: row.paid_at?.toISOString?.() || row.paid_at,
        updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
      };
    },

    async insertTask(task) {
      await pool.query(
        "INSERT INTO tasks (id, title, by_user_id, assignee_user_id, team_id, deadline, priority, done, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [task.id, task.title, textOrNull(task.byUserId), textOrNull(task.assigneeUserId), textOrNull(task.teamId), textOrNull(task.deadline), task.priority, task.done, task.createdAt],
      );
    },

    async patchTask(taskId, payload) {
      const fields = [];
      const values = [];
      const mapping = {
        title: "title",
        assigneeUserId: "assignee_user_id",
        teamId: "team_id",
        deadline: "deadline",
        priority: "priority",
        done: "done",
      };
      Object.entries(mapping).forEach(([key, column]) => {
        if (payload[key] !== undefined) {
          fields.push(`${column} = $${fields.length + 2}`);
          values.push(payload[key]);
        }
      });
      if (!fields.length) {
        return queryOne("SELECT * FROM tasks WHERE id = $1", [taskId]);
      }
      return queryOne(
        `UPDATE tasks SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
        [taskId, ...values],
      );
    },

    async insertOffer(offer) {
      await pool.query(
        "INSERT INTO offers (id, title, reward, admin_id, openings, priority, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [offer.id, offer.title, offer.reward, textOrNull(offer.adminId), offer.openings, offer.priority, offer.createdAt],
      );
      for (const userId of offer.assignedScoutIds || []) {
        await pool.query(
          "INSERT INTO offer_assignments (offer_id, user_id) VALUES ($1, $2)",
          [offer.id, userId],
        );
      }
    },

    async patchOffer(offerId, payload) {
      const fields = [];
      const values = [];
      const mapping = {
        title: "title",
        reward: "reward",
        openings: "openings",
        priority: "priority",
      };
      Object.entries(mapping).forEach(([key, column]) => {
        if (payload[key] !== undefined) {
          fields.push(`${column} = $${fields.length + 2}`);
          values.push(payload[key]);
        }
      });
      let row = null;
      if (fields.length) {
        row = await queryOne(
          `UPDATE offers SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
          [offerId, ...values],
        );
      } else {
        row = await queryOne("SELECT * FROM offers WHERE id = $1", [offerId]);
      }
      if (!row) return null;

      if (Array.isArray(payload.assignedScoutIds)) {
        await pool.query("DELETE FROM offer_assignments WHERE offer_id = $1", [offerId]);
        for (const userId of payload.assignedScoutIds) {
          await pool.query(
            "INSERT INTO offer_assignments (offer_id, user_id) VALUES ($1, $2)",
            [offerId, userId],
          );
        }
      }

      return row;
    },

    async insertTraining(training) {
      await pool.query(
        "INSERT INTO trainings (id, title, role, mandatory, assigned_by_user_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [training.id, training.title, training.role, training.mandatory, textOrNull(training.assignedByUserId), training.createdAt],
      );
      for (const userId of training.assignedUserIds || []) {
        await pool.query(
          "INSERT INTO training_assignments (training_id, user_id, completed_at) VALUES ($1, $2, $3)",
          [training.id, userId, null],
        );
      }
    },

    async markTrainingCompleted(trainingId, userId, completedAt) {
      const existing = await queryOne(
        "SELECT training_id, user_id, completed_at FROM training_assignments WHERE training_id = $1 AND user_id = $2",
        [trainingId, userId],
      );
      if (existing) {
        await pool.query(
          "UPDATE training_assignments SET completed_at = COALESCE(completed_at, $3) WHERE training_id = $1 AND user_id = $2",
          [trainingId, userId, completedAt],
        );
      } else {
        await pool.query(
          "INSERT INTO training_assignments (training_id, user_id, completed_at) VALUES ($1, $2, $3)",
          [trainingId, userId, completedAt],
        );
      }
    },

    async insertPost(post) {
      await ensureSocialSchema();
      await pool.query(
        "INSERT INTO posts (id, type, category, pinned, author_id, author_name, title, body, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [post.id, post.type, post.category || "general", !!post.pinned, textOrNull(post.authorId), post.authorName, post.title, post.body, post.createdAt],
      );
    },

    async insertPostComment(comment) {
      await ensureSocialSchema();
      await pool.query(
        "INSERT INTO post_comments (id, post_id, author_id, author_name, body, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [comment.id, comment.postId, textOrNull(comment.authorId), comment.authorName, comment.body, comment.createdAt],
      );
    },

    async insertChatMessage(chatId, message) {
      await pool.query(
        "INSERT INTO chat_messages (id, chat_id, author_id, author_name, body, sent_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [message.id, chatId, textOrNull(message.authorId), message.authorName, message.text, textOrNull(message.sentAt || new Date().toISOString())],
      );
    },
  };
}

module.exports = {
  createPostgresRepository,
};
