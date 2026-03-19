# Bootstrap Contract

This document describes the actual payload returned by
`GET /api/bootstrap` in the current Every Scouting backend.

It is the main source of truth for wiring the new Figma Make React frontend
without changing the approved design.

## Top-level shape

```json
{
  "user": {},
  "metadata": {},
  "summary": {},
  "candidates": [],
  "offers": [],
  "teams": [],
  "tasks": [],
  "trainings": [],
  "chats": [],
  "posts": [],
  "publicApplications": [],
  "notifications": [],
  "payouts": [],
  "scoreboard": [],
  "auditLog": [],
  "users": []
}
```

## Notes

- `chats` still exist in the backend payload for historical reasons.
- The approved new UI no longer includes team chat as a product feature.
- The React frontend should ignore `chats` unless the product direction changes.

## `user`

Authenticated user returned via `safeUser(user)`.

Expected important fields:

- `id`
- `name`
- `email`
- `role`
- `teamId`
- `subscription`
- `theme`
- `referralCode`
- `referralIncomePercent`
- `payoutBoost`
- `locale`
- `permissions`
- profile-related fields when present in storage

## `metadata`

```json
{
  "roles": {},
  "permissionLabels": {},
  "permissions": {},
  "companyName": "Every Scouting",
  "locale": "ru",
  "referenceData": {
    "teams": [{ "id": "", "name": "" }],
    "offers": [{ "id": "", "title": "" }],
    "users": [{ "id": "", "name": "", "role": "" }]
  }
}
```

Use cases:

- build select options
- drive role-aware labels
- populate admin forms
- connect profile/user references

## `summary`

```json
{
  "candidates": 0,
  "kpiQualified": 0,
  "offers": 0,
  "trainingPending": 0,
  "applications": 0
}
```

Use cases:

- dashboard stat cards
- top-level executive overview
- owner / lead / scout role summaries

## `candidates`

Expanded candidate items.

Important fields include:

- raw candidate fields from storage
- `offer`
- `scout`
- `team`
- `kpiQualified`

Use cases:

- compact CRM list
- detail panel
- status filtering
- KPI and interview logic
- comments/documents follow-up actions through dedicated endpoints

## `offers`

Expanded offer items.

Important fields include:

- raw offer fields
- `admin`
- `assignedScouts`

## `teams`

Expanded team statistics.

Important fields include:

- team fields
- `kpiPercent`
- `membersExpanded`
- `leadUser`

Use cases:

- teams screen
- team KPIs
- dashboard and analytics summaries

## `tasks`

Expanded task items.

Important fields include:

- raw task fields
- `assigneeUser`
- `team`

## `trainings`

Expanded training items for the authenticated user.

Important fields include:

- raw training fields
- `completed`
- `assignedUsers`

## `posts`

Company feed / social items sorted by newest first.

## `publicApplications`

Owner-only list of incoming public applications.

For non-owner roles this array is empty.

## `notifications`

Visible notifications for the authenticated user.

Current backend behavior:

- returns only notifications relevant to the user
- already sliced to a short list
- unread state is derived from `readBy`

Use cases:

- top-right notifications dropdown
- dashboard alerts preview

## `payouts`

Role-filtered payout list.

Current backend behavior:

- owner sees all payouts
- lead sees team payouts
- scout / referral see only personal payouts

Sorted by newest first.

Use cases:

- finance screen
- payout tables
- wallet summary
- profile earnings section

## `scoreboard`

KPI ranking slice built from leads/scouts/referrals.

Important fields include:

- `id`
- `name`
- `role`
- `kpiScore`
- `qualified`
- `payoutBoost`

This field exists, but the new design should only use it where product direction
explicitly allows it.

## `auditLog`

Recent audit entries, already sliced to a short list.

Use cases:

- dashboard activity feed
- candidate / admin timeline references

## `users`

Owner-only expanded user list via `safeUser`.

For non-owner roles this array is empty.

Use cases:

- admin page
- management tools
- ownership of teams/offers/tasks

## Integration Guidance

### First pages that should rely on bootstrap

- workspace shell
- dashboard
- candidates
- finance
- profile

### Fields the React app should treat as legacy or secondary

- `chats`
- `scoreboard` where it conflicts with the approved design direction

### Actions that still require dedicated endpoints

- login / logout
- create/update candidates
- add/remove documents
- add comments
- payout status updates
- notifications read / read-all
- user management
