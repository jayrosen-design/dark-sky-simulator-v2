import { Component, type ReactNode } from "react";
import { isChunkLoadError, reloadForNewBuild } from "../staleBuild";

/** Keeps one broken panel from blanking the whole app; shows the error instead. */
export default class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (isChunkLoadError(error)) reloadForNewBuild();
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (isChunkLoadError(this.state.error)) {
      return (
        <div role="alert" className="rounded-lg border border-amber-400/50 bg-amber-400/10 p-3 text-sm text-amber-300">
          <p className="font-semibold">A new version of the simulator was published.</p>
          <p className="mt-1 text-xs">Reload the page to load it; your scenario is kept in the link.</p>
          <button className="mt-2 rounded bg-amber-400 px-2 py-1 text-xs font-semibold text-ink-950" onClick={() => location.reload()}>Reload</button>
        </div>
      );
    }
    return (
      <div role="alert" className="rounded-lg border border-red-400/50 bg-red-400/10 p-3 text-sm text-red-300">
        <p className="font-semibold">The {this.props.label} panel hit an error.</p>
        <p className="mt-1 font-mono text-xs">{this.state.error.message}</p>
        <button className="mt-2 rounded bg-ink-700 px-2 py-1 text-xs text-star-100" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
