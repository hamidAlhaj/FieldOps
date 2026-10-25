import { create } from "zustand";
import { User } from "../services/contracts";
export const useSession = create<{
  user: User | null;
  organizationId: string;
  setUser: (user: User | null) => void;
  selectOrganization: (id: string) => void;
}>((set) => ({
  user: null,
  organizationId: "",
  setUser: (user) =>
    set({ user, organizationId: user?.memberships[0]?.organizationId ?? "" }),
  selectOrganization: (organizationId) => set({ organizationId }),
}));
export function useMembership() {
  const { user, organizationId } = useSession();
  return user?.memberships.find((m) => m.organizationId === organizationId);
}
function savedTheme(): "light" | "dark" {
  try { return localStorage.getItem("fieldops-theme") === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}
export const useUi = create<{
  theme: "light" | "dark";
  toggleTheme: () => void;
  toast: string | null;
  notify: (message: string) => void;
}>((set) => ({
  theme: savedTheme(),
  toggleTheme: () =>
    set((state) => {
      const theme = state.theme === "light" ? "dark" : "light";
      try { localStorage.setItem("fieldops-theme", theme); } catch { /* Theme still works for this session if storage is disabled. */ }
      return { theme };
    }),
  toast: null,
  notify: (toast) => set({ toast }),
}));
