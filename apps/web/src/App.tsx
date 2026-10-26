import { Reports } from "./features/reporting/Reports";
import {
  Requests,
  RequestDetails,
  WorkOrderDetails,
  DemoWorkflow,
} from "./features/workflow/Workflow";
import { isDemo } from "./services";
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./components/AppShell";
import { Button, EmptyState, ErrorState, Logo, Toast } from "./components/ui";
import { AuthPage } from "./features/auth/AuthPage";
import { Overview, WorkList } from "./features/operations/Overview";
import { service } from "./services";
import { User } from "./services/contracts";
import { useMembership, useSession, useUi } from "./state/store";
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
let restoration: Promise<User | null> | undefined;
function Protected({
  customerOnly = false,
  ordersOnly = false,
  children,
}: {
  customerOnly?: boolean;
  ordersOnly?: boolean;
  children: React.ReactNode;
}) {
  const user = useSession((s) => s.user);
  const role = useMembership()?.role.name;
  if (!user) return <Navigate to="/login" replace />;
  if (
    (customerOnly && role !== "CUSTOMER") ||
    (ordersOnly && (!role || role === "CUSTOMER"))
  )
    return <Navigate to="/" replace />;
  return children;
}
function RouteFocus() {
  const location = useLocation();
  useEffect(() => {
    document.title = `${location.pathname === "/login" ? "Sign in" : location.pathname === "/register" ? "Create account" : location.pathname === "/" ? "Overview" : "Operations"} · FieldOps`;
    document.getElementById("main-content")?.focus();
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return null;
}
function Application() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const theme = useUi((s) => s.theme);
  const user = useSession((s) => s.user);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => {
    let active = true;
    restoration ??= service.restore();
    restoration
      .then((user) => {
        if (active) {
          useSession.getState().setUser(user);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const expired = () => {
      useSession.getState().setUser(null);
      queryClient.clear();
      useUi.getState().notify("Your session has ended. Please sign in again.");
    };
    window.addEventListener("fieldops:expired", expired);
    return () => window.removeEventListener("fieldops:expired", expired);
  }, []);
  if (failed)
    return (
      <div className="boot-screen">
        <ErrorState retry={() => window.location.reload()} />
      </div>
    );
  if (!ready)
    return (
      <div className="boot-screen" role="status">
        <Logo />
        <span className="loading-line" />
        <p>Opening your workspace…</p>
      </div>
    );
  return (
    <>
      <RouteFocus />
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <AuthPage />}
        />
        <Route
          path="/register"
          element={user ? <Navigate to="/" replace /> : <AuthPage register />}
        />
        <Route
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route index element={<Overview />} />
          <Route path="analytics" element={<Reports />} />
          <Route path="audit-logs" element={<Reports audit />} />
          <Route
            path="work-orders"
            element={
              <Protected ordersOnly>
                <WorkList />
              </Protected>
            }
          />
          <Route
            path="requests"
            element={
              <Protected>{isDemo ? <WorkList /> : <Requests />}</Protected>
            }
          />
          <Route
            path="requests/:id"
            element={isDemo ? <DemoWorkflow /> : <RequestDetails />}
          />
          <Route
            path="work-orders/:id"
            element={isDemo ? <DemoWorkflow /> : <WorkOrderDetails />}
          />
          <Route
            path="*"
            element={
              <EmptyState
                title="This page took a different route."
                action={
                  <Button onClick={() => window.location.assign("/")}>
                    Back to overview
                  </Button>
                }
              >
                The page you’re looking for isn’t in this workspace.
              </EmptyState>
            }
          />
        </Route>
      </Routes>
      <Toast />
    </>
  );
}
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Application />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
