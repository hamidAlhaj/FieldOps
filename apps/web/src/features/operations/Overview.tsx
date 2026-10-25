import { demoTeam } from "../../services/mocks/data";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  Clock3,
  Layers3,
  MoveUpRight,
  Radio,
} from "lucide-react";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui";
import { isDemo, service } from "../../services";
import { Job, Role, roleLabels } from "../../services/contracts";
import { useMembership, useSession } from "../../state/store";
import { JobList } from "./JobList";
export function useJobs() {
  const membership = useMembership();
  const organizationId = useSession((s) => s.organizationId);
  return useQuery({
    queryKey: ["jobs", organizationId, membership?.role.name],
    queryFn: ({ signal }) =>
      service.jobs(organizationId, membership!.role.name, signal),
    enabled: !!membership,
    staleTime: 30000,
  });
}
const titles: Record<Role, [string, string]> = {
  ADMIN: [
    "Your operation, in focus.",
    "A clear view of the work, the people, and what comes next.",
  ],
  DISPATCHER: [
    "Good work starts with a clear view.",
    "Keep your team moving and every job on the right track.",
  ],
  TECHNICIAN: [
    "Your next great day in the field.",
    "Your assignments, your schedule. Everything you need to get moving.",
  ],
  CUSTOMER: [
    "Your spaces. Taken care of.",
    "Stay close to your maintenance requests, from first report to resolution.",
  ],
};
function Metrics({ jobs, customer }: { jobs: Job[]; customer: boolean }) {
  const active = jobs.filter((j) =>
    ["IN_PROGRESS", "ACCEPTED"].includes(j.status),
  ).length;
  const done = jobs.filter((j) =>
    ["COMPLETED", "VERIFIED", "CLOSED", "RESOLVED"].includes(j.status),
  ).length;
  const waiting = jobs.filter((j) =>
    ["OPEN", "SUBMITTED"].includes(j.status),
  ).length;
  const metrics = [
    {
      title: customer ? "Total requests" : "Work orders",
      value: jobs.length,
      icon: Layers3,
      note: "In your current view",
      kind: "neutral",
    },
    {
      title: "In progress",
      value: active,
      icon: Radio,
      note: "Work is underway",
      kind: "purple",
    },
    {
      title: "Completed",
      value: done,
      icon: CheckCheck,
      note: "Moving things forward",
      kind: "green",
    },
    {
      title: customer ? "Awaiting review" : "Awaiting assignment",
      value: waiting,
      icon: Clock3,
      note: "Ready for the next step",
      kind: "amber",
    },
  ];
  return (
    <div className="metrics-grid">
      {metrics.map(({ title, value, icon: Icon, note, kind }) => (
        <article className={`metric ${kind}`} key={title}>
          <div>
            <span>{title}</span>
            <Icon size={18} />
          </div>
          <strong>{String(value).padStart(2, "0")}</strong>
          <p>
            <span className="metric-dot" />
            {note}
          </p>
        </article>
      ))}
    </div>
  );
}
function TeamPulse() {
  return (
    <section className="panel team-panel">
      <div className="panel-heading">
        <h2>Team pulse</h2>
        <span className="subtle-pill">3 people</span>
      </div>
      <p className="panel-intro">A small team. A big difference.</p>
      {demoTeam.map(([initials, name, state, color]) => (
        <div className="person" key={name}>
          <span className={`person-avatar ${color}`}>{initials}</span>
          <div>
            <strong>{name}</strong>
            <small>Field technician</small>
          </div>
          <span className={`person-state ${color}`}>{state}</span>
        </div>
      ))}
      <div className="team-note">
        <span />
        Team status shown for this demo.
      </div>
    </section>
  );
}
function Coverage() {
  return (
    <section className="coverage-panel">
      <div className="coverage-heading">
        <span className="eyebrow">CONNECTED IN THE FIELD</span>
        <span className="subtle-pill">Sample view</span>
      </div>
      <h2>
        Good people.
        <br />
        Great coverage.
      </h2>
      <p>Every site is part of the bigger picture.</p>
      <svg
        className="coverage-art"
        viewBox="0 0 300 145"
        role="img"
        aria-label="Illustration of three connected service sites, not a live map"
      >
        <path
          d="M-20 90 C80 0 80 170 220 20 S340 100 350 90 M-20 50 C80 160 170 -20 330 80 M40 -20 L180 170 M180 -20 L80 170 M280 -20 L220 170"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path
          d="M55 85 Q140 20 235 85"
          stroke="#8063c6"
          strokeWidth="2"
          strokeDasharray="5 6"
          fill="none"
        />
        {[
          [55, 85],
          [145, 49],
          [235, 85],
        ].map(([cx, cy]) => (
          <g key={cx}>
            <circle cx={cx} cy={cy} r="16" fill="#f8f5ff" stroke="#d8ceec" />
            <circle cx={cx} cy={cy} r="5" fill="#5637a6" />
          </g>
        ))}
      </svg>
      <div className="coverage-bottom">
        <span>Live tracking is coming next</span>
        <MoveUpRight size={18} />
      </div>
    </section>
  );
}
export function Overview() {
  const { user } = useSession();
  const member = useMembership();
  const role = member?.role.name ?? "ADMIN";
  const { data: jobs, isPending, isError, refetch } = useJobs();
  if (!member)
    return (
      <EmptyState title="No active organization">
        Your account is ready. Ask your organization administrator to add your
        membership, then sign in again.
      </EmptyState>
    );
  const path = role === "CUSTOMER" ? "/requests" : "/work-orders";
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow greeting">
            <span />
            {isDemo
              ? "SUNDAY, OCTOBER 25"
              : new Date()
                  .toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })
                  .toUpperCase()}
            <span className="greeting-divider">/</span>
            {roleLabels[role].toUpperCase()}
          </div>
          <h1>{titles[role][0]}</h1>
          <p>{titles[role][1]}</p>
        </div>
        <Link className="button primary" to={path}>
          View {role === "CUSTOMER" ? "requests" : "work orders"}
          <ArrowUpRight size={17} />
        </Link>
      </div>
      {isPending ? (
        <Skeleton />
      ) : isError ? (
        <ErrorState retry={() => void refetch()} />
      ) : (
        <>
          <Metrics jobs={jobs ?? []} customer={role === "CUSTOMER"} />
          <div className={`overview-grid ${!isDemo ? "single-column" : ""}`}>
            <section className="panel operations-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-eyebrow">THE DAY AT A GLANCE</span>
                  <h2>
                    {role === "TECHNICIAN"
                      ? "Your assigned work"
                      : role === "CUSTOMER"
                        ? "Your maintenance requests"
                        : "Your operations"}
                  </h2>
                </div>
                <Link className="text-link" to={path}>
                  View all <ArrowRight size={15} />
                </Link>
              </div>
              <div className="section-caption">
                <span className="selected-tab">
                  {role === "CUSTOMER" ? "Requests" : "All work orders"}
                  <span>{jobs?.length ?? 0}</span>
                </span>
                <span className="caption-note">
                  {isDemo ? "Sample activity" : "Loaded records · up to 100"}
                </span>
              </div>
              <JobList
                jobs={jobs ?? []}
                compact
                customer={role === "CUSTOMER"}
              />
            </section>
            {isDemo && (
              <aside className="insights-column">
                {role === "ADMIN" || role === "DISPATCHER" ? (
                  <TeamPulse />
                ) : (
                  <section className="panel welcome-panel">
                    <span className="eyebrow">A LITTLE CLARITY</span>
                    <h2>
                      {role === "TECHNICIAN"
                        ? "Focus on the work ahead."
                        : "We’re keeping you in the loop."}
                    </h2>
                    <p>
                      {role === "TECHNICIAN"
                        ? `Hi ${user?.displayName.split(" ")[0]}, this view shows only your active assignments.`
                        : "Every request in this view belongs to your account."}
                    </p>
                    <ArrowDownRight size={26} />
                  </section>
                )}
                <Coverage />
              </aside>
            )}
          </div>
        </>
      )}
      <div className="workspace-bottom-note">
        <span className="tiny-spark">✦</span> Every well-run day starts with a
        little clarity.
      </div>
    </>
  );
}
export function WorkList() {
  const role = useMembership()?.role.name;
  const { data, isPending, isError, refetch } = useJobs();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A PLACE FOR EVERY DETAIL</span>
          <h1>
            {role === "CUSTOMER"
              ? "Your maintenance requests."
              : "Work, well organized."}
          </h1>
          <p>Find the details you need and see where things stand.</p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>{role === "CUSTOMER" ? "Requests" : "Work orders"}</h2>
          <span className="subtle-pill">
            {isDemo ? "Sample workspace" : "Up to 100 records"}
          </span>
        </div>
        {isPending ? (
          <Skeleton />
        ) : isError ? (
          <ErrorState retry={() => void refetch()} />
        ) : (
          <JobList jobs={data ?? []} customer={role === "CUSTOMER"} />
        )}
      </section>
    </>
  );
}
