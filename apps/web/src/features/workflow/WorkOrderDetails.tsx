import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, ErrorState } from "../../components/ui";
import { useMembership, useSession, useUi } from "../../state/store";
import { http } from "../../services/http";
import { useCommand } from "./useCommand";
import {
  orgPath,
  orderSchema,
  techniciansSchema,
} from "../../services/workflow";
import { Photo } from "./Photo";
import { LocationSharing } from "../tracking/LocationSharing";
import { OrderScheduleEditor } from "../scheduling/OrderScheduleEditor";
export function WorkOrderDetails() {
  const { id = "" } = useParams();
  const org = useSession((s) => s.organizationId);
  const member = useMembership();
  const staff =
    member?.role.name === "ADMIN" || member?.role.name === "DISPATCHER";
  const [technicianId, setTechnician] = useState("");
  const [note, setNote] = useState("");
  const [percent, setPercent] = useState(0);
  const [kind, setKind] = useState<"BEFORE" | "AFTER">("BEFORE");
  const [file, setFile] = useState<File | null>(null);
  const action = useCommand();
  const data = useQuery({
    queryKey: ["order", org, id],
    queryFn: ({ signal }) =>
      http(`${orgPath(org)}/work-orders/${id}`, orderSchema, { signal }),
  });
  const technicians = useQuery({
    queryKey: ["technicians", org],
    enabled: staff,
    queryFn: ({ signal }) =>
      http(`${orgPath(org)}/technicians`, techniciansSchema, { signal }),
  });
  if (data.isPending) return <p role="status">Loading work order…</p>;
  if (data.isError) return <ErrorState retry={() => void data.refetch()} />;
  const order = data.data;
  const assignment = order.assignments.find((a) => a.status === "ACTIVE");
  const assigned =
    member?.role.name === "TECHNICIAN" &&
    assignment?.technician.membershipId === member.id;
  const accepted = assigned && !!assignment?.acceptedAt;
  const editable = ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(order.status);
  const send = (suffix: string, body: object = {}, method = "POST") =>
    action.mutate({
      path: `/work-orders/${id}${suffix}`,
      body: { expectedVersion: order.version, ...body },
      method,
    });
  return (
    <div className="workflow-page">
      <Link
        to={
          member?.role.name === "CUSTOMER"
            ? `/requests/${order.request.id}`
            : "/work-orders"
        }
        className="text-link"
      >
        ← Back to {member?.role.name === "CUSTOMER" ? "request" : "work orders"}
      </Link>
      <header className="workflow-heading">
        <div>
          <p className="eyebrow">
            {order.status.replaceAll("_", " ")} · WO-
            {id.slice(0, 8).toUpperCase()}
          </p>
          <h1>{order.title}</h1>
          <p className="muted">{order.request.address}</p>
        </div>
        <div className="workflow-progress">
          <strong>{order.progress}%</strong>
          <progress
            max={100}
            value={order.progress}
            aria-label="Work progress"
          />
        </div>
      </header>
      <div className="workflow-columns">
        <div>
          <section className="workflow-card">
            <h2>Scope of work</h2>
            <p className="preserve-lines">{order.description}</p>
            <p>
              <strong>Assigned to: </strong>
              {(assignment ?? order.assignments[0])?.technician.membership.user
                .displayName ?? "Unassigned"}
            </p>
            {order.scheduledAt && <p><strong>Planned start: </strong>{new Date(order.scheduledAt).toLocaleString()}</p>}
            {order.plannedEndAt && <p><strong>Planned end: </strong>{new Date(order.plannedEndAt).toLocaleString()}</p>}
            {order.estimatedDurationMinutes && <p><strong>Estimated duration: </strong>{order.estimatedDurationMinutes} minutes</p>}
            {!!order.requiredSkills.length && <p><strong>Required skills: </strong>{order.requiredSkills.map(s=>s.skill.name).join(", ")}</p>}
            {order.completionNotes && (
              <p>
                <strong>Completion notes: </strong>
                {order.completionNotes}
              </p>
            )}
          </section>
          {(staff || assigned) && (
            <section className="workflow-card workflow-form">
              <h2>Next action</h2>
              {(editable ||
                order.status === "COMPLETED" ||
                order.status === "VERIFIED") && (
                <label>
                  Work notes / reason
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Add useful context for the next person…"
                  />
                </label>
              )}
              {staff && editable && (
                <>
                  <label>
                    Technician
                    <select
                      aria-label="Technician"
                      value={technicianId}
                      onChange={(e) => setTechnician(e.target.value)}
                    >
                      <option value="">Select an active technician</option>
                      {technicians.data?.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.membership.user.displayName} · {t.employeeCode}
                        </option>
                      ))}
                    </select>
                  </label>
                  {technicians.isError && (
                    <ErrorState retry={() => void technicians.refetch()} />
                  )}
                  <Button
                    busy={action.isPending}
                    disabled={
                      !technicianId || (!!assignment && note.trim().length < 2)
                    }
                    onClick={() =>
                      send("/assignments", {
                        technicianId,
                        ...(note.trim() ? { reason: note } : {}),
                      })
                    }
                  >
                    {assignment ? "Reassign technician" : "Assign technician"}
                  </Button>
                </>
              )}
              <div className="workflow-actions">
                {assigned && !accepted && order.status === "ASSIGNED" && (
                  <Button
                    busy={action.isPending}
                    onClick={() => send("/accept")}
                  >
                    Accept assignment
                  </Button>
                )}
                {accepted && order.status === "ASSIGNED" && (
                  <Button
                    busy={action.isPending}
                    onClick={() =>
                      send("/status", { status: "IN_PROGRESS" }, "PATCH")
                    }
                  >
                    Start work
                  </Button>
                )}
                {accepted && order.status === "IN_PROGRESS" && (
                  <Button
                    busy={action.isPending}
                    disabled={note.trim().length < 2}
                    onClick={() =>
                      send(
                        "/status",
                        { status: "COMPLETED", reason: note },
                        "PATCH",
                      )
                    }
                  >
                    Complete work
                  </Button>
                )}
                {staff && order.status === "COMPLETED" && (
                  <Button
                    busy={action.isPending}
                    onClick={() =>
                      send(
                        "/status",
                        {
                          status: "VERIFIED",
                          ...(note ? { reason: note } : {}),
                        },
                        "PATCH",
                      )
                    }
                  >
                    Verify completed work
                  </Button>
                )}
                {staff && order.status === "VERIFIED" && (
                  <Button
                    busy={action.isPending}
                    onClick={() =>
                      send(
                        "/status",
                        { status: "CLOSED", ...(note ? { reason: note } : {}) },
                        "PATCH",
                      )
                    }
                  >
                    Close work order
                  </Button>
                )}
                {staff && editable && (
                  <Button
                    variant="secondary"
                    busy={action.isPending}
                    disabled={note.trim().length < 2}
                    onClick={() =>
                      send(
                        "/status",
                        { status: "CANCELLED", reason: note },
                        "PATCH",
                      )
                    }
                  >
                    Cancel work order
                  </Button>
                )}
              </div>
              {accepted && order.status === "IN_PROGRESS" && (
                <div className="workflow-form">
                  <label>
                    Progress (%)
                    <input
                      type="number"
                      min={order.progress}
                      max={99}
                      value={percent}
                      onChange={(e) => setPercent(e.target.valueAsNumber)}
                    />
                  </label>
                  <Button
                    variant="secondary"
                    busy={action.isPending}
                    disabled={
                      note.trim().length < 2 ||
                      !Number.isInteger(percent) ||
                      percent < order.progress ||
                      percent > 99
                    }
                    onClick={() => send("/progress", { percent, note })}
                  >
                    Save progress update
                  </Button>
                </div>
              )}
              {!editable &&
                order.status !== "COMPLETED" &&
                order.status !== "VERIFIED" && (
                  <p className="muted">
                    This work order is complete. Its history remains available
                    below.
                  </p>
                )}
            </section>
          )}
          {staff && editable && (
            <OrderScheduleEditor key={`${order.id}-${order.version}`} id={order.id} version={order.version}
              scheduledAt={order.scheduledAt} plannedEndAt={order.plannedEndAt}
              estimatedDurationMinutes={order.estimatedDurationMinutes} requiredSkills={order.requiredSkills}/>
          )}
          {assigned && accepted && order.status === "IN_PROGRESS" && (
            <LocationSharing workOrderId={order.id} />
          )}
          <section className="workflow-card">
            <h2>Photo evidence</h2>
            <p className="muted">
              Before and after photos are required for the current assignment.
            </p>
            {accepted && editable && (
              <form
                className="workflow-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!file) return;
                  const body = new FormData();
                  body.set("file", file);
                  body.set("kind", kind);
                  body.set("expectedVersion", String(order.version));
                  action.mutate({ path: `/work-orders/${id}/photos`, body });
                }}
              >
                <label>
                  Photo stage
                  <select
                    aria-label="Photo stage"
                    value={kind}
                    onChange={(e) =>
                      setKind(e.target.value as "BEFORE" | "AFTER")
                    }
                  >
                    <option value="BEFORE">Before work</option>
                    {order.status === "IN_PROGRESS" && (
                      <option value="AFTER">After work</option>
                    )}
                  </select>
                </label>
                <label>
                  Image (JPEG, PNG or WebP · up to 5 MB)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const selected = e.target.files?.[0];
                      if (selected && selected.size > 5 * 1024 * 1024) {
                        useUi
                          .getState()
                          .notify("Choose an image smaller than 5 MB.");
                        e.target.value = "";
                        setFile(null);
                      } else setFile(selected ?? null);
                    }}
                  />
                </label>
                <Button busy={action.isPending} disabled={!file} type="submit">
                  Upload photo
                </Button>
              </form>
            )}
            <div className="photo-grid">
              {order.attachments
                .filter((p) => p.kind)
                .map((p) => (
                  <Photo
                    key={p.id}
                    id={p.id}
                    kind={`${p.kind}${p.assignmentId !== assignment?.id && assignment ? " · Previous assignment" : ""}`}
                  />
                ))}
            </div>
          </section>
        </div>
        <aside>
          <section className="workflow-card">
            <h2>Assignments</h2>
            {order.assignments.map((a) => (
              <p key={a.id}>
                <strong>{a.technician.membership.user.displayName}</strong>
                <br />
                <span className="muted">
                  {a.status.toLowerCase()}
                  {a.acceptedAt
                    ? ` · Accepted ${new Date(a.acceptedAt).toLocaleString()}`
                    : " · Awaiting acceptance"}
                </span>
              </p>
            ))}
            {!order.assignments.length && (
              <p className="muted">Choose a technician to get started.</p>
            )}
          </section>
          <section className="workflow-card">
            <h2>Activity history</h2>
            <ol className="workflow-timeline">
              {order.activity.map((a) => (
                <li key={a.id}>
                  <strong>
                    {a.action === "WORK_ORDER_STATUS_CHANGED" &&
                    typeof a.metadata?.toStatus === "string"
                      ? `Status: ${a.metadata.toStatus.replaceAll("_", " ").toLowerCase()}`
                      : a.action.replaceAll("_", " ").toLowerCase()}
                  </strong>
                  <span>{a.actor.user.displayName}</span>
                  {typeof a.metadata?.reason === "string" && (
                    <p>{a.metadata.reason}</p>
                  )}
                  <time dateTime={a.createdAt}>
                    {new Date(a.createdAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
          </section>
          <section className="workflow-card">
            <h2>Progress notes</h2>
            {order.progressUpdates.map((p) => (
              <p key={p.id}>
                <strong>{p.percent}%</strong> · {p.note}
              </p>
            ))}
            {!order.progressUpdates.length && (
              <p className="muted">No progress notes yet.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
