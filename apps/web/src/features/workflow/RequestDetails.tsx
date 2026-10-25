import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, ErrorState } from "../../components/ui";
import { useMembership, useSession } from "../../state/store";
import { http } from "../../services/http";
import { useCommand } from "./useCommand";
import { orgPath, requestSchema } from "../../services/workflow";
export function RequestDetails() {
  const { id = "" } = useParams();
  const org = useSession((s) => s.organizationId);
  const role = useMembership()?.role.name;
  const staff = role === "ADMIN" || role === "DISPATCHER";
  const [note, setNote] = useState("");
  const action = useCommand();
  const navigate = useNavigate();
  const data = useQuery({
    queryKey: ["request", org, id],
    queryFn: ({ signal }) =>
      http(`${orgPath(org)}/requests/${id}`, requestSchema, { signal }),
  });
  if (data.isPending) return <p role="status">Loading request…</p>;
  if (data.isError) return <ErrorState retry={() => void data.refetch()} />;
  const request = data.data;
  return (
    <div className="workflow-page">
      <Link to="/requests" className="text-link">
        ← Request inbox
      </Link>
      <header className="workflow-heading">
        <div>
          <p className="eyebrow">{request.status.replaceAll("_", " ")}</p>
          <h1>{request.title}</h1>
          <p className="muted">{request.address}</p>
        </div>
      </header>
      <section className="workflow-card">
        <h2>Reported issue</h2>
        <p className="preserve-lines">{request.description}</p>
        {request.reviewNotes && (
          <p>
            <strong>Review notes: </strong>
            {request.reviewNotes}
          </p>
        )}
        {((staff && request.status === "SUBMITTED") ||
          request.status === "SUBMITTED" ||
          (staff && request.status === "ACCEPTED")) && (
          <label className="workflow-field">
            Review / cancellation notes
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
            />
          </label>
        )}
        <div className="workflow-actions">
          {staff && request.status === "SUBMITTED" && (
            <Button
              busy={action.isPending}
              disabled={note.trim().length < 2}
              onClick={() =>
                action.mutate({
                  path: `/requests/${id}/review`,
                  body: { expectedVersion: request.version, note },
                })
              }
            >
              Accept request
            </Button>
          )}
          {staff && request.status === "ACCEPTED" && (
            <Button
              busy={action.isPending}
              onClick={() =>
                action.mutate(
                  {
                    path: "/work-orders",
                    body: {
                      requestId: id,
                      title: request.title,
                      description: request.description,
                    },
                  },
                  { onSuccess: (r) => navigate(`/work-orders/${r.id}`) },
                )
              }
            >
              Create work order
            </Button>
          )}
          {(request.status === "SUBMITTED" ||
            (staff && request.status === "ACCEPTED")) && (
            <Button
              variant="secondary"
              busy={action.isPending}
              disabled={note.trim().length < 2}
              onClick={() =>
                action.mutate({
                  path: `/requests/${id}/cancel`,
                  body: { reason: note },
                })
              }
            >
              Cancel request
            </Button>
          )}
        </div>
      </section>
      <section className="workflow-card">
        <h2>Work orders</h2>
        {!request.workOrders.length && (
          <p className="muted">
            A work order will appear after the dispatcher reviews your request.
          </p>
        )}
        {request.workOrders.map((o) => (
          <Link
            key={o.id}
            to={`/work-orders/${o.id}`}
            className="workflow-order-link"
          >
            <span>{o.title}</span>
            <span>{o.status.replaceAll("_", " ")} →</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
