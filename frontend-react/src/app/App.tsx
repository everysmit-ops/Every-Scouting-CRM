import { RouterProvider } from "react-router";
import { router } from "./routes";
import "../i18n/config";
import { AppShellProvider } from "./state/AppShellContext";

export default function App() {
  return (
    <AppShellProvider>
      <RouterProvider router={router} />
    </AppShellProvider>
  );
}
