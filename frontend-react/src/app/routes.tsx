import { createBrowserRouter } from "react-router";
import { LandingPage } from "./pages/LandingPage";
import { WorkspaceLayout } from "./layouts/WorkspaceLayout";
import { Dashboard } from "./pages/Dashboard";
import { Candidates } from "./pages/Candidates";
import { Teams } from "./pages/Teams";
import { Finance } from "./pages/Finance";
import { Profile } from "./pages/Profile";
import { Analytics } from "./pages/Analytics";
import { Calendar } from "./pages/Calendar";
import { Training } from "./pages/Training";
import { Feed } from "./pages/Feed";
import { Admin } from "./pages/Admin";
import { RequirePermission } from "./components/RequirePermission";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: LandingPage,
  },
  {
    path: "/workspace",
    Component: WorkspaceLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "candidates", Component: Candidates },
      { path: "teams", Component: Teams },
      { path: "finance", Component: Finance },
      { path: "profile", Component: Profile },
      { path: "analytics", Component: Analytics },
      { path: "calendar", Component: Calendar },
      { path: "training", Component: Training },
      { path: "feed", Component: Feed },
      {
        path: "admin",
        element: (
          <RequirePermission permission="manageUsers">
            <Admin />
          </RequirePermission>
        ),
      },
    ],
  },
]);
