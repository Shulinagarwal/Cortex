import React from "react";
import { AlertTriangle } from "lucide-react";
import SystemScreen from "./systemScreen";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught render error:", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <SystemScreen>
        <div className="p-3 rounded-full bg-zinc-900 border border-white/10 text-amber-400 mb-6">
          <AlertTriangle size={28} />
        </div>

        <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
        <p className="text-secondary-text mb-8 max-w-sm">
          The page hit an unexpected error. You can try again, or head back to the dashboard.
        </p>

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={this.handleRetry}
            className="px-6 py-3 bg-accent hover:opacity-90 transition-opacity text-white font-semibold rounded-lg"
          >
            Try Again
          </button>
          <a
            href="/"
            className="px-6 py-3 border border-white/10 hover:bg-zinc-900 transition-colors text-neutral-50 font-semibold rounded-lg"
          >
            Back to Dashboard
          </a>
        </div>

        <details
          className="w-full text-left"
          open={this.state.showDetails}
          onToggle={(e) => this.setState({ showDetails: e.target.open })}
        >
          <summary className="text-xs text-secondary-text cursor-pointer select-none">
            Error details
          </summary>
          <pre className="mt-2 text-xs text-secondary-text bg-zinc-900 border border-white/10 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap break-words">
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
        </details>
      </SystemScreen>
    );
  }
}

export default ErrorBoundary;
