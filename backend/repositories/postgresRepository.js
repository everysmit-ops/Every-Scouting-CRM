const { getPool } = require("../lib/postgres");
const { normalizeDb, safeUser } = require("../lib/auth");
const { ROLE_LABELS } = require("../lib/config");
const { isKpiQualified } = require("../lib/domain");

function mapRowsById(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

function textOrNull(value) {
  return value === undefined ? null : value;
}

function createPostgresRepository() {
  const pool = getPool();

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
      tasksRes,
      trainingsRes,
      trainingAssignmentsRes,
      postsRes,
      chatsRes,
      chatParticipantsRes,
      chatMessagesRes,
      publicApplicationsRes,
      notificationsRes,
      notificationUsersRes,
      auditLogRes,
      sessionsRes,
    ] = await Promise.all([
      client.query("SELECT * FROM teams"),
      client.query("SELECT * FROM team_members"),
      client.query("SELECT * FROM users"),
      client.query("SELECT * FROM offers"),
      client.query("SELECT * FROM offer_assignments"),
      client.query("SELECT * FROM candidates"),
      client.query("SELECT * FROM tasks"),
      client.query("SELECT * FROM trainings"),
      client.query("SELECT * FROM training_assignments"),
      client.query("SELECT * FROM posts"),
      client.query("SELECT * FROM chats"),
      client.query("SELECT * FROM chat_participants"),
      client.query("SELECT * FROM chat_messages ORDER BY sent_at ASC"),
      client.query("SELECT * FROM public_applications"),
      client.query("SELECT * FROM notifications"),
      client.query("SELECT * FROM notification_users"),
      client.query("SELECT * FROM audit_log ORDER BY created_at DESC"),
      client.query("SELECT * FROM sessions"),
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
        interviewPassed: row.interview_passed,
        registrationPassed: row.registration_passed,
        shiftsCompleted: row.shifts_completed,
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
        authorId: row.author_id,
        authorName: row.author_name,
        title: row.title,
        body: row.body,
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
      trainingsRes,
      trainingAssignmentsRes,
      notificationsRes,
      notificationUsersRes,
      auditLogRes,
      chatsRes,
      chatParticipantsRes,
      chatMessagesRes,
      publicApplicationsRes,
    ] = await Promise.all([
      client.query("SELECT * FROM users"),
      client.query("SELECT * FROM teams"),
      client.query("SELECT * FROM team_members"),
      client.query("SELECT * FROM offers"),
      client.query("SELECT * FROM offer_assignments"),
      client.query("SELECT * FROM posts ORDER BY created_at DESC"),
      client.query("SELECT * FROM trainings"),
      client.query("SELECT * FROM training_assignments"),
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
    ]);

    const visibleCandidatesRes = await client.query(
      user.role === "owner"
        ? "SELECT * FROM candidates"
        : user.role === "lead"
          ? "SELECT * FROM candidates WHERE team_id = $1"
          : "SELECT * FROM candidates WHERE scout_id = $1",
      [user.role === "lead" ? user.teamId : user.id],
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
      interviewPassed: row.interview_passed,
      registrationPassed: row.registration_passed,
      shiftsCompleted: row.shifts_completed,
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
      interviewPassed: row.interview_passed,
      registrationPassed: row.registration_passed,
      shiftsCompleted: row.shifts_completed,
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
      authorId: row.author_id,
      authorName: row.author_name,
      title: row.title,
      body: row.body,
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
      scoreboard,
      auditLog,
      users: user.role === "owner" ? users.map((item) => safeUser(item)) : [],
    };
  }

  async function replaceAll(client, db) {
    const orderedDeletes = [
      "sessions",
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
        (id, name, email, password_hash, password_salt, password_updated_at, role, team_id, subscription, theme, referral_code, referral_income_percent, payout_boost, locale)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
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
        (id, name, offer_id, scout_id, team_id, status, location, interview_passed, registration_passed, shifts_completed, notes, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          candidate.id,
          candidate.name,
          textOrNull(candidate.offerId),
          textOrNull(candidate.scoutId),
          textOrNull(candidate.teamId),
          candidate.status,
          textOrNull(candidate.location),
          candidate.interviewPassed,
          candidate.registrationPassed,
          candidate.shiftsCompleted,
          candidate.notes,
          candidate.createdAt,
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
        "INSERT INTO posts (id, type, author_id, author_name, title, body, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [post.id, post.type, textOrNull(post.authorId), post.authorName, post.title, post.body, post.createdAt],
      );
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
      };
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
        (id, name, email, password_hash, password_salt, password_updated_at, role, team_id, subscription, theme, referral_code, referral_income_percent, payout_boost, locale)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
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
        (id, name, offer_id, scout_id, team_id, status, location, interview_passed, registration_passed, shifts_completed, notes, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          candidate.id,
          candidate.name,
          textOrNull(candidate.offerId),
          textOrNull(candidate.scoutId),
          textOrNull(candidate.teamId),
          candidate.status,
          textOrNull(candidate.location),
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
      await pool.query(
        "INSERT INTO posts (id, type, author_id, author_name, title, body, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [post.id, post.type, textOrNull(post.authorId), post.authorName, post.title, post.body, post.createdAt],
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
