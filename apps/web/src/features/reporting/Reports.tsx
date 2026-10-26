import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useMembership, useSession } from "../../state/store";
import { http } from "../../services/http";
import { orgPath } from "../../services/workflow";
import { Button, ErrorState, Skeleton } from "../../components/ui";
import { isDemo } from "../../services";
const analyticsSchema = z.object({
  completed: z.number(),
  closed: z.number(),
  averageResolutionHours: z.number().nullable(),
  overdue: z.number(),
  trends: z.array(z.object({ day: z.string(), completed: z.number() })),
  workload: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      activeAssignments: z.number(),
    }),
  ),
});
const auditSchema = z.object({
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  items: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      createdAt: z.string(),
      actor: z.object({ user: z.object({ displayName: z.string() }) }),
    }),
  ),
});
export function Reports({ audit = false }: { audit?: boolean }) {
  const role = useMembership()?.role.name;
  if (
    isDemo ||
    (audit ? role !== "ADMIN" : !["ADMIN", "DISPATCHER"].includes(role ?? ""))
  )
    return <Navigate to="/" replace />;
  return <ReportContent key={String(audit)} audit={audit} />;
}
function ReportContent({ audit }: { audit: boolean }) {
  const [from, setFrom] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  );
  const [action, setAction] = useState("");
  const [resourceId, setResource] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  return (
    <div className="workflow-page">
      <header>
        <p className="eyebrow">ORGANIZATION INSIGHTS</p>
        <h1>{audit ? "Audit log" : "Analytics & reports"}</h1>
        <p className="muted">
          {audit
            ? "An immutable record of important workspace actions."
            : "Verified database metrics for your organization."}
        </p>
      </header>
      <form
        className="workflow-card workflow-form"
        onSubmit={(e) => {
          e.preventDefault();
          const params = new URLSearchParams({
            from: `${from}T00:00:00.000Z`,
            to: `${to}T00:00:00.000Z`,
          });
          if (audit && action) params.set("action", action);
          if (audit && resourceId) params.set("resourceId", resourceId);
          setFilter(params.toString());
          setPage(1);
        }}
      >
        <label>
          From (UTC, inclusive)
          <input
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To (UTC, exclusive)
          <input
            type="date"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {audit && (
          <>
            <label>
              Exact action
              <input
                maxLength={120}
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="WORK_ORDER_STATUS_CHANGED"
              />
            </label>
            <label>
              Resource UUID
              <input
                value={resourceId}
                onChange={(e) => setResource(e.target.value)}
              />
            </label>
          </>
        )}
        <Button type="submit">Apply filters</Button>
        <p className="muted">Default: last 30 days. Maximum range: 366 days.</p>
      </form>
      {audit ? (
        <Audit filter={filter} page={page} setPage={setPage} />
      ) : (
        <Analytics filter={filter} />
      )}
    </div>
  );
}
function Analytics({ filter }: { filter: string }) {
  const org = useSession((s) => s.organizationId);
  const q = useQuery({
    queryKey: ["analytics", org, filter],
    queryFn: ({ signal }) =>
      http(`${orgPath(org)}/analytics?${filter}`, analyticsSchema, { signal }),
    staleTime: 30000,
  });
  if (q.isPending) return <Skeleton />;
  if (q.isError) return <ErrorState retry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <>
      <div className="metrics-grid">
        {[
          ["Completed work orders", d.completed],
          ["Closed work orders", d.closed],
          [
            "Average resolution (hours)",
            d.averageResolutionHours?.toFixed(1) ?? "—",
          ],
          ["Overdue starts now", d.overdue],
        ].map(([name, value]) => (
          <article className="metric neutral" key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <p className="muted">
        Resolution measures creation to closure for orders closed in the
        selected range. Completed counts use completion time. Overdue counts
        currently unfinished orders whose scheduled start has passed; workload
        is current, independent of the date range.
      </p>
      <section className="workflow-card">
        <h2>Daily completion trend · UTC</h2>
        {!d.trends.length ? (
          <p>No completions in this period.</p>
        ) : (
          <table className="job-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {d.trends.map((t) => (
                <tr key={t.day}>
                  <td>{t.day}</td>
                  <td>{t.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="workflow-card">
        <h2>Technician workload</h2>
        <p className="muted">
          Current active assignments · up to 100 technicians
        </p>
        {!d.workload.length ? (
          <p>No technicians yet.</p>
        ) : (
          <table className="job-table">
            <thead>
              <tr>
                <th>Technician</th>
                <th>Active assignments</th>
              </tr>
            </thead>
            <tbody>
              {d.workload.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.activeAssignments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
function Audit({
  filter,
  page,
  setPage,
}: {
  filter: string;
  page: number;
  setPage: (page: number) => void;
}) {
  const org = useSession((s) => s.organizationId);
  const q = useQuery({
    queryKey: ["audit", org, filter, page],
    queryFn: ({ signal }) =>
      http(`${orgPath(org)}/audit-logs?${filter}&page=${page}`, auditSchema, {
        signal,
      }),
  });
  if (q.isPending) return <Skeleton />;
  if (q.isError) return <ErrorState retry={() => void q.refetch()} />;
  return (
    <section className="workflow-card">
      <h2>Activity records</h2>
      {!q.data.items.length ? (
        <p>No matching actions.</p>
      ) : (
        <div className="table-scroll">
          <table className="job-table">
            <thead>
              <tr>
                <th>Time · UTC</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((a) => (
                <tr key={a.id}>
                  <td>{a.createdAt}</td>
                  <td>{a.actor.user.displayName}</td>
                  <td>{a.action}</td>
                  <td>
                    {a.entityType}
                    <br />
                    {a.entityId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="workflow-actions">
        <Button
          variant="secondary"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} · {q.data.total} records
        </span>
        <Button
          variant="secondary"
          disabled={page * q.data.pageSize >= q.data.total || page >= 1000}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
