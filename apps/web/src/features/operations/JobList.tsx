import { useNavigate } from "react-router-dom";
import { isDemo } from "../../services";
import { useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Badge, Button, EmptyState, Modal } from "../../components/ui";
import { Job, statuses, statusLabels } from "../../services/contracts";
export function filterJobs(jobs: Job[], search: string, status: string) {
  const term = search.trim().toLowerCase();
  return jobs.filter(
    (job) =>
      (status === "ALL" || job.status === status) &&
      `${job.title} ${job.reference} ${job.address} ${job.technician ?? ""}`
        .toLowerCase()
        .includes(term),
  );
}
export function JobList({
  jobs,
  compact = false,
  customer = false,
}: {
  jobs: Job[];
  compact?: boolean;
  customer?: boolean;
}) {
  const navigate = useNavigate();
  const openJob = (job: Job) =>
    isDemo
      ? setSelected(job)
      : navigate(`/${customer ? "requests" : "work-orders"}/${job.id}`);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Job | null>(null);
  const filtered = filterJobs(jobs, search, status);
  const size = compact ? 5 : 8;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * size, current * size);
  return (
    <>
      <div className="list-toolbar">
        <label className="search-field">
          <Search size={17} />
          <span className="sr-only">
            Search {customer ? "requests" : "work orders"}
          </span>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={`Search ${customer ? "requests" : "work orders"}…`}
          />
          <kbd aria-hidden="true">⌕</kbd>
        </label>
        <label className="filter-field">
          <SlidersHorizontal size={16} />
          <span className="sr-only">Filter by status</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All statuses</option>
            {statuses
              .filter((s) => jobs.some((j) => j.status === s))
              .map((s) => (
                <option value={s} key={s}>
                  {statusLabels[s]}
                </option>
              ))}
          </select>
        </label>
      </div>
      {!rows.length ? (
        <EmptyState
          title={jobs.length ? "No matching results" : "A fresh start"}
          action={
            jobs.length ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch("");
                  setStatus("ALL");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        >
          {jobs.length
            ? "Try another search or choose a different status."
            : `Your ${customer ? "maintenance requests" : "work orders"} will appear here as work gets underway.`}
        </EmptyState>
      ) : (
        <>
          <div className="table-scroll">
            <table className="job-table">
              <caption className="sr-only">
                {customer ? "Maintenance requests" : "Work orders"} matching the
                current filters
              </caption>
              <thead>
                <tr>
                  <th scope="col">{customer ? "Request" : "Work order"} </th>
                  <th scope="col">Status</th>
                  <th scope="col" className="priority-col">
                    Priority
                  </th>
                  <th scope="col" className="assignee-col">
                    {customer ? "Submitted" : "Assigned to"}
                  </th>
                  <th scope="col">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <span className="job-reference">{job.reference}</span>
                      <button
                        className="job-title"
                        onClick={() => openJob(job)}
                      >
                        {job.title}
                      </button>
                      <span className="job-location">
                        <MapPin size={11} />
                        {job.address}
                      </span>
                    </td>
                    <td>
                      <Badge status={job.status} />
                    </td>
                    <td className="priority-col">
                      <span
                        className={`priority priority-${job.priority?.toLowerCase() ?? "none"}`}
                      >
                        <span />{" "}
                        {job.priority?.toLowerCase() ?? "Not specified"}
                      </span>
                    </td>
                    <td className="assignee-col">
                      {customer ? (
                        <span className="muted">
                          {new Date(job.createdAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      ) : (
                        <span className="assignee">
                          {job.technician &&
                            job.technician !== "Unassigned" && (
                              <span className="mini-avatar">
                                {job.technician
                                  .split(" ")
                                  .map((s) => s[0])
                                  .join("")}
                              </span>
                            )}
                          {job.technician ?? "Not included in this view"}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        className="row-action"
                        aria-label={`View ${job.reference}`}
                        onClick={() => openJob(job)}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              {(current - 1) * size + 1}–
              {Math.min(current * size, filtered.length)} of {filtered.length}{" "}
              {customer ? "requests" : "work orders"}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Previous page"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span aria-live="polite">
                {current} <span className="muted">/ {pages}</span>
              </span>
              <button
                className="icon-button"
                aria-label="Next page"
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
      <Modal
        title={selected?.title ?? "Work details"}
        description={selected?.reference ?? ""}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {selected && (
          <>
            <div className="detail-summary">
              <Badge status={selected.status} />
              <span className="priority">
                {selected.priority
                  ? `${selected.priority.toLowerCase()} priority`
                  : "Priority not specified"}
              </span>
            </div>
            <p>{selected.description}</p>
            <dl className="detail-grid">
              <div>
                <dt>Site</dt>
                <dd>{selected.address}</dd>
              </div>
              <div>
                <dt>Scheduled</dt>
                <dd>
                  {selected.scheduledAt
                    ? new Date(selected.scheduledAt).toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "Not scheduled"}
                </dd>
              </div>
              {selected.technician && (
                <div>
                  <dt>Technician</dt>
                  <dd>{selected.technician}</dd>
                </div>
              )}
            </dl>
            <p className="detail-note">
              Read-only overview. Assignment and progress controls are coming in
              a later release.
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
