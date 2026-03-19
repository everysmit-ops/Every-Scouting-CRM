# Every Scouting React Frontend

This folder is reserved for the new frontend generated from Figma Make.

## Purpose

The current repository still ships the legacy static frontend from `frontend/`.
The long-term goal is to replace that layer with a React/Vite application based
on the approved Figma redesign.

## Migration Rules

1. Do not redesign the imported Figma UI during migration.
2. Preserve layout, spacing, iconography, and visual hierarchy.
3. Connect business logic through the existing backend API.
4. Keep landing and workspace separated.
5. Move feature-by-feature, starting from auth, dashboard, candidates, finance,
   and profile.

## Expected Inputs from Figma Make

The following Figma Make assets were audited and should eventually be imported:

- `src/app/App.tsx`
- `src/app/routes.tsx`
- `src/app/layouts/WorkspaceLayout.tsx`
- `src/app/pages/LandingPage.tsx`
- `src/app/pages/Dashboard.tsx`
- `src/app/pages/Candidates.tsx`
- `src/app/pages/Finance.tsx`
- `src/app/pages/Profile.tsx`
- `src/app/pages/Teams.tsx`
- `src/app/pages/Analytics.tsx`
- `src/app/pages/Calendar.tsx`
- `src/app/pages/Training.tsx`
- `src/app/pages/Feed.tsx`
- `src/app/pages/Admin.tsx`
- `src/styles/theme.css`
- `src/styles/index.css`
- `src/styles/fonts.css`
- `src/styles/tailwind.css`
- `src/i18n/*`

## First Integration Milestone

The first milestone should make these flows real:

- auth
- bootstrap
- dashboard
- candidates
- finance
- profile

Once that is stable, remaining modules can be moved over one by one.
