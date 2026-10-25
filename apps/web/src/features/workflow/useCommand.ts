import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession, useUi } from "../../state/store";
import { command } from "../../services/workflow";
export function useCommand() {
  const org = useSession((s) => s.organizationId);
  const query = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      body,
      method,
    }: {
      path: string;
      body: object | FormData;
      method?: string;
    }) => command(org, path, body, method),
    onSuccess: async () => {
      await query.invalidateQueries();
      useUi.getState().notify("Saved. Workspace updated.");
    },
    onError: async (e) => {
      useUi.getState().notify(e.message);
      await query.invalidateQueries();
    },
  });
}
