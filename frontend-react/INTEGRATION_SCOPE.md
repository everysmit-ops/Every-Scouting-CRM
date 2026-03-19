# First Integration Scope

This document defines the first implementation slice for moving the Figma Make
frontend onto the current Every Scouting backend.

## Goal

Replace mock data on the most important screens with real backend data while
preserving the new approved visual design.

## Scope

### 1. Auth and app bootstrap

Target Figma files:

- `src/app/App.tsx`
- `src/app/routes.tsx`
- `src/app/layouts/WorkspaceLayout.tsx`

Required backend endpoints:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/bootstrap`

Tasks:

- add token storage
- add route guard for `/workspace`
- fetch bootstrap after login
- populate current user in top bar
- populate notification dropdown with real notifications
- replace mock notification items

### 2. Dashboard

Target Figma file:

- `src/app/pages/Dashboard.tsx`

Required backend data:

- `summary`
- `auditLog`
- `notifications`
- `publicApplications` for owner

Tasks:

- replace static stat cards
- replace mock recent activity
- connect owner-only application preview
- wire quick actions to candidate creation / route transitions

### 3. Candidates

Target Figma file:

- `src/app/pages/Candidates.tsx`

Required backend data:

- `candidates`
- `auditLog`
- `metadata.referenceData.offers`
- `metadata.referenceData.teams`
- `metadata.referenceData.users`

Required backend actions:

- `POST /api/candidates`
- `PATCH /api/candidates/:id`
- `POST /api/candidates/:id/comments`
- `POST /api/candidates/:id/documents`
- `DELETE /api/candidates/:candidateId/documents/:documentId`

Rules:

- scouts can add candidate forms
- only lead and owner can change candidate statuses

Tasks:

- map mock candidates to real candidates
- keep compact list / detail behavior
- preserve role restrictions
- bring comments and documents into detail panel

### 4. Finance

Target Figma file:

- `src/app/pages/Finance.tsx`

Required backend data:

- `payouts`
- `candidates`
- `teams`
- `offers`
- `users`

Required backend actions:

- `PATCH /api/payouts/:id`
- `POST /api/payouts/batch`

Rules:

- owner sees full finance view
- scout sees personal payouts only

Tasks:

- replace mock totals and table rows
- preserve premium wallet-style layout
- keep owner-only actions for payout approval / payment

### 5. Profile

Target Figma file:

- `src/app/pages/Profile.tsx`

Required backend data:

- current user
- payout summary
- referral fields

Tasks:

- replace hardcoded identity with current authenticated user
- preserve profile presentation exactly
- connect edit mode to real profile payload later

## Shared Requirements

- preserve i18n support
- preserve icon system
- preserve desktop/mobile layouts
- do not fall back to the old legacy UI
- keep design untouched while wiring logic
