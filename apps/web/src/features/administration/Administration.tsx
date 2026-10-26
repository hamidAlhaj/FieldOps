import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { http } from "../../services/http";
import { orgPath } from "../../services/workflow";
import { isDemo } from "../../services";
import { useSession, useMembership, useUi } from "../../state/store";
import { Button, ErrorState, Skeleton } from "../../components/ui";
const member = z.object({
  id: z.string(),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  role: z.object({
    name: z.enum(["ADMIN", "DISPATCHER", "TECHNICIAN", "CUSTOMER"]),
  }),
  user: z.object({
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
  }),
});
const members = z.object({
  items: z.array(member),
  total: z.number(),
  page: z.number(),
});
const teams = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    members: z.array(
      z.object({
        membershipId: z.string(),
        membership: z.object({ user: z.object({ displayName: z.string() }) }),
      }),
    ),
  }),
);
export function Administration() {
  if (isDemo || useMembership()?.role.name !== "ADMIN")
    return <Navigate to="/" replace />;
  return <AdminContent />;
}
function AdminContent() {
  const org = useSession((s) => s.organizationId);
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [email, setEmail] = useState("");
  const [addRole, setAddRole] = useState("TECHNICIAN");
  const [teamName, setTeamName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [selected, setSelected] = useState("");
  const q = useQuery({
    queryKey: ["members", org, search, role, status, page],
    queryFn: ({ signal }) =>
      http(
        `${orgPath(org)}/administration/members?${new URLSearchParams({ search, page: String(page), ...(role ? { role } : {}), ...(status ? { status } : {}) })}`,
        members,
        { signal },
      ),
  });
  const t = useQuery({
    queryKey: ["teams", org],
    queryFn: ({ signal }) => http(`${orgPath(org)}/teams`, teams, { signal }),
  });
  const organization = useQuery({
    queryKey: ["organization", org],
    queryFn: () =>
      http(
        `${orgPath(org)}/administration/organization`,
        z.object({ name: z.string() }),
      ),
  });
  const mutate = useMutation({
    mutationFn: ({
      path,
      body,
      method = "POST",
    }: {
      path: string;
      body?: object;
      method?: string;
    }) =>
      http(`${orgPath(org)}${path}`, z.unknown(), {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: async () => {
      await cache.invalidateQueries();
      useUi.getState().notify("Saved.");
    },
    onError: (e) => useUi.getState().notify(e.message),
  });
  return (
    <div className="workflow-page">
      <header>
        <p className="eyebrow">ORGANIZATION ADMINISTRATION</p>
        <h1>People & teams</h1>
      </header>
      <section className="workflow-card workflow-form">
        <h2>Organization settings</h2>
        <p>{organization.data?.name}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutate.mutate({
              path: "/administration/organization",
              method: "PATCH",
              body: { name: orgName },
            });
          }}
        >
          <label>
            Organization name
            <input
              required
              minLength={2}
              maxLength={160}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </label>
          <Button busy={mutate.isPending} type="submit">
            Save organization name
          </Button>
        </form>
      </section>
      <section className="workflow-card workflow-form">
        <h2>Add a registered user</h2>
        <p className="muted">
          Enter the email of an existing account to add an organization
          membership.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutate.mutate({
              path: "/users",
              body: { email, role: addRole, status: "ACTIVE" },
            });
          }}
        >
          <label>
            Account email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Membership role
            <select
              aria-label="Membership role"
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
            >
              {["ADMIN", "DISPATCHER", "TECHNICIAN", "CUSTOMER"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <Button type="submit" busy={mutate.isPending}>
            Add membership
          </Button>
        </form>
      </section>
      <section className="workflow-card workflow-form">
        <h2>Users</h2>
        <label>
          Search name or email
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Filter role
          <select
            aria-label="Filter role"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            {["ADMIN", "DISPATCHER", "TECHNICIAN", "CUSTOMER"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Filter membership status
          <select
            aria-label="Filter membership status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option>ACTIVE</option>
            <option>SUSPENDED</option>
          </select>
        </label>
        {q.isPending ? (
          <Skeleton />
        ) : q.isError ? (
          <ErrorState retry={() => void q.refetch()} />
        ) : (
          <>
            {!q.data.items.length && <p>No matching members.</p>}
            {q.data.items.map((m) => (
              <article key={m.id} className="workflow-card">
                <strong>{m.user.displayName}</strong>
                <p>{m.user.email}</p>
                <label>
                  Role for {m.user.displayName}
                  <select
                    aria-label={`Role for ${m.user.displayName}`}
                    disabled={mutate.isPending}
                    value={m.role.name}
                    onChange={(e) =>
                      mutate.mutate({
                        path: `/users/${m.id}`,
                        method: "PATCH",
                        body: { role: e.target.value, status: m.status },
                      })
                    }
                  >
                    {["ADMIN", "DISPATCHER", "TECHNICIAN", "CUSTOMER"].map(
                      (r) => (
                        <option key={r}>{r}</option>
                      ),
                    )}
                  </select>
                </label>
                <Button
                  variant="secondary"
                  busy={mutate.isPending}
                  onClick={() =>
                    mutate.mutate({
                      path: `/users/${m.id}`,
                      method: "PATCH",
                      body: {
                        role: m.role.name,
                        status: m.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
                      },
                    })
                  }
                >
                  {m.status === "ACTIVE" ? "Suspend" : "Activate"}{" "}
                  {m.user.displayName}
                </Button>
              </article>
            ))}
            <div className="workflow-actions">
              <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span>
                Page {page} · {q.data.total} members
              </span>
              <Button
                disabled={page * 25 >= q.data.total || page >= 1000}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </section>
      <section className="workflow-card workflow-form">
        <h2>Teams</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutate.mutate({ path: "/teams", body: { name: teamName } });
          }}
        >
          <label>
            New team name
            <input
              minLength={2}
              maxLength={120}
              required
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
          </label>
          <Button type="submit" busy={mutate.isPending}>
            Create team
          </Button>
        </form>
        <label>
          Staff member to add
          <select
            aria-label="Staff member to add"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select from current filtered user page</option>
            {q.data?.items
              .filter(
                (m) => m.status === "ACTIVE" && m.role.name !== "CUSTOMER",
              )
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user.displayName}
                </option>
              ))}
          </select>
        </label>
        {t.isPending ? (
          <Skeleton />
        ) : t.isError ? (
          <ErrorState retry={() => void t.refetch()} />
        ) : (
          <>
            {!t.data.length && <p>No teams yet.</p>}
            {t.data.map((team) => (
              <Team
                key={team.id}
                team={team}
                busy={mutate.isPending}
                selected={selected}
                save={(path, body, method) =>
                  mutate.mutate({ path, body, method })
                }
              />
            ))}
          </>
        )}
      </section>
    </div>
  );
}
function Team({
  team,
  busy,
  selected,
  save,
}: {
  team: z.infer<typeof teams>[number];
  busy: boolean;
  selected: string;
  save: (path: string, body: object | undefined, method: string) => void;
}) {
  const [name, setName] = useState(team.name);
  return (
    <article className="workflow-card workflow-form">
      <label>
        Team name
        <input
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="workflow-actions">
        <Button
          disabled={name.trim().length < 2}
          busy={busy}
          onClick={() => save(`/teams/${team.id}`, { name }, "PATCH")}
        >
          Rename team
        </Button>
        <Button
          disabled={!selected}
          busy={busy}
          onClick={() =>
            save(
              `/administration/teams/${team.id}/members`,
              { membershipId: selected },
              "POST",
            )
          }
        >
          Add selected staff
        </Button>
        <Button
          variant="secondary"
          busy={busy}
          onClick={() => {
            if (window.confirm(`Delete team ${team.name}?`))
              save(`/teams/${team.id}`, undefined, "DELETE");
          }}
        >
          Delete team
        </Button>
      </div>
      {team.members.map((m) => (
        <p key={m.membershipId}>
          {m.membership.user.displayName}{" "}
          <Button
            variant="secondary"
            busy={busy}
            onClick={() =>
              save(
                `/administration/teams/${team.id}/members/${m.membershipId}`,
                undefined,
                "DELETE",
              )
            }
          >
            Remove member
          </Button>
        </p>
      ))}
    </article>
  );
}
