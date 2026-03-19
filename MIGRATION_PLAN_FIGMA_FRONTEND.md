## Every Scouting Figma Frontend Migration Plan

This document defines how the new Figma Make frontend will replace the current
workspace UI without changing the approved visual design.

### Goal

Adopt the new React/Vite frontend generated from Figma Make as the primary UI
layer for Every Scouting, while preserving the current backend, API contracts,
role logic, and production data model.

### Current State

- The repository currently serves a lightweight static frontend from:
  - `frontend/index.html`
  - `frontend/workspace.html`
  - `frontend/app.js`
  - `frontend/styles.css`
- The backend is already production-oriented enough for a local rollout:
  - auth
  - bootstrap
  - candidates
  - comments
  - documents
  - offers
  - tasks
  - trainings
  - posts
  - payouts
  - notifications
  - users / management
  - PostgreSQL / file repository modes

### Figma Make Frontend Audit Summary

The new Figma frontend is a separate React/Vite application with:

- application shell and routing
- premium layout and icon system
- landing page
- dashboard
- candidates
- finance
- profile
- teams
- analytics
- calendar
- training
- feed
- admin
- i18n and theme tokens

The new frontend is currently mostly visual and static:

- mock data in pages
- no real auth
- no backend API integration
- no live bootstrap state
- no role guards

### Migration Rules

1. Do not redesign the new Figma UI.
2. Preserve the approved visual direction from Figma.
3. Do not break backend API semantics unless absolutely necessary.
4. Prefer adapting frontend state to the existing backend instead of changing
   backend behavior.
5. Keep landing and workspace as separate surfaces.

### Target Structure

Planned new structure:

- `frontend-react/`
  - `src/`
  - `public/`
  - `package.json`
  - `vite.config.ts`

Backend keeps serving:

- API under `/api/*`
- uploads under `/uploads/*`

Static serving should later point to the built Vite app output.

### Integration Phases

#### Phase 1. Foundation

- bring the Figma React/Vite frontend into the repo
- keep it isolated from the current static frontend
- make local build and dev scripts work
- define environment access to the existing backend

#### Phase 2. App shell and auth

- implement login flow against `/api/auth/login`
- implement logout against `/api/auth/logout`
- load `/api/bootstrap`
- create a typed client-side app state
- replace mock topbar/sidebar user data with real data
- connect notifications dropdown to real notifications

#### Phase 3. First business-critical screens

- Dashboard
- Candidates
- Finance
- Profile

These four screens are the first priority because they are both
business-critical and central to the new UI.

#### Phase 4. Remaining workspace modules

- Teams
- Analytics
- Calendar
- Training
- Feed
- Admin

#### Phase 5. Production readiness

- full route handling
- role guards
- loading / error states
- mobile QA
- smoke checks
- deployment updates

### API Mapping

#### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/bootstrap`

#### Candidates

- `GET /api/bootstrap`
- `POST /api/candidates`
- `PATCH /api/candidates/:id`
- `POST /api/candidates/:id/comments`
- `POST /api/candidates/:id/documents`
- `DELETE /api/candidates/:candidateId/documents/:documentId`

#### Finance

- `GET /api/bootstrap`
- `PATCH /api/payouts/:id`
- `POST /api/payouts/batch`

#### Notifications

- `PATCH /api/notifications/:id/read`
- `POST /api/notifications/read-all`
- `GET /api/events`

#### Management

- `POST /api/users`
- `PATCH /api/users/:id`
- `PATCH /api/public/applications/:id/approve`
- `PATCH /api/public/applications/:id/reject`

### First Deliverable

The first integration milestone should provide:

- real login
- real workspace shell
- real dashboard summary
- real candidates screen
- real finance screen
- real profile header

Once that is working, the rest of the app can be migrated incrementally.
