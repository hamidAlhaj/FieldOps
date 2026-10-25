import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./ui";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Report sanitized diagnostics through a future observability provider. */
  }
  render() {
    return this.state.failed ? (
      <main className="boot-screen" role="alert">
        <h1>Let’s get you back on track.</h1>
        <p>The workspace couldn’t display this page.</p>
        <Button onClick={() => window.location.reload()}>
          Reload workspace
        </Button>
      </main>
    ) : (
      this.props.children
    );
  }
}
