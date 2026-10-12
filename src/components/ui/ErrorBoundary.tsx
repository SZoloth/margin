import { Component, type ErrorInfo, type ReactNode } from "react";
import { SettingsButton } from "@/components/settings/SettingsButton";
import { copyDiagnostics, reportToLog } from "@/lib/crash-reporting";
import { revealLogsDir } from "@/lib/tauri-commands";

interface State {
  error: Error | null;
  copied: boolean;
}

/**
 * Last line of defense. A render error anywhere below this would otherwise
 * leave a blank window; this logs it and offers a way forward. It sits
 * outside App, so it uses only plain components and Tauri commands.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportToLog("react-error-boundary", error);
    if (info.componentStack) {
      reportToLog("react-component-stack", new Error(info.componentStack));
    }
  }

  private handleCopy = async () => {
    try {
      await copyDiagnostics();
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex h-screen items-center justify-center bg-[var(--color-page)] px-8"
      >
        <div className="max-w-[420px]">
          <h1 className="text-[length:var(--text-2xl)] font-light text-[var(--color-text-primary)]">
            Margin hit a problem
          </h1>
          <p className="mt-4 text-[length:var(--text-base)] leading-relaxed text-[var(--color-text-secondary)]">
            Your highlights, notes and rules are stored on this Mac and weren't
            touched. Reloading usually clears it. If it keeps happening, copy the
            diagnostics and send them along with what you were doing.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <button
              ref={(el) => el?.focus()}
              type="button"
              onClick={() => window.location.reload()}
              className="cursor-pointer rounded-[var(--radius-sm)] bg-[var(--color-text-primary)] px-3.5 py-1.5 text-[length:var(--text-xs)] font-medium text-[var(--color-page)] transition-opacity duration-150 hover:opacity-85"
            >
              Reload Margin
            </button>
            <SettingsButton onClick={this.handleCopy}>
              {this.state.copied ? "Copied" : "Copy diagnostics"}
            </SettingsButton>
            <SettingsButton onClick={() => void revealLogsDir().catch(() => {})}>
              Show logs
            </SettingsButton>
          </div>
        </div>
      </div>
    );
  }
}
