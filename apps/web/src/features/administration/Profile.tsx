import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { http, setAccessToken } from "../../services/http";
import { useSession, useUi } from "../../state/store";
import { isDemo } from "../../services";
import { Button, ErrorState, Skeleton } from "../../components/ui";
const schema = z.object({
  displayName: z.string().trim().min(2).max(160),
  theme: z.enum(["light", "dark"]),
  notifyAssignments: z.boolean(),
  notifyStatusUpdates: z.boolean(),
});
const profile = schema.extend({ id: z.string(), email: z.string() });
const passwords = z
  .object({
    currentPassword: z.string().min(12).max(128),
    newPassword: z.string().min(12).max(128),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "Choose a different password",
    path: ["newPassword"],
  });
export function Profile() {
  const q = useQuery({
    queryKey: ["profile"],
    enabled: !isDemo,
    queryFn: () => http("/auth/profile", profile),
  });
  if (isDemo)
    return <p>Profile settings are available in the connected workspace.</p>;
  if (q.isPending) return <Skeleton />;
  if (q.isError) return <ErrorState retry={() => void q.refetch()} />;
  return <ProfileForm key={q.data.id} data={q.data} />;
}
function ProfileForm({ data }: { data: z.infer<typeof profile> }) {
  const cache = useQueryClient();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: data,
  });
  const pwd = useForm<z.infer<typeof passwords>>({
    resolver: zodResolver(passwords),
  });
  const save = useMutation({
    mutationFn: (body: z.infer<typeof schema>) =>
      http("/auth/profile", profile, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async (result) => {
      useUi.setState({ theme: result.theme });
      try {
        localStorage.setItem("fieldops-theme", result.theme);
      } catch {}
      const user = useSession.getState().user;
      if (user)
        useSession.setState({
          user: { ...user, displayName: result.displayName },
        });
      await cache.invalidateQueries({ queryKey: ["profile"] });
      useUi.getState().notify("Profile saved.");
    },
    onError: (e) => useUi.getState().notify(e.message),
  });
  const change = useMutation({
    mutationFn: (body: z.infer<typeof passwords>) =>
      http("/auth/password", z.void(), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setAccessToken(null);
      useSession.getState().setUser(null);
      cache.clear();
      useUi
        .getState()
        .notify("Password changed. All sessions were signed out.");
    },
    onError: (e) => useUi.getState().notify(e.message),
  });
  return (
    <div className="workflow-page">
      <h1>Profile & settings</h1>
      <form
        className="workflow-card workflow-form"
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
      >
        <h2>Your profile</h2>
        <p>{data.email}</p>
        <label>
          Display name
          <input {...form.register("displayName")} />
        </label>
        <p role="alert">{form.formState.errors.displayName?.message}</p>
        <label>
          Saved appearance
          <select aria-label="Saved appearance" {...form.register("theme")}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          <input type="checkbox" {...form.register("notifyAssignments")} />
          Receive in-app assignment alerts
        </label>
        <Button type="submit" busy={save.isPending}>
          Save profile
        </Button>
      </form>
      <form
        className="workflow-card workflow-form"
        onSubmit={pwd.handleSubmit((v) => change.mutate(v))}
      >
        <h2>Change password</h2>
        <p>
          Changing your password signs out all sessions, including this one.
        </p>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            {...pwd.register("currentPassword")}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            {...pwd.register("newPassword")}
          />
        </label>
        {Object.entries(pwd.formState.errors).map(([k, e]) => (
          <p role="alert" key={k}>
            {e.message}
          </p>
        ))}
        <Button type="submit" busy={change.isPending}>
          Change password and sign out
        </Button>
      </form>
    </div>
  );
}
