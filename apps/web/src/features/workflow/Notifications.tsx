import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession, useUi } from "../../state/store";
import { http } from "../../services/http";
import { command, notificationsSchema, orgPath } from "../../services/workflow";
import { Button, ErrorState } from "../../components/ui";
export function Notifications() {
  const org = useSession((s) => s.organizationId);
  const query = useQueryClient();
  const data = useQuery({
    queryKey: ["notifications", org],
    queryFn: ({ signal }) =>
      http(`${orgPath(org)}/notifications`, notificationsSchema, { signal }),
  });
  const read = useMutation({
    mutationFn: (id: string) =>
      command(org, `/notifications/${id}/read`, {}, "PATCH"),
    onSuccess: () =>
      query.invalidateQueries({ queryKey: ["notifications", org] }),
    onError: (e) => useUi.getState().notify(e.message),
  });
  if (data.isPending) return <p role="status">Loading notifications…</p>;
  if (data.isError) return <ErrorState retry={() => void data.refetch()} />;
  return (
    <div className="notification-list">
      {!data.data.length && <p>No notifications yet.</p>}
      {data.data.map((n) => (
        <article key={n.id}>
          <div>
            <strong>{n.title}</strong>
            <p>{n.body}</p>
            <small>{new Date(n.createdAt).toLocaleString()}</small>
            {!n.readAt && (
              <Button
                variant="secondary"
                busy={read.isPending}
                onClick={() => read.mutate(n.id)}
              >
                Mark as read
              </Button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
