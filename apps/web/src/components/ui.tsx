import { ButtonHTMLAttributes, ReactNode, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Check, Inbox, LoaderCircle, X } from "lucide-react";
import { Status, statusLabels } from "../services/contracts";
import { useUi } from "../state/store";
export function Button({
  variant = "primary",
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button ${variant} ${props.className ?? ""}`}
      aria-busy={busy}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <span aria-hidden="true" />
      {statusLabels[status]}
    </span>
  );
}
export function Logo() {
  return (
    <span className="logo">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      fieldops<span className="brand-dot">®</span>
    </span>
  );
}
export function EmptyState({
  title = "Nothing here yet",
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Inbox size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function ErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <h3>We couldn’t load your workspace.</h3>
      <p>Please check your connection and try again.</p>
      <Button variant="secondary" onClick={retry}>
        Try again <ArrowRight size={16} />
      </Button>
    </div>
  );
}
export function Skeleton() {
  return (
    <div
      className="skeleton-list"
      aria-label="Loading work orders"
      role="status"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <div className="skeleton" key={n} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
export function Modal({
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description>{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Toast() {
  const { toast } = useUi();
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => useUi.setState({ toast: null }), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  return (
    <div
      className={`toast ${toast ? "visible" : ""}`}
      role="status"
      aria-live="polite"
    >
      {toast && (
        <>
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => useUi.setState({ toast: null })}
          >
            <X size={16} />
          </button>
        </>
      )}
    </div>
  );
}
