import { Component, type ReactNode } from "react";

/** Keeps one broken panel from blanking the whole app; shows the error instead. */
export default class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded-lg border border-red-400/50 bg-red-400/10 p-3 text-sm text-red-300">
        <p className="font-semibold">The {this.props.label} panel hit an error.</p>
        <p className="mt-1 font-mono text-xs">{this.state.error.message}</p>
        <button className="mt-2 rounded bg-ink-700 px-2 py-1 text-xs text-star-100" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
