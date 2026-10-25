import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, ErrorState } from "../../components/ui";
import { useMembership, useSession } from "../../state/store";
import { http } from "../../services/http";
import { useCommand } from "./useCommand";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { orgPath, recordSchema } from "../../services/workflow";
import { JobList } from "../operations/JobList";
const requestForm = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(10000),
  address: z.string().trim().min(2).max(500),
});
export function Requests() {
  const org = useSession((s) => s.organizationId);
  const customer = useMembership()?.role.name === "CUSTOMER";
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const mutate = useCommand();
  const form = useForm<z.infer<typeof requestForm>>({
    resolver: zodResolver(requestForm),
  });
  const data = useQuery({
    queryKey: ["requests", org],
    queryFn: ({ signal }) =>
      http(
        `${orgPath(org)}/requests`,
        z.array(recordSchema.extend({ address: z.string() })),
        { signal },
      ),
  });
  return (
    <div className="workflow-page">
      <header className="workflow-heading">
        <div>
          <p className="eyebrow">SERVICE INTAKE</p>
          <h1>{customer ? "My maintenance requests" : "Request inbox"}</h1>
          <p className="muted">
            A clear path from the first report to verified work.
          </p>
        </div>
        {customer && (
          <Button onClick={() => setCreating(!creating)}>
            {creating ? "Back to requests" : "New request"}
          </Button>
        )}
      </header>
      {creating && (
        <form
          className="workflow-card workflow-form"
          onSubmit={form.handleSubmit((values) =>
            mutate.mutate(
              { path: "/requests", body: values },
              { onSuccess: (result) => navigate(`/requests/${result.id}`) },
            ),
          )}
        >
          <h2>Tell us what needs attention</h2>
          {(["title", "address", "description"] as const).map((field) => (
            <label key={field}>
              {field === "title"
                ? "Request title"
                : field === "address"
                  ? "Service address"
                  : "Describe the issue"}
              {field === "description" ? (
                <textarea
                  {...form.register(field)}
                  rows={4}
                  aria-invalid={!!form.formState.errors[field]}
                />
              ) : (
                <input
                  {...form.register(field)}
                  aria-invalid={!!form.formState.errors[field]}
                />
              )}
              <span className="field-error" role="alert">
                {form.formState.errors[field]?.message}
              </span>
            </label>
          ))}
          <Button busy={mutate.isPending} type="submit">
            Submit request
          </Button>
        </form>
      )}
      <section className="workflow-card">
        {data.isPending ? (
          <p role="status">Loading requests…</p>
        ) : data.isError ? (
          <ErrorState retry={() => void data.refetch()} />
        ) : (
          <JobList
            customer
            jobs={data.data.map((r) => ({
              ...r,
              status: r.status,
              reference: `REQ-${r.id.slice(0, 8).toUpperCase()}`,
              priority: null,
              technician: undefined,
              scheduledAt: null,
            }))}
          />
        )}
      </section>
    </div>
  );
}
