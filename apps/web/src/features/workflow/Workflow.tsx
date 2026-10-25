import { EmptyState } from "../../components/ui";
export { Requests } from "./Requests";
export { RequestDetails } from "./RequestDetails";
export { WorkOrderDetails } from "./WorkOrderDetails";
export function DemoWorkflow() {
  return (
    <EmptyState title="Explore without changing data">
      Switch to the connected workspace to manage the maintenance lifecycle.
    </EmptyState>
  );
}
