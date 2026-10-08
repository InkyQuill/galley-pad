import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; content: string; documentKey?: string };
type State = { error: Error | null };

/** Keeps document state in App alive when the editor fails. */
export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Galley Pad editor failed", error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.documentKey !== this.props.documentKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="startup-error" role="alert">
        <h1>The editor could not be displayed</h1>
        <p>Your document is still available below. You can copy it before retrying.</p>
        <pre>{this.state.error.message}</pre>
        <textarea aria-label="Document recovery text" readOnly value={this.props.content} />
        <button type="button" onClick={() => this.setState({ error: null })}>
          Retry editor
        </button>
      </section>
    );
  }
}
