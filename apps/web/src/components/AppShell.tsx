import { http } from "../services/http";
import { z } from "zod";
import { useRealtime } from "../features/workflow/useRealtime";
import { Notifications } from "../features/workflow/Notifications";
import { demoNotifications } from "../services/mocks/data";
import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Menu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  Compass,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu as MenuIcon,
  Moon,
  Settings2,
  Sun,
  Users,
  X,
} from "lucide-react";
import { Button, Logo, Modal } from "./ui";
import { isDemo, service } from "../services";
import { roleLabels, roles, Role } from "../services/contracts";
import { enterDemo } from "../services/mocks/service";
import { useMembership, useSession, useUi } from "../state/store";
function Sidebar({ close }: { close?: () => void }) {
  const membership = useMembership();
  return (
    <>
      <div className="sidebar-logo">
        <Logo />
      </div>
      <div className="workspace-card">
        <span className="workspace-symbol">F</span>
        <div>
          <strong>{isDemo ? "FieldOps Studio" : "Your organization"}</strong>
          <small>{roleLabels[membership?.role.name ?? "ADMIN"]}</small>
        </div>
      </div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Main navigation">
        <NavLink to="/" end onClick={close}>
          <LayoutDashboard size={19} />
          Overview
        </NavLink>
        <NavLink
          to={
            membership?.role.name === "CUSTOMER" ? "/requests" : "/work-orders"
          }
          onClick={close}
        >
          <BriefcaseBusiness size={19} />
          {membership?.role.name === "CUSTOMER" ? "My requests" : "Work orders"}
          <ArrowUpRight size={14} className="nav-arrow" />
        </NavLink>
        {!isDemo &&
          ["ADMIN", "DISPATCHER"].includes(membership?.role.name ?? "") && (
            <NavLink to="/requests" onClick={close}>
              <BriefcaseBusiness size={19} />
              Request inbox
            </NavLink>
          )}
        {!isDemo &&
          ["ADMIN", "DISPATCHER"].includes(membership?.role.name ?? "") && (
            <NavLink to="/analytics" onClick={close}>
              <ChartNoAxesCombined size={19} />
              Analytics & reports
            </NavLink>
          )}
        {!isDemo && membership?.role.name === "ADMIN" && (
          <NavLink to="/audit-logs" onClick={close}>
            <Activity size={19} />
            Audit log
          </NavLink>
        )}
        {!isDemo && membership?.role.name === "ADMIN" && (
          <NavLink to="/administration" onClick={close}>
            <Users size={19} />
            People & teams
          </NavLink>
        )}
        {!isDemo && (
          <NavLink to="/profile" onClick={close}>
            <Settings2 size={19} />
            Profile & settings
          </NavLink>
        )}
      </nav>
      <p className="nav-label future-label">COMING NEXT</p>
      <div className="future-nav" aria-label="Planned modules">
        <span>
          <Users size={18} />
          Technicians
        </span>
        <span>
          <MapPin size={18} />
          Live tracking
        </span>
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <span className="tiny-spark">✦</span>
          <strong>
            Less friction.
            <br />
            More fieldwork.
          </strong>
          <p>A little clarity goes a long way.</p>
        </div>
        <div className="system-status">
          <span />
          Workspace online <small>v0.5</small>
        </div>
      </div>
    </>
  );
}
export function AppShell() {
  const connected = useRealtime();
  const [mobile, setMobile] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [help, setHelp] = useState(false);
  const { user, organizationId, selectOrganization } = useSession();
  const savedProfile = useQuery({ queryKey: ["profile", user?.id], enabled: !isDemo && !!user, queryFn: () => http("/auth/profile", z.object({theme:z.enum(["light","dark"])})) });
  useEffect(() => { if(savedProfile.data) useUi.setState({theme:savedProfile.data.theme}); }, [savedProfile.data?.theme]);
  const membership = useMembership();
  const { theme, toggleTheme, notify } = useUi();
  const query = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  async function logout() {
    try {
      await service.logout();
      query.clear();
      useSession.getState().setUser(null);
      navigate("/login", { replace: true });
    } catch {
      notify("Could not sign out. Please try again.");
    }
  }
  return (
    <div className="app-frame">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="desktop-sidebar">
        <Sidebar />
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <Dialog.Root open={mobile} onOpenChange={setMobile}>
            <Dialog.Trigger
              className="icon-button mobile-menu"
              aria-label="Open navigation"
            >
              <MenuIcon size={21} />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="mobile-sidebar">
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Dialog.Description className="sr-only">
                  Workspace navigation and planned modules.
                </Dialog.Description>
                <Dialog.Close
                  className="icon-button mobile-close"
                  aria-label="Close navigation"
                >
                  <X size={20} />
                </Dialog.Close>
                <Sidebar close={() => setMobile(false)} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <div className="breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <strong>
              {location.pathname.startsWith("/profile") ? "Profile & settings" : location.pathname.startsWith("/administration") ? "People & teams" : location.pathname.startsWith("/analytics") ? "Analytics & reports" : location.pathname.startsWith("/audit-logs") ? "Audit log" : location.pathname === "/"
                ? "Overview"
                : membership?.role.name === "CUSTOMER"
                  ? "My requests"
                  : "Work orders"}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="workspace-context">
              <span />
              {isDemo
                ? "Demo workspace"
                : connected
                  ? "Live updates on"
                  : "Syncing every 30s"}
            </span>
            <button
              className="icon-button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              onClick={toggleTheme}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              className="icon-button help-button"
              aria-label="Workspace help"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
            </button>
            <button
              className="icon-button notification-button"
              aria-label="Open notifications"
              onClick={() => setNotifications(true)}
            >
              <Bell size={19} />
              {isDemo && <i />}
            </button>
            <div className="topbar-divider" />
            <Menu.Root>
              <Menu.Trigger
                className="account-trigger"
                aria-label="Open account menu"
              >
                <span className="avatar">
                  {user?.displayName
                    .split(" ")
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")}
                </span>
                <ChevronDown size={14} />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content className="dropdown" align="end" sideOffset={12}>
                  <Menu.Label>
                    <strong>{user?.displayName}</strong>
                    <small>{user?.email}</small>
                  </Menu.Label>
                  <Menu.Separator />
                  {isDemo
                    ? roles.map((role) => (
                        <Menu.Item
                          key={role}
                          onSelect={() => {
                            query.clear();
                            useSession.getState().setUser(enterDemo(role));
                            navigate("/");
                            notify(
                              `Previewing ${roleLabels[role].toLowerCase()} workspace`,
                            );
                          }}
                        >
                          {roleLabels[role]}{" "}
                          {membership?.role.name === role ? "✓" : ""}
                        </Menu.Item>
                      ))
                    : user?.memberships.map((m) => (
                        <Menu.Item
                          key={m.id}
                          onSelect={() => {
                            query.clear();
                            selectOrganization(m.organizationId);
                            navigate("/");
                          }}
                        >
                          {roleLabels[m.role.name]} ·{" "}
                          {m.organizationId.slice(0, 8)}
                          {organizationId === m.organizationId ? " ✓" : ""}
                        </Menu.Item>
                      ))}
                  <Menu.Separator />
                  <Menu.Item onSelect={logout}>
                    <LogOut size={16} />
                    Sign out
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          </div>
        </header>
        {isDemo && (
          <div className="preview-strip">
            <Compass size={14} />
            <span>
              You’re exploring a demo workspace. All activity is sample data.
            </span>
            <span className="preview-role">
              {roleLabels[membership?.role.name ?? "DISPATCHER"]} preview
            </span>
          </div>
        )}
        <main id="main-content" className="page-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>FieldOps — built for better days in the field.</span>
          <span>
            <Activity size={12} />{" "}
            {isDemo ? "Preview environment" : "Secure workspace"}
          </span>
        </footer>
      </div>
      <Modal
        open={notifications}
        onOpenChange={setNotifications}
        title="Notifications"
        description={
          isDemo
            ? "A preview of your team’s recent activity."
            : "Your latest assignments and workspace activity."
        }
      >
        {isDemo ? (
          <div className="notification-list">
            {demoNotifications.map(([title, body, time]) => (
              <article key={title}>
                <span className="activity-dot" />
                <div>
                  <strong>{title}</strong>
                  <p>{body}</p>
                  <small>{time} · Sample activity</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Notifications />
        )}
      </Modal>
      <Modal
        open={help}
        onOpenChange={setHelp}
        title="A little orientation"
        description="Your workspace, at a glance."
      >
        <p>
          Overview brings your current operations together. Open a work order to
          inspect its details, or use search and status filters to find what
          needs attention.
        </p>
        {isDemo && (
          <p>
            Use the account menu to preview the four roles. Your selections stay
            in this session only.
          </p>
        )}
        <Button variant="secondary" onClick={() => setHelp(false)}>
          Got it
        </Button>
      </Modal>
    </div>
  );
}
